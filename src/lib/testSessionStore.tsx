import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from './settings';
import { v4 as uuidv4 } from 'uuid';
import { feedback } from './feedback';
import { logDataFootprint } from './metrics';
import { db, auth as firebaseAuth } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export interface TestSession {
    runId: string;
    activeRunId?: string; // For tracking recycled sessions
    type: 'test' | 'toolbox';
    deviceName: string;
    deviceUdid: string;
    testPath: string;
    logs: string[];
    status: 'running' | 'finished' | 'stopped' | 'error' | 'stopping';
    exitCode?: string;
    argumentsFile?: string | null;
    deviceModel?: string;
    androidVersion?: string;
    lastActiveTool?: string; // Persist active tool across mounts
    framework: 'robot' | 'maestro' | 'appium' | 'cypress' | 'selenium';
    timestampOutputs?: boolean;
    selectedTests?: string[];
    sessionEpoch: number; // Incremented on recycle to force RunConsole remount
    repopulatedTree?: any; // To avoid circular imports or complex types, using any for LogNode
    parsedDbPath?: string;
    outputDir?: string;
    outputXmlPath?: string;
    artifactPaths?: { log?: string, report?: string, output?: string };
    startTime: number;
    isAiAgent?: boolean;
    aiPrompt?: string;
}

interface TestOutputPayload {
    run_id: string;
    message: string;
}

interface TestFinishedPayload {
    run_id: string;
    exit_code: number;
}

interface TestSessionContextType {
    sessions: TestSession[];
    addSession: (runId: string, deviceUdid: string, deviceName: string, testPath: string, framework: 'robot' | 'maestro' | 'appium' | 'cypress' | 'selenium', timestampOutputs: boolean, outputDir?: string, argumentsFile?: string | null, deviceModel?: string, androidVersion?: string, selectedTests?: string[], isAiAgent?: boolean, aiPrompt?: string) => void;
    addToolboxSession: (deviceUdid: string, deviceName: string, deviceModel?: string, androidVersion?: string) => void; // New action
    rerunSession: (runId: string, rerunFailedFrom?: string) => Promise<void>;
    stopSession: (runId: string) => Promise<void>;
    clearSession: (runId: string) => void;
    activeSessionId: string | 'dashboard';
    setActiveSessionId: (id: string | 'dashboard') => void;
    setSessionActiveTool: (runId: string, tool: string) => void;
    setSessionTree: (runId: string, tree?: any, dbPath?: string, outputDir?: string, outputXmlPath?: string) => void;
    updateSessionArtifacts: (runId: string, paths: Partial<NonNullable<TestSession['artifactPaths']>>) => void;
    addSessionLog: (runId: string, message: string) => void;
    markSessionFinished: (runId: string, exitCode: string) => void;
    appiumRunning: boolean;
}

const TestSessionContext = createContext<TestSessionContextType | undefined>(undefined);

export function TestSessionProvider({ children }: { children: React.ReactNode }) {
    const [sessions, setSessions] = useState<TestSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | 'dashboard'>('dashboard');
    const [appiumRunning, setAppiumRunning] = useState(false);
    const { settings, activeProfileId } = useSettings();
    const isTestRunning = useMemo(() => sessions.some(s => s.status === 'running'), [sessions]);

    // Periodic Appium Status Check
    useEffect(() => {
        const checkAppium = async () => {
            try {
                const status = await invoke<{ running: boolean }>('get_appium_status', {
                    host: settings.appiumHost,
                    port: Number(settings.appiumPort),
                    is_test_running: isTestRunning
                });
                setAppiumRunning(status.running);
            } catch (e) {
                setAppiumRunning(false);
            }
        };

        checkAppium();
        const interval = setInterval(checkAppium, 10000); // Every 10 seconds
        return () => clearInterval(interval);
    }, [settings.appiumHost, settings.appiumPort, isTestRunning]);
    useEffect(() => {
        const unlistenOutputPromise = listen<TestOutputPayload>('test-output', (event) => {
            const { run_id, message } = event.payload;
            setSessions(prev => prev.map(s => {
                if (s.runId === run_id || s.activeRunId === run_id) {
                    return { ...s, logs: [...s.logs, message] };
                }
                return s;
            }));
        });

        const unlistenFinishedPromise = listen<TestFinishedPayload>('test-finished', (event) => {
            const { run_id, exit_code } = event.payload;
            
            // Find the session before state update to trigger side effects
            setSessions(prev => {
                const sessionToFinish = prev.find(s => s.runId === run_id || s.activeRunId === run_id);
                
                if (sessionToFinish) {
                    // Guard: if session was recycled and is already running a NEW test, skip stale event
                    if (sessionToFinish.activeRunId && sessionToFinish.activeRunId !== run_id && sessionToFinish.status === 'running') {
                        return prev;
                    }

                    // Side Effects (Outside state update logic)
                    if (exit_code === 0) {
                        feedback.notify('feedback.test_passed', 'feedback.details.device', { device: sessionToFinish.deviceName });
                    } else {
                        feedback.notify('feedback.test_failed', 'feedback.details.device', { device: sessionToFinish.deviceName });
                    }

                    // 1. Telemetry: Log the data footprint size
                    if (sessionToFinish.outputDir) {
                        logDataFootprint(sessionToFinish.outputDir);
                    }

                    // 2. Global History: Save a light summary to Firestore
                    const currentUser = firebaseAuth?.currentUser;
                    if (currentUser && db) {
                        const historyRef = collection(db, `users/${currentUser.uid}/history`);
                        
                        // Attempt to extract metrics from streaming logs
                        const lastLogs = sessionToFinish.logs.slice(-50).join('\n');
                        const passMatch = lastLogs.match(/Tests Passed:\s*(\d+)/i) || lastLogs.match(/PASS:\s*(\d+)/i);
                        const failMatch = lastLogs.match(/Tests Failed:\s*(\d+)/i) || lastLogs.match(/FAIL:\s*(\d+)/i);
                        
                        // Enhanced Duration capture
                        let duration = 'N/A';
                        const suiteEndMatch = lastLogs.match(/\[RR-SUITE-END\].*?\|\s*(\d+)\s*$/m);
                        if (suiteEndMatch) {
                            const ms = parseInt(suiteEndMatch[1]);
                            duration = ms > 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
                        } else {
                            const ms = Date.now() - sessionToFinish.startTime;
                            duration = ms > 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
                        }

                        const extractedSuiteName = sessionToFinish.testPath.split(/[\\/]/).pop()?.split('.')[0] || 'Unknown';
                        
                        addDoc(historyRef, {
                            runId: sessionToFinish.runId,
                            logsPath: activeProfileId,
                            testPath: sessionToFinish.testPath,
                            suiteName: extractedSuiteName,
                            status: exit_code === 0 ? 'passed' : 'failed',
                            exitCode: exit_code,
                            timestamp: serverTimestamp(),
                            deviceName: sessionToFinish.deviceName,
                            deviceModel: sessionToFinish.deviceModel || null,
                            deviceUdid: sessionToFinish.deviceUdid || null,
                            androidVersion: sessionToFinish.androidVersion || null,
                            framework: sessionToFinish.framework,
                            passCount: passMatch ? parseInt(passMatch[1]) : (exit_code === 0 ? 1 : 0),
                            failCount: failMatch ? parseInt(failMatch[1]) : (exit_code !== 0 ? 1 : 0),
                            duration: duration
                        }).catch(err => console.error("[Firebase] History sync failed:", err));
                    }
                }

                // Return updated state
                return prev.map(s => {
                    if (s.runId === run_id || s.activeRunId === run_id) {
                        if (s.activeRunId && s.activeRunId !== run_id && s.status === 'running') {
                            return s;
                        }
                        return {
                            ...s,
                            status: 'finished',
                            exitCode: String(exit_code),
                            activeRunId: undefined,
                            logs: [...s.logs, `\n[System] Finished: Exit Code: ${exit_code}`]
                        };
                    }
                    return s;
                });
            });
        });

        return () => {
            unlistenOutputPromise.then(f => f());
            unlistenFinishedPromise.then(f => f());
        };
    }, [activeProfileId, settings.paths.logs]);



    const addSession = useCallback((runId: string, deviceUdid: string, deviceName: string, testPath: string, framework: 'robot' | 'maestro' | 'appium' | 'cypress' | 'selenium', timestampOutputs: boolean, outputDir?: string, argumentsFile?: string | null, deviceModel?: string, androidVersion?: string, selectedTests?: string[], isAiAgent?: boolean, aiPrompt?: string) => {
        setSessions(prev => {
            // Check for recycling
            if (settings.recycleDeviceViews) {
                // Determine UDID for local if needed, though runId usually has it? No, passed explicitly.
                const targetUdid = deviceUdid;

                // Find existing session for this device
                const existingIndex = prev.findIndex(s => s.deviceUdid === targetUdid);
                if (existingIndex !== -1) {
                    // Update existing session
                    const updatedSessions = [...prev];
                    const existing = updatedSessions[existingIndex];

                    updatedSessions[existingIndex] = {
                        ...existing,
                        activeRunId: runId,
                        type: 'test',
                        testPath,
                        logs: [`[System] Starting test session: ${runId}`, `[System] Device: ${deviceName}`, `[System] Suite: ${testPath}`, '----------------------------------------'],
                        status: 'running',
                        outputDir,
                        argumentsFile,
                        deviceModel,
                        androidVersion,
                        framework,
                        timestampOutputs,
                        selectedTests,
                        exitCode: undefined,
                        repopulatedTree: undefined,
                        artifactPaths: {},
                        sessionEpoch: (existing.sessionEpoch || 0) + 1, // Force RunConsole remount
                        startTime: Date.now(),
                        isAiAgent,
                        aiPrompt
                    };

                    setTimeout(() => setActiveSessionId(existing.runId), 0); // Focus it
                    return updatedSessions;
                }
            }

            // Default behavior: Add new session
            setTimeout(() => setActiveSessionId(runId), 0);
            return [
                ...prev,
                {
                    runId,
                    type: 'test',
                    deviceUdid,
                    deviceName,
                    testPath,
                    framework,
                    timestampOutputs,
                    logs: [`[System] Starting test session: ${runId}`, `[System] Device: ${deviceName}`, `[System] Suite: ${testPath}`, '----------------------------------------'],
                    status: 'running',
                    outputDir,
                    argumentsFile: argumentsFile,
                    deviceModel,
                    androidVersion,
                    selectedTests,
                    sessionEpoch: 0,
                    startTime: Date.now(),
                    isAiAgent,
                    aiPrompt
                }
            ];
        });
        feedback.toast.info('feedback.test_started');
    }, [settings.recycleDeviceViews]);

    const addToolboxSession = useCallback((deviceUdid: string, deviceName: string, deviceModel?: string, androidVersion?: string) => {
        const runId = `toolbox-${deviceUdid}`;

        setSessions(prev => {
            // Check for recycling
            if (settings.recycleDeviceViews) {
                // Check if ANY session exists for this device (Test or Toolbox)
                const existing = prev.find(s => s.deviceUdid === deviceUdid);
                if (existing) {
                    setTimeout(() => setActiveSessionId(existing.runId), 0);
                    return prev;
                }
            }

            // Normal check (Toolbox duplicate)
            if (prev.find(s => s.runId === runId)) {
                setTimeout(() => setActiveSessionId(runId), 0);
                return prev;
            }

            setTimeout(() => setActiveSessionId(runId), 0);
            return [
                ...prev,
                {
                    runId,
                    type: 'toolbox',
                    deviceUdid,
                    deviceName,
                    testPath: 'Toolbox',
                    logs: [],
                    status: 'stopped',
                    deviceModel,
                    androidVersion,
                    framework: 'robot',
                    timestampOutputs: false,
                    sessionEpoch: 0,
                    startTime: Date.now()
                }
            ];
        });
    }, [settings.recycleDeviceViews]);

    const stopSession = useCallback(async (runId: string) => {
        const session = sessions.find(s => s.runId === runId);
        if (!session) return;

        // If it's a toolbox session, just close/stop it locally.
        // Even if activeRunId is set (stale from a previous run), if type is 'toolbox', we aren't running a test now.
        if (session.type === 'toolbox') {
            setSessions(prev => prev.map(s => {
                if (s.runId === runId) {
                    return { ...s, status: 'stopped', logs: [...s.logs, '\n[System] Toolbox session stopped.'] };
                }
                return s;
            }));
            return;
        }

        // Validate that we are actually in a state that requires backend stopping
        if (session.status !== 'running' && session.status !== 'stopping') {
            return;
        }

        // Use the active run ID (process ID) if available, otherwise the session ID
        const targetBackendId = session.activeRunId || runId;

        setSessions(prev => prev.map(s => {
            if (s.runId === runId) {
                return { 
                    ...s, 
                    status: 'stopping',
                    logs: [...s.logs, '\n[System] Graceful stop initiated. Waiting for reports...'] 
                };
            }
            return s;
        }));

        try {
            await invoke('stop_test', { runId: targetBackendId });
        } catch (e) {
            feedback.toast.error("session.stop_error", e);
            setSessions(prev => prev.map(s => {
                if (s.runId === runId) {
                    return { ...s, logs: [...s.logs, `\n[Error] Failed to stop: ${e}`] };
                }
                return s;
            }));
        }
    }, [sessions]);

    const rerunSession = useCallback(async (runId: string, rerunFailedFrom?: string) => {
        const session = sessions.find(s => s.runId === runId);
        if (!session || session.type !== 'test') return;

        const newRunId = uuidv4();
        // Reconstruct legacy folder if we have data, else generic
        let outputDir;
        if (session.deviceModel && session.androidVersion) {
            const cleanModel = session.deviceModel.replace(/[^a-zA-Z0-9]/g, "");
            const cleanVer = session.androidVersion.replace(/[^0-9.]/g, "");
            const cleanUdid = session.deviceUdid && session.deviceUdid !== 'local'
                ? session.deviceUdid.replace(/[^a-zA-Z0-9]/g, "")
                : "Local";

            const parts = session.testPath.split(/[\\/]/);
            const fileName = parts[parts.length - 1];
            const suiteName = fileName.split('.')[0].replace(/[^a-zA-Z0-9_-]/g, "");

            const legacyFolder = `A${cleanVer}_${cleanModel}_${cleanUdid}/${suiteName}`;
            outputDir = settings.paths.logs
                ? `${settings.paths.logs}/${legacyFolder}`
                : `../test_results/${legacyFolder}`;
        } else {
            outputDir = settings.paths.logs || "../test_results";
        }

        // Add new session immediately
        addSession(newRunId, session.deviceUdid, session.deviceName, session.testPath, session.framework, session.timestampOutputs || false, outputDir, session.argumentsFile, session.deviceModel, session.androidVersion, session.selectedTests);

        try {
            // Check Appium (Skip for Maestro)
            const fw = session.framework;
            if (fw !== 'maestro' && fw !== 'cypress' && fw !== 'selenium') {
                const status = await invoke<{ running: boolean }>('get_appium_status', {
                    host: settings.appiumHost,
                    port: Number(settings.appiumPort),
                    is_test_running: false // Just starting
                });
                if (!status.running) {
                    await invoke('start_appium_server', {
                        host: settings.appiumHost,
                        port: Number(settings.appiumPort),
                        basePath: settings.appiumBasePath,
                        args: settings.tools.appiumArgs
                    });
                    // Brief wait for stabilization
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            if (fw === 'robot') {
                await invoke("run_robot_test", {
                    runId: newRunId,
                    testPath: session.testPath === session.argumentsFile ? null : session.testPath,
                    outputDir: outputDir,
                    logs_path: settings.paths.logs,
                    device: session.deviceUdid === 'local' ? null : session.deviceUdid,
                    argumentsFile: session.argumentsFile,
                    deviceModel: session.deviceModel,
                    androidVersion: session.androidVersion,
                    workingDir: settings.paths.automationRoot,
                    rerunFailedFrom: rerunFailedFrom,
                    selectedTests: session.selectedTests
                });
            } else if (fw === 'maestro') {
                await invoke("run_maestro_test", {
                    runId: newRunId,
                    testPath: session.testPath,
                    outputDir: outputDir,
                    logs_path: settings.paths.logs,
                    device: session.deviceUdid === 'local' ? null : session.deviceUdid,
                    maestroArgs: settings.tools.maestroArgs,
                    working_dir: settings.paths.automationRoot,
                    timestampOutputs: session.timestampOutputs
                });
            } else if (fw === 'appium') {
                await invoke("run_appium_test", {
                    runId: newRunId,
                    projectPath: session.testPath,
                    outputDir: outputDir,
                    logs_path: settings.paths.logs,
                    appiumJavaArgs: settings.tools.appiumJavaArgs
                });
            } else if (fw === 'cypress') {
                await invoke("run_cypress_test", {
                    runId: newRunId,
                    testPath: session.testPath,
                    outputDir: outputDir,
                    browser: session.deviceUdid || 'chrome',
                    cypressArgs: settings.tools.cypressArgs,
                    workingDir: settings.paths.automationRoot
                });
            } else if (fw === 'selenium') {
                await invoke("run_selenium_test", {
                    runId: newRunId,
                    testPath: session.testPath,
                    outputDir: outputDir,
                    browser: session.deviceUdid || 'chrome',
                    seleniumArgs: settings.tools.seleniumArgs,
                    workingDir: settings.paths.automationRoot
                });
            }

        } catch (e) {
            feedback.toast.error("session.rerun_error", e);
            setSessions(prev => prev.map(s => {
                if (s.runId === newRunId) {
                    return { ...s, status: 'error', logs: [...s.logs, `\n[Error] Rerun failed: ${e}`] };
                }
                return s;
            }));
        }
    }, [sessions, settings, addSession]);

    const clearSession = useCallback((runId: string) => {
        setSessions(prev => {
            // Find session-to-be-removed index
            const index = prev.findIndex(s => s.runId === runId);
            const newSessions = prev.filter(s => s.runId !== runId);

            // If we are closing the ACTIVE session, switch to the left one
            if (activeSessionId === runId) {
                if (index > 0) {
                    // Switch to the session "to the left"
                    const prevSession = prev[index - 1];
                    // We must use setTimeout to avoid state update collision/warning if strictly necessary, 
                    // but usually safe. To be safe with the activeSessionId dependency:
                    setTimeout(() => setActiveSessionId(prevSession.runId), 0);
                } else {
                    // No left session? Switch to Dashboard (History)
                    setTimeout(() => setActiveSessionId('dashboard'), 0);
                }
            }
            return newSessions;
        });
    }, [activeSessionId]);

    const setSessionActiveTool = useCallback((runId: string, tool: string) => {
        setSessions(prev => prev.map(s => s.runId === runId ? { ...s, lastActiveTool: tool } : s));
    }, []);

    const setSessionTree = useCallback((runId: string, tree?: any, dbPath?: string, outputDir?: string, outputXmlPath?: string) => {
        setSessions(prev => prev.map(s => s.runId === runId ? { 
            ...s, 
            ...(tree !== undefined ? { repopulatedTree: tree } : {}),
            ...(dbPath !== undefined ? { parsedDbPath: dbPath } : {}),
            ...(outputDir !== undefined ? { outputDir } : {}),
            ...(outputXmlPath !== undefined ? { outputXmlPath } : {})
        } : s));
    }, []);

    const updateSessionArtifacts = useCallback((runId: string, paths: Partial<NonNullable<TestSession['artifactPaths']>>) => {
        setSessions(prev => prev.map(s => {
            if (s.runId === runId) {
                return { 
                    ...s, 
                    artifactPaths: { ...(s.artifactPaths || {}), ...paths }
                };
            }
            return s;
        }));
    }, []);

    const addSessionLog = useCallback((runId: string, message: string) => {
        setSessions(prev => prev.map(s => (s.runId === runId || s.activeRunId === runId) ? { ...s, logs: [...s.logs, message] } : s));
    }, []);

    const markSessionFinished = useCallback((runId: string, exitCode: string) => {
        setSessions(prev => prev.map(s => {
            if (s.runId === runId || s.activeRunId === runId) {
                return {
                    ...s,
                    status: 'finished',
                    exitCode,
                    activeRunId: undefined,
                    logs: [...s.logs, `\n[System] Finished: Exit Code: ${exitCode}`]
                };
            }
            return s;
        }));
    }, []);

    return (
        <TestSessionContext.Provider value={{ 
            sessions, addSession, addToolboxSession, stopSession, rerunSession, clearSession, 
            activeSessionId, setActiveSessionId, setSessionActiveTool, setSessionTree, updateSessionArtifacts,
            addSessionLog, markSessionFinished,
            appiumRunning
        }}>
            {children}
        </TestSessionContext.Provider>
    );
}

export function useTestSessions() {
    const context = useContext(TestSessionContext);
    if (context === undefined) {
        throw new Error('useTestSessions must be used within a TestSessionProvider');
    }
    return context;
}

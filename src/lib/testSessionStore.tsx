import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from './settings';
import { v4 as uuidv4 } from 'uuid';
import { feedback } from './feedback';

export interface TestSession {
    runId: string;
    activeRunId?: string; // New: For tracking recycled sessions
    type: 'test' | 'toolbox'; // New field
    deviceName: string;
    deviceUdid: string;
    testPath: string; // For toolbox, this might be "Toolbox" or empty
    logs: string[];
    status: 'running' | 'finished' | 'stopped' | 'error' | 'stopping';
    exitCode?: string;
    argumentsFile?: string | null;
    deviceModel?: string; // New
    androidVersion?: string; // New
    lastActiveTool?: string; // Persist active tool across mounts
    framework: 'robot' | 'maestro' | 'appium'; // New field
    timestampOutputs?: boolean; // New field
}

interface TestOutputPayload {
    run_id: string;
    message: string;
}

interface TestFinishedPayload {
    run_id: string;
    status: string;
}

interface TestSessionContextType {
    sessions: TestSession[];
    addSession: (runId: string, deviceUdid: string, deviceName: string, testPath: string, framework: 'robot' | 'maestro' | 'appium', timestampOutputs: boolean, argumentsFile?: string | null, deviceModel?: string, androidVersion?: string) => void;
    addToolboxSession: (deviceUdid: string, deviceName: string, deviceModel?: string, androidVersion?: string) => void; // New action
    rerunSession: (runId: string, rerunFailedFrom?: string) => Promise<void>;
    stopSession: (runId: string) => Promise<void>;
    clearSession: (runId: string) => void;
    activeSessionId: string | 'dashboard';
    setActiveSessionId: (id: string | 'dashboard') => void;
    setSessionActiveTool: (runId: string, tool: string) => void;
}

const TestSessionContext = createContext<TestSessionContextType | undefined>(undefined);

export function TestSessionProvider({ children }: { children: React.ReactNode }) {
    const [sessions, setSessions] = useState<TestSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | 'dashboard'>('dashboard');

    // Global Event Listener
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
            const { run_id, status } = event.payload;
            setSessions(prev => prev.map(s => {
                if (s.runId === run_id || s.activeRunId === run_id) {
                    // Feedback
                    // Backend sends "Exit Code: 0" for success
                    if (status.includes('Exit Code: 0') || status.includes('exit code: 0')) {
                        feedback.notify('feedback.test_passed', 'feedback.details.device', { device: s.deviceName });
                    } else {
                        feedback.notify('feedback.test_failed', 'feedback.details.device', { device: s.deviceName });
                    }

                    return {
                        ...s,
                        status: 'finished',
                        exitCode: status,
                        logs: [...s.logs, `\n[System] Finished: ${status}`]
                    };
                }
                return s;
            }));
        });

        return () => {
            unlistenOutputPromise.then(f => f());
            unlistenFinishedPromise.then(f => f());
        };
    }, []);

    const { settings } = useSettings();

    const addSession = useCallback((runId: string, deviceUdid: string, deviceName: string, testPath: string, framework: 'robot' | 'maestro' | 'appium', timestampOutputs: boolean, argumentsFile?: string | null, deviceModel?: string, androidVersion?: string) => {
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
                        activeRunId: runId, // Track the new test run ID
                        type: 'test',       // Switch to test view/mode (handled by ToolBox if we update it, but here we just set type)
                        // Ideally ToolBoxView should know if it's running a test to show console.
                        // The types field helps `TestsPage` show status icons.
                        testPath,
                        // Reset logs for new test
                        logs: [`[System] Starting test session: ${runId}`, `[System] Device: ${deviceName}`, `[System] Suite: ${testPath}`, '----------------------------------------'],
                        status: 'running',
                        argumentsFile,
                        deviceModel,
                        androidVersion,
                        framework,
                        timestampOutputs,
                        exitCode: undefined // clear previous exit code
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
                    argumentsFile: argumentsFile,
                    deviceModel,
                    androidVersion
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
                    framework: 'robot', // Default but not really used for toolbox
                    timestampOutputs: false
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
                return { ...s, logs: [...s.logs, '\n[System] Stopping...'] };
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
        addSession(newRunId, session.deviceUdid, session.deviceName, session.testPath, session.framework, session.timestampOutputs || false, session.argumentsFile, session.deviceModel, session.androidVersion);

        try {
            // Check Appium (Skip for Maestro)
            const fw = session.framework;
            if (fw !== 'maestro') {
                const status = await invoke<{ running: boolean }>('get_appium_status');
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
                    device: session.deviceUdid === 'local' ? null : session.deviceUdid,
                    argumentsFile: session.argumentsFile,
                    deviceModel: session.deviceModel,
                    androidVersion: session.androidVersion,
                    workingDir: settings.paths.automationRoot,
                    rerunFailedFrom: rerunFailedFrom
                });
            } else if (fw === 'maestro') {
                await invoke("run_maestro_test", {
                    runId: newRunId,
                    testPath: session.testPath,
                    outputDir: outputDir,
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
                    appiumJavaArgs: settings.tools.appiumJavaArgs
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
        setSessions(prev => prev.map(s => {
            if (s.runId === runId) {
                return { ...s, lastActiveTool: tool };
            }
            return s;
        }));
    }, []);

    return (
        <TestSessionContext.Provider value={{ sessions, addSession, addToolboxSession, stopSession, rerunSession, clearSession, activeSessionId, setActiveSessionId, setSessionActiveTool }}>
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

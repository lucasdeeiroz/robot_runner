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
    status: 'running' | 'finished' | 'stopped' | 'error';
    exitCode?: string;
    argumentsFile?: string | null;
    deviceModel?: string; // New
    androidVersion?: string; // New
    lastActiveTool?: string; // Persist active tool across mounts
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
    addSession: (runId: string, deviceUdid: string, deviceName: string, testPath: string, argumentsFile?: string | null, deviceModel?: string, androidVersion?: string) => void;
    addToolboxSession: (deviceUdid: string, deviceName: string) => void; // New action
    rerunSession: (runId: string) => Promise<void>;
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

    const addSession = useCallback((runId: string, deviceUdid: string, deviceName: string, testPath: string, argumentsFile?: string | null, deviceModel?: string, androidVersion?: string) => {
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
                        // Reset logs for new test? Yes.
                        logs: [`[System] Starting test session: ${runId}`, `[System] Device: ${deviceName}`, `[System] Suite: ${testPath}`, '----------------------------------------'],
                        status: 'running',
                        argumentsFile,
                        deviceModel,
                        androidVersion,
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

    const addToolboxSession = useCallback((deviceUdid: string, deviceName: string) => {
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
                    status: 'running'
                }
            ];
        });
    }, [settings.recycleDeviceViews]);

    const stopSession = useCallback(async (runId: string) => {
        try {
            await invoke('stop_robot_test', { runId });
            setSessions(prev => prev.map(s => {
                if (s.runId === runId) {
                    return { ...s, status: 'stopped', logs: [...s.logs, '\n[System] Stopped by user.'] };
                }
                return s;
            }));
        } catch (e) {
            console.error("Failed to stop session", e);
            setSessions(prev => prev.map(s => {
                if (s.runId === runId) {
                    return { ...s, logs: [...s.logs, `\n[Error] Failed to stop: ${e}`] };
                }
                return s;
            }));
        }
    }, []);

    const rerunSession = useCallback(async (runId: string) => {
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
        addSession(newRunId, session.deviceUdid, session.deviceName, session.testPath, session.argumentsFile, session.deviceModel, session.androidVersion);

        try {
            // Check Appium
            const status = await invoke<{ running: boolean }>('get_appium_status');
            if (!status.running) {
                await invoke('start_appium_server', {
                    host: settings.appiumHost,
                    port: settings.appiumPort,
                    args: settings.tools.appiumArgs
                });
                // Brief wait for stabilization
                await new Promise(r => setTimeout(r, 2000));
            }

            // Run Test
            console.log("Invoking run_robot_test for Re-run", {
                runId: newRunId,
                working_dir: settings.paths.automationRoot,
                outputDir
            });

            await invoke("run_robot_test", {
                runId: newRunId,
                testPath: session.testPath === session.argumentsFile ? null : session.testPath,
                outputDir: outputDir,
                device: session.deviceUdid === 'local' ? null : session.deviceUdid,
                argumentsFile: session.argumentsFile,
                deviceModel: session.deviceModel, // Pass deviceModel
                androidVersion: session.androidVersion, // Pass androidVersion
                workingDir: settings.paths.automationRoot // Pass configured automation root (camelCase for Tauri)
            });

        } catch (e) {
            console.error("Rerun failed", e);
            setSessions(prev => prev.map(s => {
                if (s.runId === newRunId) {
                    return { ...s, status: 'error', logs: [...s.logs, `\n[Error] Rerun failed: ${e}`] };
                }
                return s;
            }));
        }
    }, [sessions, settings, addSession]);

    const clearSession = useCallback((runId: string) => {
        setSessions(prev => prev.filter(s => s.runId !== runId));
        if (activeSessionId === runId) {
            setActiveSessionId('dashboard');
        }
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

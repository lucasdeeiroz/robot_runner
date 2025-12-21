import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from './settings';
import { v4 as uuidv4 } from 'uuid';

export interface TestSession {
    runId: string;
    type: 'test' | 'toolbox'; // New field
    deviceName: string;
    deviceUdid: string;
    testPath: string; // For toolbox, this might be "Toolbox" or empty
    logs: string[];
    status: 'running' | 'finished' | 'stopped' | 'error';
    exitCode?: string;
    argumentsFile?: string | null;
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
    addSession: (runId: string, deviceUdid: string, deviceName: string, testPath: string, argumentsFile?: string | null) => void;
    addToolboxSession: (deviceUdid: string, deviceName: string) => void; // New action
    rerunSession: (runId: string) => Promise<void>;
    stopSession: (runId: string) => Promise<void>;
    clearSession: (runId: string) => void;
    activeSessionId: string | 'dashboard';
    setActiveSessionId: (id: string | 'dashboard') => void;
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
                if (s.runId === run_id) {
                    return { ...s, logs: [...s.logs, message] };
                }
                return s;
            }));
        });

        const unlistenFinishedPromise = listen<TestFinishedPayload>('test-finished', (event) => {
            const { run_id, status } = event.payload;
            setSessions(prev => prev.map(s => {
                if (s.runId === run_id) {
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

    const addSession = useCallback((runId: string, deviceUdid: string, deviceName: string, testPath: string, argumentsFile?: string | null) => {
        setSessions(prev => [
            ...prev,
            {
                runId,
                type: 'test',
                deviceUdid,
                deviceName,
                testPath,
                logs: [`[System] Starting test session: ${runId}`, `[System] Device: ${deviceName} (${deviceUdid})`, `[System] Suite: ${testPath}`, '----------------------------------------'],
                status: 'running',
                argumentsFile: argumentsFile
            }
        ]);
        setActiveSessionId(runId);
    }, []);

    const addToolboxSession = useCallback((deviceUdid: string, deviceName: string) => {
        const runId = `toolbox-${deviceUdid}`;
        // Prevent duplicates
        setSessions(prev => {
            if (prev.find(s => s.runId === runId)) return prev;
            return [
                ...prev,
                {
                    runId,
                    type: 'toolbox',
                    deviceUdid,
                    deviceName,
                    testPath: 'Toolbox',
                    logs: [],
                    status: 'running' // Always "running" for toolbox
                }
            ];
        });
        setActiveSessionId(runId);
    }, []);

    const { settings } = useSettings();

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
            // Still mark as stopped in UI if failed? Or error.
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
        const logDir = settings.paths.logs ? `${settings.paths.logs}/${newRunId}` : `../test_results/${newRunId}`;

        // Add new session immediately
        addSession(newRunId, session.deviceUdid, session.deviceName, session.testPath, session.argumentsFile);

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
            await invoke("run_robot_test", {
                runId: newRunId,
                testPath: session.testPath,
                outputDir: logDir,
                device: session.deviceUdid === 'local' ? null : session.deviceUdid,
                argumentsFile: session.argumentsFile
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

    return (
        <TestSessionContext.Provider value={{ sessions, addSession, addToolboxSession, stopSession, rerunSession, clearSession, activeSessionId, setActiveSessionId }}>
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

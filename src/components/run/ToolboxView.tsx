import { useState, useEffect } from "react";
import { AlignLeft, Terminal, Cpu, Cast, FileText, StopCircle, RefreshCcw, Camera, Video, Square } from "lucide-react";
import clsx from "clsx";
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from "@tauri-apps/api/core";
import { join } from '@tauri-apps/api/path';
import { useSettings } from "@/lib/settings";
import { LogcatSubTab } from "./LogcatSubTab";
import { useTranslation } from "react-i18next";
import { CommandsSubTab } from "./CommandsSubTab";
import { PerformanceSubTab } from "./PerformanceSubTab";
import { RunConsole } from "./RunConsole";
import { TestSession, useTestSessions } from "@/lib/testSessionStore";

interface ToolboxViewProps {
    session: TestSession;
}

type ToolTab = 'console' | 'logcat' | 'performance' | 'commands';

export function ToolboxView({ session }: ToolboxViewProps) {
    // Default to 'console' if it's a test session, otherwise 'logcat' or 'performance'
    const [activeTool, setActiveTool] = useState<ToolTab>(
        session.type === 'test' ? 'console' : 'logcat'
    );

    // If session type changes (rare but possible), reset default
    useEffect(() => {
        if (session.type === 'test' && activeTool !== 'console') {
            // Keep user selection if they navigated away, or reset? 
            // Let's stick to user selection unless invalid.
        }
    }, [session.type]);

    const { stopSession, rerunSession } = useTestSessions();
    const { t } = useTranslation();
    const { settings } = useSettings();
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);

    const getTimestampFilename = (prefix: string, ext: string) => {
        return `${prefix}_${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
    };

    // Timer for recording
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isRecording) {
            interval = setInterval(() => setRecordingTime(t => t + 1), 1000);
        } else {
            setRecordingTime(0);
        }
        return () => clearInterval(interval);
    }, [isRecording]);

    const handleScreenshot = async () => {
        try {
            let filePath: string | null = null;
            const filename = getTimestampFilename('screenshot', 'png');

            if (settings.paths.screenshots && settings.paths.screenshots.trim() !== '') {
                // Auto-save
                filePath = await join(settings.paths.screenshots, filename);
            } else {
                // Dialog
                filePath = await save({
                    filters: [{ name: 'Image', extensions: ['png'] }],
                    defaultPath: filename
                });
            }

            if (filePath) {
                await invoke('save_screenshot', { device: session.deviceUdid, path: filePath });
                console.log("Screenshot saved to:", filePath);
            }
        } catch (e) {
            console.error("Screenshot failed:", e);
            alert(`Screenshot failed: ${e}`);
        }
    };

    const handleToggleRecording = async () => {
        if (isRecording) {
            // Stop
            try {
                let filePath: string | null = null;
                const filename = getTimestampFilename('recording', 'mp4');

                if (settings.paths.recordings && settings.paths.recordings.trim() !== '') {
                    // Auto-save
                    filePath = await join(settings.paths.recordings, filename);
                } else {
                    // Dialog
                    filePath = await save({
                        filters: [{ name: 'Video', extensions: ['mp4'] }],
                        defaultPath: filename
                    });
                }

                if (filePath) {
                    setIsRecording(false);
                    await invoke('stop_screen_recording', { device: session.deviceUdid, localPath: filePath });
                }
            } catch (e) {
                console.error("Stop recording failed:", e);
                alert(`Failed to save recording: ${e}`);
                setIsRecording(false);
            }
        } else {
            // Start
            try {
                await invoke('start_screen_recording', { device: session.deviceUdid });
                setIsRecording(true);
            } catch (e) {
                console.error("Start recording failed:", e);
                alert(`Failed to start recording: ${e}`);
            }
        }
    };

    const handleScrcpy = async () => {
        try {
            await invoke('open_scrcpy', {
                device: session.deviceUdid,
                args: settings.tools.scrcpyArgs || null
            });
        } catch (e) {
            console.error("Failed to open Scrcpy:", e);
            alert(`${t('scrcpy.error')}: ${e}`);
        }
    };

    const handleRerun = async () => {
        if (session.type !== 'test') return;
        try {
            await rerunSession(session.runId);
        } catch (e) {
            console.error("Rerun failed trigger:", e);
            alert("Failed to initiate rerun");
        }
    };

    return (
        <div className="h-full flex flex-col space-y-4">
            {/* Tool Selection Header */}
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800 w-fit">
                    {session.type === 'test' && (
                        <ToolButton
                            active={activeTool === 'console'}
                            onClick={() => setActiveTool('console')}
                            icon={<FileText size={16} />}
                            label={t('toolbox.tabs.console')}
                        />
                    )}
                    <ToolButton
                        active={activeTool === 'logcat'}
                        onClick={() => setActiveTool('logcat')}
                        icon={<AlignLeft size={16} />}
                        label={t('toolbox.tabs.logcat')}
                    />
                    <ToolButton
                        active={activeTool === 'commands'}
                        onClick={() => setActiveTool('commands')}
                        icon={<Terminal size={16} />}
                        label={t('toolbox.tabs.commands')}
                    />
                    <ToolButton
                        active={activeTool === 'performance'}
                        onClick={() => setActiveTool('performance')}
                        icon={<Cpu size={16} />}
                        label={t('toolbox.tabs.performance')}
                    />
                </div>

                {/* Session Controls */}
                <div className="flex items-center gap-2">
                    {/* Media & Tools Controls - Always Visible */}
                    <div className="flex bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800 mr-2">
                        <button
                            onClick={handleScrcpy}
                            className="p-1.5 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white dark:hover:bg-zinc-700 rounded-md transition-all"
                            title={t('scrcpy.title')}
                        >
                            <Cast size={18} />
                        </button>
                        <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-1 self-center" />
                        <button
                            onClick={handleScreenshot}
                            className="p-1.5 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white dark:hover:bg-zinc-700 rounded-md transition-all"
                            title={t('toolbox.actions.screenshot')}
                        >
                            <Camera size={18} />
                        </button>
                        <button
                            onClick={handleToggleRecording}
                            className={clsx(
                                "p-1.5 rounded-md transition-all flex items-center gap-2",
                                isRecording
                                    ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 animate-pulse"
                                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white dark:hover:bg-zinc-700"
                            )}
                            title={isRecording ? t('toolbox.actions.stop_recording') : t('toolbox.actions.start_recording')}
                        >
                            {isRecording ? <Square size={18} fill="currentColor" /> : <Video size={18} />}
                            {isRecording && <span className="text-xs font-mono font-bold">{new Date(recordingTime * 1000).toISOString().substr(14, 5)}</span>}
                        </button>
                    </div>

                    {session.type === 'test' && (
                        <>
                            {session.status === 'running' && (
                                <button
                                    onClick={() => stopSession(session.runId)}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-md text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                                >
                                    <StopCircle size={16} />
                                    {t('toolbox.actions.stop_execution')}
                                </button>
                            )}
                            {session.status === 'finished' && (
                                <button
                                    onClick={handleRerun}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-md text-sm font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                                >
                                    <RefreshCcw size={16} />
                                    {t('toolbox.actions.rerun')}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Tool Content */}
            <div className="flex-1 min-h-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden relative">
                {activeTool === 'console' && session.type === 'test' && (
                    <div className="h-full flex flex-col">
                        <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 font-mono">
                            {session.testPath}
                        </div>
                        <RunConsole logs={session.logs} isRunning={session.status === 'running'} />
                    </div>
                )}

                {activeTool === 'logcat' && (
                    <LogcatSubTab selectedDevice={session.deviceUdid} />
                )}
                {activeTool === 'commands' && (
                    <CommandsSubTab selectedDevice={session.deviceUdid} />
                )}
                {activeTool === 'performance' && (
                    <PerformanceSubTab selectedDevice={session.deviceUdid} />
                )}
            </div>
        </div>
    );
}

function ToolButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
                active
                    ? "bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white/50 dark:hover:bg-zinc-700/50"
            )}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}

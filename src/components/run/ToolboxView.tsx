import { useState, useEffect, useRef } from "react";
import { AlignLeft, Terminal, Cpu, Cast, FileText, StopCircle, RefreshCcw, Camera, Video, Square, LayoutGrid, Minimize2 } from "lucide-react";
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
import { feedback } from "@/lib/feedback";

interface ToolboxViewProps {
    session: TestSession;
    isCompact?: boolean;
}

type ToolTab = 'console' | 'logcat' | 'performance' | 'commands';

export function ToolboxView({ session, isCompact = false }: ToolboxViewProps) {
    const { stopSession, rerunSession, setSessionActiveTool } = useTestSessions();
    const { t } = useTranslation();
    const { settings, systemCheckStatus } = useSettings();
    const isMirrorDisabled = systemCheckStatus?.missingMirroring?.length > 0;

    // Default to 'console' if it's a test session, otherwise 'logcat' or 'performance'
    const [activeTool, setActiveTool] = useState<ToolTab>(
        (session.lastActiveTool as ToolTab) || (session.type === 'test' ? 'console' : 'logcat')
    );
    const [isGridView, setIsGridView] = useState(false);
    // Default visible tools in grid: Console and Logcat
    const [visibleToolsInGrid, setVisibleToolsInGrid] = useState<Set<ToolTab>>(new Set(['console', 'logcat', 'commands', 'performance']));

    // Responsive State
    const containerRef = useRef<HTMLDivElement>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // If container width < 600px, hide labels
                setIsNarrow(entry.contentRect.width < 600);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // If session type/run changes (recycling), switch to console
    // If session run changes (new test via recycling), switch to console
    useEffect(() => {
        if (session.type === 'test') {
            setActiveTool('console');
            if (isGridView) {
                setVisibleToolsInGrid(prev => new Set(prev).add('console'));
            }
        }
    }, [session.activeRunId]); // Only trigger on NEW run ID

    // Safety: Enforce valid tool for Toolbox mode
    useEffect(() => {
        if (session.type === 'toolbox' && activeTool === 'console') {
            setActiveTool('logcat');
        }
    }, [session.type, activeTool]);

    // Sync state for tab persistence
    useEffect(() => {
        setSessionActiveTool(session.runId, activeTool);
    }, [activeTool, session.runId, setSessionActiveTool]);

    // Cleanup or other hooks (removed duplicate destructuring)
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
                feedback.toast.success('feedback.screenshot_saved');
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
                    feedback.notify('feedback.recording_saved', 'feedback.details.path', { path: filePath });
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
            feedback.toast.success('feedback.mirror_launched');
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



    const handleToolClick = (tool: ToolTab) => {
        if (isGridView) {
            setVisibleToolsInGrid(prev => {
                const next = new Set(prev);
                if (next.has(tool)) next.delete(tool);
                else next.add(tool);
                return next;
            });
        } else {
            setActiveTool(tool);
        }
    };

    // Auto-disable grid if only 1 tool left
    useEffect(() => {
        if (!isGridView) return;

        let activeTools = Array.from(visibleToolsInGrid);
        if (session.type !== 'test') {
            activeTools = activeTools.filter(t => t !== 'console');
        }

        if (activeTools.length <= 1) {
            setIsGridView(false);
            if (activeTools.length === 1) {
                const tool = activeTools[0] as 'console' | 'logcat' | 'commands' | 'performance';
                setActiveTool(tool);
            }
            // Reset grid visibility
            setVisibleToolsInGrid(new Set(['console', 'logcat', 'commands', 'performance']));
        }
    }, [isGridView, visibleToolsInGrid.size, session.type]);

    return (
        <div ref={containerRef} className="h-full flex flex-col space-y-4 pointer-events-auto relative z-10">
            {/* Tool Selection Header */}
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800 w-fit">
                    {session.type === 'test' && (
                        <ToolButton
                            active={isGridView ? visibleToolsInGrid.has('console') : activeTool === 'console'}
                            onClick={() => handleToolClick('console')}
                            icon={<FileText size={16} />}
                            label={t('toolbox.tabs.console')}
                            showLabel={!isCompact && !isNarrow}
                        />
                    )}
                    <ToolButton
                        active={isGridView ? visibleToolsInGrid.has('logcat') : activeTool === 'logcat'}
                        onClick={() => handleToolClick('logcat')}
                        icon={<AlignLeft size={16} />}
                        label={t('toolbox.tabs.logcat')}
                        showLabel={!isCompact && !isNarrow}
                    />
                    <ToolButton
                        active={isGridView ? visibleToolsInGrid.has('commands') : activeTool === 'commands'}
                        onClick={() => handleToolClick('commands')}
                        icon={<Terminal size={16} />}
                        label={t('toolbox.tabs.commands')}
                        showLabel={!isCompact && !isNarrow}
                    />
                    <ToolButton
                        active={isGridView ? visibleToolsInGrid.has('performance') : activeTool === 'performance'}
                        onClick={() => handleToolClick('performance')}
                        icon={<Cpu size={16} />}
                        label={t('toolbox.tabs.performance')}
                        showLabel={!isCompact && !isNarrow}
                    />
                    {!isCompact && (
                        <>
                            <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-1 self-center" />
                            <button
                                onClick={() => setIsGridView(!isGridView)}
                                className={clsx(
                                    "p-1.5 rounded-md transition-all flex items-center justify-center",
                                    isGridView
                                        ? "bg-primary/10 text-primary"
                                        : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                )}
                                title={isGridView ? t('toolbox.actions.switch_to_tabs') : t('toolbox.actions.switch_to_grid')}
                            >
                                <LayoutGrid size={18} />
                            </button>
                        </>
                    )}
                </div>

                {/* Session Controls */}
                <div className="flex items-center gap-2">
                    {/* Media & Tools Controls - Always Visible */}
                    <div className="flex bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800 mr-2">
                        <button
                            onClick={handleScrcpy}
                            disabled={isMirrorDisabled}
                            className={clsx(
                                "p-1.5 rounded-md transition-all",
                                isMirrorDisabled
                                    ? "text-zinc-300 dark:text-zinc-600 cursor-not-allowed"
                                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white dark:hover:bg-zinc-700"
                            )}
                            title={isMirrorDisabled ? t('startup.mirroring.description') : t('scrcpy.title')}
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
                                    title={t('toolbox.actions.stop_execution')}
                                >
                                    <StopCircle size={16} />
                                    {!isCompact && !isNarrow && t('toolbox.actions.stop_execution')}
                                </button>
                            )}
                            {session.status !== 'running' && (
                                <button
                                    onClick={handleRerun}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-primary hover:opacity-90 text-white rounded-md text-sm font-medium transition-colors cursor-pointer"
                                    title={t('toolbox.actions.rerun')}
                                >
                                    <RefreshCcw size={16} />
                                    {!isCompact && !isNarrow && t('toolbox.actions.rerun')}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Tool Content */}
            {isGridView ? (
                <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4 pb-2 auto-rows-[minmax(300px,1fr)]">
                    {(() => {
                        const allTools: ToolTab[] = ['console', 'logcat', 'commands', 'performance'];
                        const visibleTools = allTools.filter(t =>
                            visibleToolsInGrid.has(t) && (t !== 'console' || session.type === 'test')
                        );

                        return visibleTools.map((tool, index) => {
                            const isLast = index === visibleTools.length - 1;
                            const isOddIn2Col = (visibleTools.length % 2 !== 0) && isLast;

                            const titleMap: Record<string, string> = {
                                'console': t('toolbox.tabs.console'),
                                'logcat': t('toolbox.tabs.logcat'),
                                'commands': t('toolbox.tabs.commands'),
                                'performance': t('toolbox.tabs.performance')
                            };

                            return (
                                <GridToolItem
                                    key={tool}
                                    id={tool}
                                    title={titleMap[tool]}
                                    className={clsx(isOddIn2Col && "md:col-span-2")}
                                    onHide={() => handleToolClick(tool)}
                                    minimizeLabel={t('common.minimize')}
                                >
                                    {tool === 'console' && (
                                        <div className="h-full flex flex-col overflow-hidden">
                                            <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 font-mono shrink-0">
                                                {session.testPath}
                                            </div>
                                            <div className="flex-1 min-h-0">
                                                <RunConsole logs={session.logs} isRunning={session.status === 'running'} />
                                            </div>
                                        </div>
                                    )}
                                    {tool === 'logcat' && <LogcatSubTab key={session.deviceUdid} selectedDevice={session.deviceUdid} />}
                                    {tool === 'commands' && <CommandsSubTab selectedDevice={session.deviceUdid} />}
                                    {tool === 'performance' && <PerformanceSubTab selectedDevice={session.deviceUdid} />}
                                </GridToolItem>
                            );
                        });
                    })()}
                </div>
            ) : (
                <div className="flex-1 min-h-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden relative">
                    <div className={clsx("h-full flex flex-col overflow-hidden", activeTool === 'console' && session.type === 'test' ? "block" : "hidden")}>
                        <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 font-mono shrink-0">
                            {session.testPath}
                        </div>
                        <div className="flex-1 min-h-0">
                            <RunConsole logs={session.logs} isRunning={session.status === 'running'} />
                        </div>
                    </div>

                    <div className={clsx("h-full", activeTool === 'logcat' ? "block" : "hidden")}>
                        <LogcatSubTab key={session.deviceUdid} selectedDevice={session.deviceUdid} />
                    </div>

                    <div className={clsx("h-full", activeTool === 'commands' ? "block" : "hidden")}>
                        <CommandsSubTab selectedDevice={session.deviceUdid} />
                    </div>

                    <div className={clsx("h-full", activeTool === 'performance' ? "block" : "hidden")}>
                        <PerformanceSubTab selectedDevice={session.deviceUdid} />
                    </div>
                </div>
            )
            }
        </div>
    );
}

function ToolButton({ active, onClick, icon, label, showLabel = true }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, showLabel?: boolean }) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
                active
                    ? "bg-white dark:bg-zinc-700 text-primary shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white/50 dark:hover:bg-zinc-700/50"
            )}
            title={label}
        >
            {icon}
            {showLabel && <span>{label}</span>}
        </button>
    );
}

function GridToolItem({ title, children, className, onHide, minimizeLabel }: { id: string, title: React.ReactNode, children: React.ReactNode, className?: string, onHide?: () => void, minimizeLabel?: string }) {
    return (
        <div className={clsx(
            "flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 overflow-hidden shadow-sm transition-all duration-300 min-h-0",
            className
        )}>
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-2">
                    {title}
                </span>
                {onHide && (
                    <button
                        onClick={onHide}
                        className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded"
                        title={minimizeLabel || "Minimize"}
                    >
                        <Minimize2 size={14} />
                    </button>
                )}
            </div>
            <div className="flex-1 min-h-0 relative">
                {children}
            </div>
        </div>
    );
}

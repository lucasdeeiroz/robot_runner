import { useState, useEffect, useRef } from "react";
import { AlignLeft, Terminal, Cpu, Cast, FileText, StopCircle, RefreshCcw, Camera, Video, Square, LayoutGrid, Minimize2, Maximize2, Package } from "lucide-react";
import clsx from "clsx";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "@/lib/settings";
import { LogcatSubTab } from "./LogcatSubTab";
import { AppsSubTab } from "./AppsSubTab";
import { useTranslation } from "react-i18next";
import { CommandsSubTab } from "./CommandsSubTab";
import { PerformanceSubTab } from "./PerformanceSubTab";
import { RunConsole } from "@/components/organisms/RunConsole";
import { TestSession, useTestSessions } from "@/lib/testSessionStore";
import { feedback } from "@/lib/feedback";
import { FileSavedFeedback } from "@/components/molecules/FileSavedFeedback";
import { useFileSave } from "@/hooks/useFileSave";
import { SplitButton } from "@/components/molecules/SplitButton";
import { usePerformanceRecorder } from "@/hooks/usePerformanceRecorder";

interface ToolboxViewProps {
    session: TestSession;
    isCompact?: boolean;
}

type ToolTab = 'console' | 'logcat' | 'performance' | 'commands' | 'apps';

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
    const [visibleToolsInGrid, setVisibleToolsInGrid] = useState<Set<ToolTab>>(new Set(['console', 'logcat', 'performance']));

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
    }, [session.activeRunId, session.type]); // Trigger on Run ID or Type change

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

    // File Savers
    const screenshotSaver = useFileSave({
        fileType: 'Image',
        extensions: ['png'],
        defaultNamePrefix: 'screenshot',
        settingPathKey: 'screenshots'
    });

    const recordingSaver = useFileSave({
        fileType: 'Video',
        extensions: ['mp4'],
        defaultNamePrefix: 'recording',
        settingPathKey: 'recordings'
    });

    const handleScreenshot = async () => {
        try {
            await screenshotSaver.saveFile(async (path) => {
                await invoke('save_screenshot', { device: session.deviceUdid, path });
            }, 'feedback.screenshot_saved');
            // Clear recording feedback so this one shows
            recordingSaver.clearFeedback();
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            feedback.toast.error("toolbox.screenshot.error", message);
        }
    };

    const handleToggleRecording = async () => {
        if (isRecording) {
            // Stop recording - Prompt for save path
            try {
                const path = await recordingSaver.saveFile(async (p) => {
                    await invoke('stop_screen_recording', { device: session.deviceUdid, localPath: p });
                }, 'feedback.recording_saved');

                if (path) {
                    // Clear screenshot feedback if any, though activeSavedPath priority usually handles the latest if we structure right.
                    // But explicitly clearing ensures we see THIS feedback.
                    screenshotSaver.clearFeedback();
                    setIsRecording(false);
                }
            } catch (e) {
                feedback.toast.error("toolbox.recording.stop_error", e);

                // Ensure the UI does not remain stuck in the "recording" state after a failure.
                setIsRecording(false);
            }
        } else {
            // Start
            try {
                await invoke('start_screen_recording', { device: session.deviceUdid });
                setIsRecording(true);
            } catch (e) {
                feedback.toast.error("toolbox.recording.start_error", e);
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
            feedback.toast.error("toolbox.scrcpy.open_error", e);
        }
    };

    const handleRerun = async () => {
        if (session.type !== 'test') return;
        try {
            await rerunSession(session.runId);
        } catch (e) {
            feedback.toast.error("toolbox.rerun.init_error", e);
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

    // Performance Hook
    // Determine active state for performance hook:
    // It is active if it's the active tool OR if we are in grid view and it's visible.
    const isPerformanceActive = activeTool === 'performance' || (isGridView && visibleToolsInGrid.has('performance'));

    const performanceState = usePerformanceRecorder(session.deviceUdid, isPerformanceActive);

    // Combine feedback paths (add performance saved path)
    const activeSavedPath = screenshotSaver.lastSavedPath || recordingSaver.lastSavedPath;

    // Clear all feedback
    const clearAllFeedback = () => {
        screenshotSaver.clearFeedback();
        recordingSaver.clearFeedback();
    };

    return (
        <div ref={containerRef} className="h-full flex flex-col space-y-4 pointer-events-auto relative z-10">
            {/* Tool Selection Header */}
            <div className="flex items-center justify-between flex-wrap gap-y-2 shrink-0">
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
                        active={isGridView ? visibleToolsInGrid.has('performance') : activeTool === 'performance'}
                        onClick={() => handleToolClick('performance')}
                        icon={<Cpu size={16} />}
                        label={t('toolbox.tabs.performance')}
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
                        active={isGridView ? visibleToolsInGrid.has('apps') : activeTool === 'apps'}
                        onClick={() => handleToolClick('apps')}
                        icon={<Package size={16} />}
                        label={t('toolbox.tabs.apps')}
                        showLabel={!isCompact && !isNarrow}
                    />
                    {!isCompact && (
                        <>
                            <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-1 self-center" />
                            <button
                                onClick={() => {
                                    if (!isGridView) {
                                        // Reset grid tools to defaults + current active tool
                                        // This prevents transient tools (Commands/Apps) from sticking around if they aren't active
                                        const defaults: ToolTab[] = ['console', 'logcat', 'performance'];
                                        setVisibleToolsInGrid(new Set([...defaults, activeTool]));
                                    }
                                    setIsGridView(!isGridView);
                                }}
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
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                                    title={t('toolbox.actions.stop_execution')}
                                >
                                    <StopCircle size={16} />
                                    {!isCompact && !isNarrow && t('toolbox.actions.stop_execution')}
                                </button>
                            )}
                            {session.status !== 'running' && (
                                <div className="flex items-center">
                                    <SplitButton
                                        variant="primary"
                                        primaryAction={{
                                            label: !isCompact && !isNarrow ? t('toolbox.actions.rerun') : "",
                                            onClick: handleRerun,
                                            icon: <RefreshCcw size={16} />
                                        }}
                                        secondaryActions={[
                                            {
                                                label: t('connect.actions.rerun_failed'),
                                                icon: <RefreshCcw size={14} className="text-red-500" />,
                                                // Check if finished with error (exit code != 0) AND we can find Output xml in logs
                                                disabled: !(session.status === 'finished' && session.exitCode && !session.exitCode.includes("Exit Code: 0")) ||
                                                    !session.logs.some(l => l.includes("Output:  ") && l.endsWith(".xml")),
                                                onClick: () => {
                                                    // Find XML path
                                                    const outputLine = session.logs.find(l => l.includes("Output:  ") && l.endsWith(".xml"));
                                                    if (outputLine) {
                                                        const match = outputLine.match(/Output:\s+(.*\.xml)/);
                                                        if (match && match[1]) {
                                                            const xmlPath = match[1].trim();
                                                            rerunSession(session.runId, xmlPath);
                                                        }
                                                    }
                                                }
                                            }
                                        ]}
                                    />
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Feedback for Screenshot/Listening */}
            <FileSavedFeedback
                path={activeSavedPath}
                onClose={clearAllFeedback}
            />

            {/* Tool Content */}
            {isGridView ? (
                <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4 pb-2 auto-rows-[minmax(300px,1fr)]">
                    {(() => {
                        const allTools: ToolTab[] = ['console', 'logcat', 'performance', 'commands', 'apps'];
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
                                'performance': t('toolbox.tabs.performance'),
                                'apps': t('toolbox.tabs.apps')
                            };

                            return (
                                <GridToolItem
                                    key={tool}
                                    id={tool}
                                    title={titleMap[tool]}
                                    className={clsx(isOddIn2Col && "md:col-span-2")}
                                    onHide={() => handleToolClick(tool)}
                                    minimizeLabel={t('common.minimize')}
                                    onMaximize={() => {
                                        setIsGridView(false);
                                        setActiveTool(tool);
                                    }}
                                    maximizeLabel={t('common.maximize')}
                                >
                                    {tool === 'console' && (
                                        <RunConsole logs={session.logs} isRunning={session.status === 'running'} testPath={session.testPath} />
                                    )}
                                    {tool === 'logcat' && <LogcatSubTab key={session.deviceUdid} selectedDevice={session.deviceUdid} />}
                                    {tool === 'commands' && <CommandsSubTab selectedDevice={session.deviceUdid} />}
                                    {tool === 'performance' && (
                                        <PerformanceSubTab
                                            selectedDevice={session.deviceUdid}
                                            {...performanceState}
                                            onRefresh={performanceState.fetchStats}
                                        />
                                    )}
                                    {tool === 'apps' && <AppsSubTab />}
                                </GridToolItem>
                            );
                        });
                    })()}
                </div>
            ) : (
                <div className="flex-1 min-h-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden relative">
                    <div className={clsx("h-full flex flex-col overflow-hidden", activeTool === 'console' && session.type === 'test' ? "block" : "hidden")}>
                        <RunConsole logs={session.logs} isRunning={session.status === 'running'} testPath={session.testPath} />
                    </div>

                    <div className={clsx("h-full", activeTool === 'logcat' ? "block" : "hidden")}>
                        <LogcatSubTab key={session.deviceUdid} selectedDevice={session.deviceUdid} />
                    </div>

                    <div className={clsx("h-full", activeTool === 'commands' ? "block" : "hidden")}>
                        <CommandsSubTab selectedDevice={session.deviceUdid} />
                    </div>

                    <div className={clsx("h-full", activeTool === 'performance' ? "block" : "hidden")}>
                        <PerformanceSubTab
                            selectedDevice={session.deviceUdid}
                            {...performanceState}
                            onRefresh={performanceState.fetchStats}
                        />
                    </div>

                    <div className={clsx("h-full", activeTool === 'apps' ? "block" : "hidden")}>
                        <AppsSubTab />
                    </div>
                </div>
            )}
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

function GridToolItem({ title, children, className, onHide, minimizeLabel, onMaximize, maximizeLabel }: { id: string, title: React.ReactNode, children: React.ReactNode, className?: string, onHide?: () => void, minimizeLabel?: string, onMaximize?: () => void, maximizeLabel?: string }) {
    return (
        <div className={clsx(
            "flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 overflow-hidden shadow-sm transition-all duration-300 min-h-0",
            className
        )}>
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-2">
                    {title}
                </span>
                <div className="flex items-center gap-1">
                    {onMaximize && (
                        <button
                            onClick={onMaximize}
                            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded"
                            title={maximizeLabel || "Maximize"}
                        >
                            <Maximize2 size={14} />
                        </button>
                    )}
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
            </div>
            <div className="flex-1 min-h-0 relative">
                {children}
            </div>
        </div>
    );
}

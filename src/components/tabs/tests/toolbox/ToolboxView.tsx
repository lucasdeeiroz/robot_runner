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
import { Button } from "@/components/atoms/Button";
import { TabBar } from "@/components/organisms/TabBar";

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
    const [containerWidth, setContainerWidth] = useState(1000);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // Calculate isNarrow based on container width AND session type
    // If running a test, we have big "Stop" / "Rerun" buttons, so we need more space (higher threshold)
    const narrowThreshold = session.type === 'test' ? 1000 : 700;
    const isNarrow = containerWidth < narrowThreshold;

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
    const isTestRunning = session.status === 'running';

    // Always enable auto-refresh by default.
    // The hook handles pausing it during active tests efficiently.
    const initialAutoRefresh = true;

    const performanceState = usePerformanceRecorder(session.deviceUdid, isPerformanceActive, isTestRunning, initialAutoRefresh);

    // Combine feedback paths (add performance saved path)
    const activeSavedPath = screenshotSaver.lastSavedPath || recordingSaver.lastSavedPath;

    // Clear all feedback
    const clearAllFeedback = () => {
        screenshotSaver.clearFeedback();
        recordingSaver.clearFeedback();
    };

    return (
        <div ref={containerRef} className={clsx(
            "h-full flex-1 min-h-0 flex flex-col space-y-4 pointer-events-auto relative z-10 bg-surface",
            !isCompact && "rounded-2xl p-4 border border-outline-variant/30",
            isCompact && "p-2"
        )}>
            {/* Tool Selection Header */}
            <TabBar
                layoutId={`toolbox-view-tabs-${session.runId}`}
                tabs={[
                    ...(session.type === 'test' ? [{
                        id: 'console',
                        label: (!isCompact && !isNarrow) ? t('toolbox.tabs.console') : "",
                        icon: FileText,
                        selected: isGridView ? visibleToolsInGrid.has('console') : activeTool === 'console'
                    }] : []),
                    {
                        id: 'logcat',
                        label: (!isCompact && !isNarrow) ? t('toolbox.tabs.logcat') : "",
                        icon: AlignLeft,
                        selected: isGridView ? visibleToolsInGrid.has('logcat') : activeTool === 'logcat'
                    },
                    {
                        id: 'performance',
                        label: (!isCompact && !isNarrow) ? t('toolbox.tabs.performance') : "",
                        icon: Cpu,
                        selected: isGridView ? visibleToolsInGrid.has('performance') : activeTool === 'performance'
                    },
                    {
                        id: 'commands',
                        label: (!isCompact && !isNarrow) ? t('toolbox.tabs.commands') : "",
                        icon: Terminal,
                        selected: isGridView ? visibleToolsInGrid.has('commands') : activeTool === 'commands'
                    },
                    {
                        id: 'apps',
                        label: (!isCompact && !isNarrow) ? t('toolbox.tabs.apps') : "",
                        icon: Package,
                        selected: isGridView ? visibleToolsInGrid.has('apps') : activeTool === 'apps'
                    }
                ]}
                activeId={activeTool}
                onChange={(id) => handleToolClick(id as ToolTab)}
                variant="pills"
                className="z-10 shrink-0"
                menus={
                    !isCompact && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                if (!isGridView) {
                                    const defaults: ToolTab[] = ['console', 'logcat', 'performance'];
                                    setVisibleToolsInGrid(new Set([...defaults, activeTool]));
                                }
                                setIsGridView(!isGridView);
                            }}
                            className={clsx(
                                "p-1.5 rounded-2xl transition-all flex items-center justify-center border border-transparent h-8 w-8",
                                isGridView
                                    ? "bg-primary/10 text-primary border-none"
                                    : "text-on-surface/80 hover:text-on-surface/80 hover:bg-surface-variant/30"
                            )}
                            title={isGridView ? t('toolbox.actions.switch_to_tabs') : t('toolbox.actions.switch_to_grid')}
                        >
                            <LayoutGrid size={18} />
                        </Button>
                    )
                }
                actions={
                    <div className="flex items-center gap-2">
                        {/* Session Controls */}
                        <div className="flex bg-surface p-1 rounded-2xl border border-outline-variant/30">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleScrcpy}
                                disabled={isMirrorDisabled}
                                className={clsx(
                                    "p-1.5 rounded-2xl transition-all h-8 w-8",
                                    isMirrorDisabled
                                        ? "text-on-surface/80 cursor-not-allowed"
                                        : "text-on-surface/80 hover:text-primary hover:bg-primary/10"
                                )}
                                title={isMirrorDisabled ? t('startup.mirroring.description') : t('scrcpy.title')}
                            >
                                <Cast size={18} />
                            </Button>
                            <div className="w-px h-4 bg-surface/80 mx-1 self-center" />
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleScreenshot}
                                className="text-on-surface/80 hover:text-primary hover:bg-primary/10 transition-all h-8 w-8"
                                title={t('toolbox.actions.screenshot')}
                            >
                                <Camera size={18} />
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={handleToggleRecording}
                                className={clsx(
                                    "rounded-2xl transition-all flex items-center gap-2 h-8 px-2",
                                    isRecording
                                        ? "bg-error-container text-on-error-container animate-pulse hover:bg-error-container/80"
                                        : "text-on-surface/80 hover:text-primary hover:bg-primary/10"
                                )}
                                title={isRecording ? t('toolbox.actions.stop_recording') : t('toolbox.actions.start_recording')}
                            >
                                {isRecording ? <Square size={18} fill="currentColor" /> : <Video size={18} />}
                                {isRecording && <span className="text-xs font-mono font-bold">{new Date(recordingTime * 1000).toISOString().substr(14, 5)}</span>}
                            </Button>
                        </div>

                        {session.type === 'test' && (
                            <>
                                {session.status === 'running' && (
                                    <Button
                                        onClick={() => stopSession(session.runId)}
                                        variant="danger"
                                        size="sm"
                                        leftIcon={<StopCircle size={16} />}
                                        title={t('toolbox.actions.stop_execution')}
                                    >
                                        {!isCompact && !isNarrow && t('toolbox.actions.stop_execution')}
                                    </Button>
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
                                                    icon: <RefreshCcw size={14} className="text-error" />,
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
                }
            />

            {/* Feedback for Screenshot/Listening */}
            <FileSavedFeedback
                path={activeSavedPath}
                onClose={clearAllFeedback}
            />

            {/* Tool Content */}
            {isGridView ? (
                <div className="h-full flex-1 min-h-0 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4 pb-2 auto-rows-[minmax(300px,1fr)]">
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
                                    {tool === 'logcat' && <LogcatSubTab key={session.deviceUdid} selectedDevice={session.deviceUdid} isTestRunning={isTestRunning} />}
                                    {tool === 'commands' && <CommandsSubTab selectedDevice={session.deviceUdid} isTestRunning={isTestRunning} />}
                                    {tool === 'performance' && (
                                        <PerformanceSubTab
                                            selectedDevice={session.deviceUdid}
                                            {...performanceState}
                                            onRefresh={performanceState.fetchStats}
                                            isTestRunning={isTestRunning}
                                        />
                                    )}
                                    {tool === 'apps' && <AppsSubTab isTestRunning={isTestRunning} />}
                                </GridToolItem>
                            );
                        });
                    })()}
                </div>
            ) : (
                <div className="h-full flex-1 min-h-0 bg-surface border border-outline-variant/30 rounded-2xl overflow-hidden relative">
                    <div className={clsx("h-full flex-1 min-h-0 flex flex-col overflow-hidden", activeTool === 'console' && session.type === 'test' ? "block" : "hidden")}>
                        <RunConsole logs={session.logs} isRunning={session.status === 'running'} testPath={session.testPath} />
                    </div>

                    <div className={clsx("h-full flex-1 min-h-0", activeTool === 'logcat' ? "block" : "hidden")}>
                        <LogcatSubTab key={session.deviceUdid} selectedDevice={session.deviceUdid} isTestRunning={isTestRunning} />
                    </div>

                    <div className={clsx("h-full flex-1 min-h-0", activeTool === 'commands' ? "block" : "hidden")}>
                        <CommandsSubTab selectedDevice={session.deviceUdid} isTestRunning={isTestRunning} />
                    </div>

                    <div className={clsx("h-full flex-1 min-h-0", activeTool === 'performance' ? "block" : "hidden")}>
                        <PerformanceSubTab
                            selectedDevice={session.deviceUdid}
                            {...performanceState}
                            onRefresh={performanceState.fetchStats}
                            isTestRunning={isTestRunning}
                        />
                    </div>

                    <div className={clsx("h-full flex-1 min-h-0", activeTool === 'apps' ? "block" : "hidden")}>
                        <AppsSubTab isTestRunning={isTestRunning} />
                    </div>
                </div>
            )}
        </div>
    );
}



function GridToolItem({ title, children, className, onHide, minimizeLabel, onMaximize, maximizeLabel }: { id: string, title: React.ReactNode, children: React.ReactNode, className?: string, onHide?: () => void, minimizeLabel?: string, onMaximize?: () => void, maximizeLabel?: string }) {
    return (
        <div className={clsx(
            "flex flex-col border border-outline-variant/30 rounded-2xl bg-surface overflow-hidden shadow-sm transition-all duration-300 min-h-0",
            className
        )}>
            <div className="flex items-center justify-between px-3 py-2 bg-surface/50 border-b border-outline-variant/30 shrink-0">
                <span className="text-sm font-semibold text-on-surface-variant/80 flex items-center gap-2">
                    {title}
                </span>
                <div className="flex items-center gap-1">
                    {onMaximize && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onMaximize}
                            className="p-1 h-6 w-6 text-on-surface/80 hover:text-on-surface-variant/80 rounded"
                            title={maximizeLabel || "Maximize"}
                        >
                            <Maximize2 size={14} />
                        </Button>
                    )}
                    {onHide && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onHide}
                            className="p-1 h-6 w-6 text-on-surface/80 hover:text-on-surface-variant/80 rounded"
                            title={minimizeLabel || "Minimize"}
                        >
                            <Minimize2 size={14} />
                        </Button>
                    )}
                </div>
            </div>
            <div className="flex-1 min-h-0 relative">
                {children}
            </div>
        </div>
    );
}

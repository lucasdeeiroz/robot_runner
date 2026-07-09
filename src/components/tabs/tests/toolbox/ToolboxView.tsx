import { useState, useEffect, useRef } from "react";
import { AlignLeft, Terminal, Cpu, Cast, FileText, StopCircle, RefreshCcw, Camera, Video, Square, LayoutGrid, Minimize2, Maximize2, Package, Globe, Activity, Timer, ShieldCheck } from "lucide-react";
import clsx from "clsx";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "@/lib/settings";
import { logEvent } from "@/lib/analytics";
import { LogcatSubTab } from "./LogcatSubTab";
// import { DmesgSubTab } from "./DmesgSubTab";
import { AppsSubTab } from "./AppsSubTab";
import { useTranslation } from "react-i18next";
import { CommandsSubTab } from "./CommandsSubTab";
import { PerformanceSubTab } from "./PerformanceSubTab";
import { StopwatchSubTab } from "./StopwatchSubTab";
import { HardwareSubTab } from "./HardwareSubTab";
import { CheckupSubTab } from "./CheckupSubTab";
import { RunConsole } from "@/components/organisms/RunConsole";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";
import { TestSession, useTestSessions } from "@/lib/testSessionStore";
import { feedback } from "@/lib/feedback";
import { FileSavedFeedback } from "@/components/molecules/FileSavedFeedback";
import { useFileSave } from "@/hooks/useFileSave";
import { SplitButton } from "@/components/molecules/SplitButton";
import { usePerformanceRecorder } from "@/hooks/usePerformanceRecorder";
import { Button } from "@/components/atoms/Button";
import { TabBar } from "@/components/organisms/TabBar";
import { useDeviceViewport } from "@/hooks/useDeviceViewport";
import { DeviceViewport } from "@/components/organisms/DeviceViewport";

interface ToolboxViewProps {
    session: TestSession;
    isCompact?: boolean;
    onNavigate?: (page: string) => void;
}

type ToolTab = 'console' | 'logcat' | 'performance' | 'stopwatch' | 'commands' | 'apps' | 'webview' | 'hardware' | 'checkup';

export function ToolboxView({ session, isCompact = false, onNavigate }: ToolboxViewProps) {
    const { stopSession, rerunSession, setSessionActiveTool } = useTestSessions();
    const { t } = useTranslation();
    const { settings, systemCheckStatus } = useSettings();
    const isMirrorDisabled = systemCheckStatus?.missingMirroring?.length > 0;
    const isWebMode = session.androidVersion === 'web';

    const [activeTool, setActiveTool] = useState<ToolTab>(
        (session.lastActiveTool as ToolTab) || (session.type === 'test' ? 'console' : (isWebMode ? 'webview' : 'logcat'))
    );
    const [isGridView, setIsGridView] = useState(false);
    const [visibleToolsInGrid, setVisibleToolsInGrid] = useState<Set<ToolTab>>(
        isWebMode ? new Set(['console', 'webview']) : new Set(['console', 'logcat', 'performance', 'hardware', 'checkup'])
    );

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
            setActiveTool(isWebMode ? 'webview' : 'logcat');
        }
    }, [session.type, activeTool, isWebMode]);

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
                if (isWebMode) {
                    await invoke('save_web_screenshot', { deviceId: session.deviceUdid, path });
                } else {
                    await invoke('save_screenshot', { device: session.deviceUdid, path });
                }
            }, 'feedback.screenshot_saved');
            recordingSaver.clearFeedback();
        } catch (e) {
            console.error("Screenshot failed:", e);
        }
    };

    const handleToggleRecording = async () => {
        if (isRecording) {
            try {
                const path = await recordingSaver.saveFile(async (p) => {
                    if (isWebMode) {
                        await invoke('stop_web_recording', { outputPath: p });
                    } else {
                        await invoke('stop_screen_recording', { device: session.deviceUdid, localPath: p });
                    }
                }, 'feedback.recording_saved');

                if (path) {
                    screenshotSaver.clearFeedback();
                    setIsRecording(false);
                }
            } catch (e) {
                console.error("Stop recording failed:", e);
                setIsRecording(false);
            }
        } else {
            try {
                if (isWebMode) {
                    await invoke('start_web_recording');
                } else {
                    await invoke('start_screen_recording', { device: session.deviceUdid });
                }
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
            logEvent('scrcpy_launched', { success: true });
        } catch (e: any) {
            feedback.toast.error("toolbox.scrcpy.open_error", e);
            logEvent('scrcpy_launch_error', { error_message: e?.message || String(e) });
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
            setVisibleToolsInGrid(isWebMode ? new Set(['console', 'webview']) : new Set(['console', 'logcat', 'commands', 'performance', 'hardware']));
        }
    }, [isGridView, visibleToolsInGrid.size, session.type, isWebMode]);

    // Performance Hook
    // Determine active state for performance hook:
    // It is active if it's the active tool OR if we are in grid view and it's visible.
    const isPerformanceActive = activeTool === 'performance' || (isGridView && visibleToolsInGrid.has('performance'));
    const isTestRunning = session.status === 'running';

    // Always enable auto-refresh by default.
    // The hook handles pausing it during active tests efficiently.
    const initialAutoRefresh = true;

    const performanceState = usePerformanceRecorder(
        session.deviceUdid,
        isPerformanceActive,
        isTestRunning,
        initialAutoRefresh,
        settings.allowActionsDuringTest
    );

    // Webview Viewport Hook
    const webViewport = useDeviceViewport({
        deviceId: session.deviceUdid,
        isActive: isWebMode && (activeTool === 'webview' || (isGridView && visibleToolsInGrid.has('webview'))),
        isBusy: false,
        isWeb: true
    });

    // Stable ref polling for live web updates during active test runs
    const refreshRef = useRef(webViewport.refreshAll);
    useEffect(() => {
        refreshRef.current = webViewport.refreshAll;
    }, [webViewport.refreshAll]);

    useEffect(() => {
        if (!isWebMode) return;

        const isTabVisible = activeTool === 'webview' || (isGridView && visibleToolsInGrid.has('webview'));
        const isRunning = session.status === 'running';

        if (isTabVisible && isRunning) {
            const interval = setInterval(() => {
                refreshRef.current(true, false);
            }, 2500);

            return () => clearInterval(interval);
        }
    }, [isWebMode, activeTool, isGridView, visibleToolsInGrid, session.status]);

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
                tabs={isWebMode ? [
                    ...(session.type === 'test' ? [{
                        id: 'console',
                        label: (!isCompact && !isNarrow) ? t('toolbox.tabs.console') : "",
                        icon: FileText,
                        selected: isGridView ? visibleToolsInGrid.has('console') : activeTool === 'console',
                        tooltip: (isCompact || isNarrow) ? t('toolbox.tabs.console') : undefined
                    }] : []),
                    {
                        id: 'webview',
                        label: (!isCompact && !isNarrow) ? t('toolbox.tabs.webview', 'Webview') : "",
                        icon: Globe,
                        selected: isGridView ? visibleToolsInGrid.has('webview') : activeTool === 'webview',
                        tooltip: (isCompact || isNarrow) ? t('toolbox.tabs.webview', 'Webview') : undefined
                    }
                ] : [
                    ...(session.type === 'test' ? [{
                        id: 'console',
                        label: (!isCompact && !isNarrow) ? t('toolbox.tabs.console') : "",
                        icon: FileText,
                        selected: isGridView ? visibleToolsInGrid.has('console') : activeTool === 'console',
                        tooltip: (isCompact || isNarrow) ? t('toolbox.tabs.console') : undefined
                    }] : []),
                    {
                        id: 'logcat',
                        label: (!isCompact && !isNarrow) ? t('toolbox.tabs.logcat') : "",
                        icon: AlignLeft,
                        selected: isGridView ? visibleToolsInGrid.has('logcat') : activeTool === 'logcat',
                        tooltip: (isCompact || isNarrow) ? t('toolbox.tabs.logcat') : undefined
                    },
                    {
                        id: 'performance',
                        label: (!isCompact && !isNarrow) ? t('toolbox.tabs.performance') : "",
                        icon: Activity,
                        selected: isGridView ? visibleToolsInGrid.has('performance') : activeTool === 'performance',
                        tooltip: (isCompact || isNarrow) ? t('toolbox.tabs.performance') : undefined
                    },
                    {
                        id: 'stopwatch',
                        label: (!isCompact && !isNarrow) ? t('toolbox.tabs.stopwatch', 'Stopwatch') : "",
                        icon: Timer,
                        selected: isGridView ? visibleToolsInGrid.has('stopwatch') : activeTool === 'stopwatch',
                        tooltip: (isCompact || isNarrow) ? t('toolbox.tabs.stopwatch', 'Stopwatch') : undefined
                    },
                    {
                        id: 'commands',
                        label: (!isCompact && !isNarrow) ? t('toolbox.tabs.commands') : "",
                        icon: Terminal,
                        selected: isGridView ? visibleToolsInGrid.has('commands') : activeTool === 'commands',
                        tooltip: (isCompact || isNarrow) ? t('toolbox.tabs.commands') : undefined
                    },
                    {
                        id: 'apps',
                        label: (!isCompact && !isNarrow) ? t('toolbox.tabs.apps') : "",
                        icon: Package,
                        selected: isGridView ? visibleToolsInGrid.has('apps') : activeTool === 'apps',
                        tooltip: (isCompact || isNarrow) ? t('toolbox.tabs.apps') : undefined
                    },
                    {
                        id: 'hardware',
                        label: (!isCompact && !isNarrow) ? "Hardware" : "",
                        icon: Cpu, // We'll change to something else if needed, like Battery or Server
                        selected: isGridView ? visibleToolsInGrid.has('hardware') : activeTool === 'hardware',
                        tooltip: (isCompact || isNarrow) ? "Hardware" : undefined
                    },
                    {
                        id: 'checkup',
                        label: (!isCompact && !isNarrow) ? t('toolbox.tabs.checkup', 'Checkup') : "",
                        icon: ShieldCheck,
                        selected: isGridView ? visibleToolsInGrid.has('checkup') : activeTool === 'checkup',
                        tooltip: (isCompact || isNarrow) ? t('toolbox.tabs.checkup', 'Checkup') : undefined
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
                                    const defaults: ToolTab[] = isWebMode
                                        ? ['console', 'webview']
                                        : ['console', 'logcat', 'performance'];
                                    setVisibleToolsInGrid(new Set([...defaults, activeTool]));
                                }
                                setIsGridView(!isGridView);
                            }}
                            className={clsx(
                                "p-1.5 rounded-2xl transition-all flex items-center justify-center border border-transparent h-8 w-8",
                                isGridView
                                    ? "bg-primary/10 text-primary dark:text-primary/80 border-none"
                                    : "text-on-surface/80 hover:text-on-surface/80 hover:bg-surface-variant/30"
                            )}
                            data-tooltip={isGridView ? t('toolbox.actions.switch_to_tabs') : t('toolbox.actions.switch_to_grid')}
                            data-position="top"
                        >
                            <LayoutGrid size={18} />
                        </Button>
                    )
                }
                actions={
                    <div className="flex items-center gap-2">
                        {/* Session Controls */}
                        <div className="flex bg-surface p-1 rounded-2xl border border-outline-variant/30 items-center">
                            {isWebMode ? (
                                <div className="flex items-center gap-1.5 shrink-0" />
                            ) : (
                                <>
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
                                        data-tooltip={isMirrorDisabled ? t('startup.mirroring.description') : t('scrcpy.title')}
                                        data-position="top"
                                    >
                                        <Cast size={18} />
                                    </Button>
                                    <div className="w-px h-4 bg-surface/80 mx-1 self-center" />
                                </>
                            )}
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleScreenshot}
                                className="text-on-surface/80 hover:text-primary hover:bg-primary/10 transition-all h-8 w-8"
                                data-tooltip={t('toolbox.actions.screenshot')}
                                data-position="top"
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
                                data-tooltip={isRecording ? t('toolbox.actions.stop_recording') : t('toolbox.actions.start_recording')}
                                data-position="top"
                            >
                                {isRecording ? <Square size={18} fill="currentColor" /> : <Video size={18} />}
                                {isRecording && <span className="text-xs font-mono font-bold">{new Date(recordingTime * 1000).toISOString().substr(14, 5)}</span>}
                            </Button>
                        </div>

                        {session.type === 'test' && (
                            <>
                                {(session.status === 'running' || session.status === 'stopping') && (
                                    <Button
                                        onClick={() => stopSession(session.runId)}
                                        variant="danger"
                                        size="sm"
                                        disabled={session.status === 'stopping'}
                                        leftIcon={session.status === 'stopping' ? <ExpressiveLoading size="xsm" variant="circular" /> : <StopCircle size={16} />}
                                        title={session.status === 'stopping' ? t('toolbox.actions.stopping') : t('toolbox.actions.stop_execution')}
                                    >
                                        {!isCompact && !isNarrow && (
                                            session.status === 'stopping'
                                                ? t('toolbox.actions.stopping', "Stopping...")
                                                : t('toolbox.actions.stop_execution')
                                        )}
                                    </Button>
                                )}
                                {session.status !== 'running' && session.status !== 'stopping' && (
                                    <div className="flex items-center">
                                        <SplitButton
                                            variant="primary"
                                            primaryAction={{
                                                label: !isCompact && !isNarrow ? t('toolbox.actions.rerun') : "",
                                                onClick: handleRerun,
                                                icon: <RefreshCcw size={16} />
                                            }}
                                            secondaryActions={(() => {
                                                if (session.status !== 'finished') return [];

                                                // Find if there were any failures in the logs
                                                const hasFailures = session.logs.some(l => {
                                                    const clean = l.replace(/\x1b\[[0-9;]*m/g, '').trim();
                                                    const match = clean.match(/(\d+)\s+failed/);
                                                    return match && parseInt(match[1], 10) > 0;
                                                });

                                                if (!hasFailures) return [];

                                                // Find XML path with resilience to ANSI and spaces
                                                let xmlPath: string | null = null;
                                                for (const l of session.logs) {
                                                    const clean = l.replace(/\x1b\[[0-9;]*m/g, '').trim();
                                                    const match = clean.match(/Output:\s+(.*\.xml)$/);
                                                    if (match && match[1]) {
                                                        xmlPath = match[1].trim();
                                                        break;
                                                    }
                                                }

                                                if (!xmlPath) return [];

                                                return [{
                                                    label: t('connect.actions.rerun_failed'),
                                                    icon: <RefreshCcw size={14} className="text-error" />,
                                                    onClick: () => {
                                                        if (xmlPath) rerunSession(session.runId, xmlPath);
                                                    }
                                                }];
                                            })()}
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
            {(() => {
                const allTools: ToolTab[] = isWebMode
                    ? ['console', 'webview']
                    : ['console', 'logcat', 'performance', 'stopwatch', 'commands', 'apps', 'hardware', 'checkup'];

                const visibleToolsInGridArray = allTools.filter(t =>
                    visibleToolsInGrid.has(t) && (t !== 'console' || session.type === 'test')
                );

                const useAutoRows = visibleToolsInGridArray.length <= 3;
                // Use 3 columns for exactly 3 items. Otherwise default to 2 columns (or 1 on small screens).
                const isThreeCols = visibleToolsInGridArray.length === 3;

                return (
                    <div 
                        className={clsx(
                            "h-full flex-1 min-h-0",
                            isGridView
                                ? clsx(
                                    "grid gap-4 pb-2",
                                    isThreeCols ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2",
                                    useAutoRows ? "auto-rows-fr overflow-hidden" : "content-start overflow-y-auto"
                                )
                                : "bg-surface border border-outline-variant/30 rounded-2xl relative overflow-hidden"
                        )}
                        style={isGridView && !useAutoRows ? { gridAutoRows: '400px' } : undefined}
                    >
                        {(() => {
                            const titleMap: Record<string, string> = {
                        'console': t('toolbox.tabs.console'),
                        'logcat': t('toolbox.tabs.logcat'),
                        'dmesg': "Kernel Logs",
                        'commands': t('toolbox.tabs.commands'),
                        'performance': t('toolbox.tabs.performance'),
                        'stopwatch': t('toolbox.tabs.stopwatch', 'Stopwatch'),
                        'apps': t('toolbox.tabs.apps'),
                        'hardware': "Hardware",
                        'webview': t('toolbox.tabs.webview', 'Webview'),
                        'checkup': t('toolbox.tabs.checkup', 'Checkup')
                    };

                    return allTools.map((tool) => {
                        const isVisibleInGrid = isGridView && visibleToolsInGrid.has(tool) && (tool !== 'console' || session.type === 'test');
                        const isVisibleSingle = !isGridView && activeTool === tool;
                        const isVisible = isVisibleInGrid || isVisibleSingle;

                        const isOddIn2Col = isGridView && !isThreeCols && (visibleToolsInGridArray.length % 2 !== 0) && (visibleToolsInGridArray[visibleToolsInGridArray.length - 1] === tool);

                        return (
                            <div
                                key={tool}
                                className={clsx(
                                    !isVisible && "hidden",
                                    isGridView && isVisibleInGrid && clsx(
                                        "flex flex-col border border-outline-variant/30 rounded-2xl bg-surface overflow-hidden shadow-sm transition-all duration-300 min-h-0",
                                        isOddIn2Col && "md:col-span-2"
                                    ),
                                    !isGridView && isVisibleSingle && "h-full flex-1 min-h-0 flex flex-col relative"
                                )}
                            >
                                {/* Grid Header */}
                                {isGridView && isVisibleInGrid && (
                                    <div className="flex items-center justify-between px-3 py-2 bg-surface/50 border-b border-outline-variant/30 shrink-0">
                                        <span className="text-sm font-semibold text-on-surface-variant/80 flex items-center gap-2">
                                            {titleMap[tool]}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    setIsGridView(false);
                                                    setActiveTool(tool);
                                                }}
                                                className="p-1 h-6 w-6 text-on-surface/80 hover:text-on-surface-variant/80 rounded"
                                                title={t('common.maximize', 'Maximize')}
                                            >
                                                <Maximize2 size={14} />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleToolClick(tool)}
                                                className="p-1 h-6 w-6 text-on-surface/80 hover:text-on-surface-variant/80 rounded"
                                                title={t('common.minimize', 'Minimize')}
                                            >
                                                <Minimize2 size={14} />
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* Content Wrapper */}
                                <div className={clsx(
                                    "flex-1 min-h-0 relative",
                                    !isGridView && "h-full flex flex-col",
                                    !isGridView && tool === 'webview' && "bg-surface-variant/10 p-4 overflow-hidden"
                                )}>
                                    {tool === 'console' && (
                                        <RunConsole key={`console-${session.runId}-${session.sessionEpoch}`} runId={session.runId} logs={session.logs} isSessionRunning={session.status === 'running' || session.status === 'stopping'} testPath={session.testPath} />
                                    )}
                                    {tool === 'logcat' && <LogcatSubTab key={`logcat-${session.deviceUdid}`} selectedDevice={session.deviceUdid} isTestRunning={isTestRunning} allowActionsDuringTest={settings.allowActionsDuringTest} onNavigate={onNavigate} />}
                                    {tool === 'commands' && <CommandsSubTab selectedDevice={session.deviceUdid} isTestRunning={isTestRunning} allowActionsDuringTest={settings.allowActionsDuringTest} />}
                                    {tool === 'performance' && (
                                        <PerformanceSubTab
                                            selectedDevice={session.deviceUdid}
                                            {...performanceState}
                                            onRefresh={performanceState.fetchStats}
                                            isTestRunning={isTestRunning}
                                            allowActionsDuringTest={settings.allowActionsDuringTest}
                                            forceEnable={performanceState.forceEnable}
                                            setForceEnable={performanceState.setForceEnable}
                                            onNavigate={onNavigate}
                                        />
                                    )}
                                    {tool === 'stopwatch' && (
                                        <StopwatchSubTab
                                            selectedDevice={session.deviceUdid}
                                            isTestRunning={isTestRunning}
                                            allowActionsDuringTest={settings.allowActionsDuringTest}
                                        />
                                    )}
                                    {tool === 'apps' && <AppsSubTab isTestRunning={isTestRunning} allowActionsDuringTest={settings.allowActionsDuringTest} />}
                                    {tool === 'hardware' && <HardwareSubTab selectedDevice={session.deviceUdid} isTestRunning={isTestRunning} allowActionsDuringTest={settings.allowActionsDuringTest} />}
                                    {tool === 'checkup' && <CheckupSubTab selectedDevice={session.deviceUdid} isTestRunning={isTestRunning} allowActionsDuringTest={settings.allowActionsDuringTest} />}
                                    {tool === 'webview' && (
                                        <div className={clsx("h-full w-full flex flex-col overflow-hidden min-h-0", isGridView && "bg-surface-variant/10 p-2")}>
                                            <DeviceViewport
                                                screenshot={webViewport.screenshot}
                                                loading={webViewport.loading}
                                                imgRef={webViewport.imgRef}
                                                imgLayout={webViewport.imgLayout}
                                                onImgLoad={(e) => {
                                                    const img = e.currentTarget;
                                                    webViewport.setImgLayout({
                                                        width: img.clientWidth,
                                                        height: img.clientHeight,
                                                        naturalWidth: img.naturalWidth,
                                                        naturalHeight: img.naturalHeight
                                                    });
                                                }}
                                                hoveredNode={webViewport.hoveredNode}
                                                selectedNode={webViewport.selectedNode}
                                                taps={webViewport.taps}
                                                swipes={webViewport.swipes}
                                                onRefresh={(forceClear, targetWebUrl) => webViewport.refreshAll(true, forceClear, targetWebUrl)}
                                                handlers={webViewport.handlers}
                                                isWeb={true}
                                                maxHeight="100%"
                                                className="w-full h-full flex flex-col"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    });
                })()}
                    </div>
                );
            })()}
        </div>
    );
}


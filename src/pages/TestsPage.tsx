import { useState, useEffect, useRef } from 'react';
import { useTestSessions } from "@/lib/testSessionStore";
import { ToolboxView } from "../components/run/ToolboxView";
import { HistorySubTab } from "../components/run/HistorySubTab";
import { XCircle, LayoutGrid, Minimize2, Maximize2 } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from "react-i18next";

export function TestsPage() {
    const { t } = useTranslation();
    const { sessions, activeSessionId, setActiveSessionId, clearSession } = useTestSessions();
    const [subTab, setSubTab] = useState<'history' | string>('history');

    const [isGridView, setIsGridView] = useState(false);
    // Track visible sessions in Grid View. Default to all active session IDs.
    const [visibleGridSessions, setVisibleGridSessions] = useState<Set<string>>(new Set());

    // Smart Grid State
    const gridContainerRef = useRef<HTMLDivElement>(null);
    const [gridCols, setGridCols] = useState(1);



    // Filter visible sessions for Grid View
    const visibleSessions = sessions.filter(s => visibleGridSessions.has(s.runId));

    useEffect(() => {
        if (!isGridView) return;

        const updateGrid = () => {
            if (!gridContainerRef.current) return;
            const width = gridContainerRef.current.offsetWidth;
            const minWidth = 360; // Increased min-width to avoid crowding
            const count = visibleSessions.length;
            if (count === 0) return;

            const maxCols = Math.max(1, Math.floor(width / minWidth));

            // If only 1 col fits, accept it.
            if (maxCols === 1) {
                setGridCols(1);
                return;
            }

            let bestCols = maxCols;
            let minWaste = Infinity;

            // Iterate down to 2. We skip 1 to avoid "stacking" unless necessary.
            for (let c = maxCols; c >= 2; c--) {
                const rows = Math.ceil(count / c);
                const slots = rows * c;
                const waste = slots - count;

                if (waste <= minWaste) {
                    minWaste = waste;
                    bestCols = c;
                }
            }
            setGridCols(bestCols);
        };

        const observer = new ResizeObserver(updateGrid);
        if (gridContainerRef.current) observer.observe(gridContainerRef.current);
        // Also run on session count change
        updateGrid();

        return () => observer.disconnect();
    }, [isGridView, visibleSessions.length]);

    // Auto-disable grid if items drop below 2
    useEffect(() => {
        if (isGridView && visibleSessions.length < 2) {
            setIsGridView(false);
            if (visibleSessions.length === 1) {
                // Switch to that session tab
                setSubTab(visibleSessions[0].runId);
            }
            // Reset grid visibility so it can be re-opened populated
            setVisibleGridSessions(new Set(sessions.map(s => s.runId)));
        }
    }, [isGridView, visibleSessions.length]);

    // Sync visibleGridSessions when sessions change (e.g. new session added)
    useEffect(() => {
        setVisibleGridSessions(prev => {
            const next = new Set(prev);
            sessions.forEach(s => {
                if (!prev.has(s.runId)) next.add(s.runId);
            });
            return next;
        });
    }, [sessions.length]);

    const toggleGridSession = (id: string) => {
        setVisibleGridSessions(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    useEffect(() => {
        if (activeSessionId !== 'dashboard') {
            setSubTab(activeSessionId);
        }
    }, [activeSessionId]);

    const handleTabChange = (id: string) => {
        setSubTab(id);
        if (id !== 'history') {
            setActiveSessionId(id);
        } else {
            setActiveSessionId('dashboard');
        }
    };

    const activeSession = sessions.find(s => s.runId === subTab);

    return (
        <div className="h-full flex flex-col space-y-4">


            {/* View Toggle (Grid/Tabs) */}
            <div className="absolute top-4 right-4 z-10 hidden md:block">
            </div>

            {/* Modified Tabs Row with Grid Toggle */}
            <div className="flex items-center gap-2">
                <div className="flex-1 flex bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-lg overflow-x-auto no-scrollbar gap-1 border border-zinc-200 dark:border-zinc-800 shrink-0">
                    <button
                        onClick={() => {
                            if (isGridView) setIsGridView(false);
                            handleTabChange('history');
                        }}
                        className={clsx(
                            "px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap",
                            !isGridView && subTab === 'history'
                                ? "bg-white dark:bg-zinc-700 text-primary shadow-sm"
                                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white/50 dark:hover:bg-zinc-700/50"
                        )}
                    >
                        {t('tests_page.history')}
                    </button>

                    {sessions.map(s => {
                        const isSuccess = s.exitCode && (s.exitCode.includes("exit code: 0") || s.exitCode === "0");
                        const isFailed = s.status === 'finished' && !isSuccess;
                        const isSelected = isGridView ? visibleGridSessions.has(s.runId) : subTab === s.runId;

                        return (
                            <div key={s.runId} className={clsx(
                                "group flex items-center gap-2 pl-3 pr-2 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap border border-transparent cursor-pointer", // Added cursor-pointer
                                isSelected
                                    ? "bg-white dark:bg-zinc-700 text-primary shadow-sm border-zinc-200 dark:border-zinc-600"
                                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white/50 dark:hover:bg-zinc-700/50"
                            )}
                                onClick={() => {
                                    if (isGridView) {
                                        toggleGridSession(s.runId);
                                    } else {
                                        handleTabChange(s.runId);
                                    }
                                }}
                            >
                                <div className="flex items-center gap-2">
                                    {/* Removed nested button to avoid click conflict, handled by parent div */}
                                    {s.type === 'toolbox' && <span className="w-2.5 h-2.5 rounded-full bg-zinc-400" />}
                                    {s.type === 'test' && s.status === 'running' && <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />}
                                    {s.type === 'test' && s.status === 'finished' && isSuccess && <span className="w-2.5 h-2.5 rounded-full bg-green-500" />}
                                    {s.type === 'test' && isFailed && <span className="w-2.5 h-2.5 rounded-full bg-red-500" />}
                                    {s.type === 'test' && s.status === 'error' && <span className="w-2.5 h-2.5 rounded-full bg-red-500" />}
                                    <span>{s.deviceName}</span>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); clearSession(s.runId); }}
                                    className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity p-0.5 rounded"
                                    title={t('tests_page.close_tab')}
                                >
                                    <XCircle size={14} />
                                </button>
                            </div>
                        );
                    })}
                </div>
                {sessions.length >= 2 && (
                    <button
                        onClick={() => setIsGridView(!isGridView)}
                        className={clsx(
                            "p-2 rounded-lg border transition-all shrink-0",
                            isGridView
                                ? "bg-primary/10 border-primary text-primary"
                                : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                        )}
                        title={isGridView ? t('toolbox.actions.switch_to_tabs') : t('toolbox.actions.switch_to_grid')}
                    >
                        <LayoutGrid size={20} />
                    </button>
                )}
            </div>

            {/* Content */}
            {isGridView ? (
                <div
                    ref={gridContainerRef}
                    className="flex-1 min-h-0 overflow-y-auto grid gap-4 pb-4 content-start"
                    style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`, gridAutoRows: 'minmax(480px, 1fr)' }}
                >
                    {/* Session Grid Items */}
                    {visibleSessions.map((s) => {
                        return (
                            <GridItem
                                key={s.runId}
                                className="min-w-0 h-full"
                                title={
                                    <div className="flex items-center gap-2">
                                        {s.type === 'toolbox' && <span className="w-2 h-2 rounded-full bg-zinc-400" />}
                                        {s.type === 'test' && s.status === 'running' && <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />}
                                        {s.type === 'test' && s.status === 'finished' && <span className={clsx("w-2 h-2 rounded-full", (s.exitCode?.includes("0") || s.exitCode === "0") ? "bg-green-500" : "bg-red-500")} />}
                                        <span>{s.deviceName}</span>
                                    </div>
                                }
                                onClose={() => clearSession(s.runId)}
                                onHide={() => toggleGridSession(s.runId)}
                                onMaximize={() => {
                                    setIsGridView(false);
                                    handleTabChange(s.runId);
                                }}
                            >
                                <ToolboxView session={s} isCompact={true} />
                            </GridItem>
                        );
                    })}
                </div>
            ) : (
                <div className="flex-1 min-h-0 relative">
                    {subTab === 'history' ? (
                        <HistorySubTab />
                    ) : activeSession ? (
                        <ToolboxView key={activeSession.deviceUdid || activeSession.runId} session={activeSession} />
                    ) : (
                        <div className="h-full flex items-center justify-center text-zinc-400">
                            {t('tests_page.session_not_found')}
                        </div>
                    )}
                </div>
            )
            }
        </div >
    );
}

function GridItem({ title, children, onClose, onHide, className, onMaximize }: { title: React.ReactNode, children: React.ReactNode, onClose?: () => void, onHide?: () => void, className?: string, onMaximize?: () => void }) {
    const { t } = useTranslation();
    return (
        <div className={clsx(
            "flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-sm min-h-0 relative z-0",
            className
        )}>
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-2 max-w-[80%] truncate">
                    {title}
                </span>
                <div className="flex items-center gap-1">
                    {onMaximize && (
                        <button
                            onClick={onMaximize}
                            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded"
                            title={t('common.maximize')}
                        >
                            <Maximize2 size={14} />
                        </button>
                    )}
                    {onHide && (
                        <button
                            onClick={onHide}
                            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded"
                            title={t('common.minimize')}
                        >
                            <Minimize2 size={14} />
                        </button>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1 text-zinc-400 hover:text-red-500 rounded"
                            title={t('common.close')}
                        >
                            <XCircle size={14} />
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

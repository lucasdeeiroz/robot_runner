import { useState, useEffect, useRef } from 'react';
import { useTestSessions } from "@/lib/testSessionStore";
import { ToolboxView } from "../components/tabs/ToolboxView";
import { HistorySubTab } from "../components/tabs/HistorySubTab";
import { AndroidVersionPill } from "@/components/atoms/AndroidVersionPill";
import { XCircle, LayoutGrid, Minimize2, Maximize2, FileText } from 'lucide-react';
import { PageHeader } from "@/components/organisms/PageHeader";
import clsx from 'clsx';
import { useTranslation } from "react-i18next";
import { TabBar } from "@/components/organisms/TabBar";

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
            <PageHeader
                title={t('sidebar.tests')}
                description={t('sidebar.description_tests')}
                icon={FileText}
                iconSize="xl"
            />


            {/* View Toggle (Grid/Tabs) */}
            <div className="absolute top-4 right-4 z-10 hidden md:block">
            </div>

            {/* Modified Tabs Row with Grid Toggle */}
            <TabBar
                tabs={[
                    {
                        id: 'history',
                        label: t('tests_page.history'),
                        selected: subTab === 'history' && !isGridView
                    },
                    ...sessions.map(s => {
                        const isSuccess = s.exitCode && (s.exitCode.includes("exit code: 0") || s.exitCode === "0");
                        const isFailed = s.status === 'finished' && !isSuccess;

                        return {
                            id: s.runId,
                            label: (
                                <div className="flex items-center gap-2">
                                    {/* Status Dot */}
                                    {s.type === 'toolbox' && <span className="w-2.5 h-2.5 rounded-full bg-on-surface/10" />}
                                    {s.type === 'test' && s.status === 'running' && <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />}
                                    {s.type === 'test' && s.status === 'finished' && isSuccess && <span className="w-2.5 h-2.5 rounded-full bg-success" />}
                                    {s.type === 'test' && isFailed && <span className="w-2.5 h-2.5 rounded-full bg-error" />}
                                    {s.type === 'test' && s.status === 'error' && <span className="w-2.5 h-2.5 rounded-full bg-error" />}

                                    <span>{s.deviceModel || s.deviceName}</span>
                                    <AndroidVersionPill version={s.androidVersion} />
                                </div>
                            ),
                            onClose: () => clearSession(s.runId),
                            selected: isGridView ? visibleGridSessions.has(s.runId) : subTab === s.runId
                        };
                    })
                ]}
                activeId={subTab}
                onChange={(id) => {
                    if (isGridView) {
                        if (id === 'history') {
                            setIsGridView(false);
                            handleTabChange('history');
                        } else {
                            toggleGridSession(id);
                        }
                    } else {
                        handleTabChange(id);
                    }
                }}
                variant="pills"
                className="z-10 shrink-0"
                actions={
                    sessions.length >= 2 ? (
                        <button
                            onClick={() => setIsGridView(!isGridView)}
                            className={clsx(
                                "p-2 rounded-lg border transition-all shrink-0",
                                isGridView
                                    ? "bg-primary/10 border-none text-primary"
                                    : "bg-transparent border-none text-on-surface-variant/80 hover:text-on-surface-variant/80 hover:bg-surface-variant/30"
                            )}
                            title={isGridView ? t('toolbox.actions.switch_to_tabs') : t('toolbox.actions.switch_to_grid')}
                        >
                            <LayoutGrid size={20} />
                        </button>
                    ) : undefined
                }
            />

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
                                        {s.type === 'toolbox' && <span className="w-2 h-2 rounded-full bg-on-surface/10" />}
                                        {s.type === 'test' && s.status === 'running' && <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />}
                                        {s.type === 'test' && s.status === 'finished' && <span className={clsx("w-2 h-2 rounded-full", (s.exitCode?.includes("0") || s.exitCode === "0") ? "bg-success" : "bg-error")} />}
                                        <span>{s.deviceModel || s.deviceName}</span>
                                        <AndroidVersionPill version={s.androidVersion} className="bg-surface-variant/30" />
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
                        <div className="h-full flex items-center justify-center text-on-surface/80">
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
            "flex flex-col border border-outline-variant/30 rounded-xl shadow-sm min-h-0 relative z-0",
            className
        )}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-outline-variant/30 shrink-0">
                <span className="text-sm font-semibold text-on-surface-variant/80 flex items-center gap-2 max-w-[80%] truncate">
                    {title}
                </span>
                <div className="flex items-center gap-1">
                    {onMaximize && (
                        <button
                            onClick={onMaximize}
                            className="p-1 text-on-surface/80 hover:text-on-surface-variant/80 rounded"
                            title={t('common.maximize')}
                        >
                            <Maximize2 size={14} />
                        </button>
                    )}
                    {onHide && (
                        <button
                            onClick={onHide}
                            className="p-1 text-on-surface/80 hover:text-on-surface-variant/80 rounded"
                            title={t('common.minimize')}
                        >
                            <Minimize2 size={14} />
                        </button>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1 text-on-surface/80 hover:text-error rounded"
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

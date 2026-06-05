import { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSettings } from "@/lib/settings";
import { HistoryCharts } from "@/components/organisms/HistoryCharts";
import { Cloud, XCircle, Calendar, ChevronDown, ChevronRight, CheckCircle, Clock, PieChart, Search, RefreshCw, Settings, HardDrive } from 'lucide-react';
import clsx from 'clsx';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from "react-i18next";
import { feedback } from '@/lib/feedback';
import { Section } from "@/components/organisms/Section";
import { Button } from "@/components/atoms/Button";
import { AndroidVersionPill } from "@/components/atoms/AndroidVersionPill";
import { Input } from "@/components/atoms/Input";
import { Select } from "@/components/atoms/Select";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";
import { decodeHtml } from '@/lib/utils';
import { HistoryDetailModal } from '@/components/organisms/HistoryDetailModal';
import { getCachedHistory, setCachedHistory, TestLog } from '@/lib/historyCache';
import HistoryAIAnalysisModal from '@/components/organisms/HistoryAIAnalysisModal';
import { AiButton } from "@/components/atoms/AiButton";
import { auth } from '@/lib/firebase';
import { fetchGlobalHistory, uploadTestToFirebase } from '@/lib/testHistorySync';
import { useAuth } from '@/lib/authStore';

const formatDate = (dateStr: string) => {
    try {
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat(undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        }).format(date);
    } catch (e) {
        return dateStr;
    }
};


interface HistorySubTabProps {
    onNavigate?: (page: string) => void;
}

export function HistorySubTab({ onNavigate }: HistorySubTabProps) {
    const { user } = useAuth();
    const { t } = useTranslation();
    const { settings, updateSetting, activeProfileId } = useSettings();
    const [history, setHistory] = useState<TestLog[]>(getCachedHistory());
    const [filterText, setFilterText] = useState("");
    const [filterPeriod, setFilterPeriod] = useState("all_time");
    const [groupBy, setGroupBy] = useState("none");

    // Novas variáveis de filtro
    const [filterDevice, setFilterDevice] = useState("all");
    const [filterOS, setFilterOS] = useState("all");
    const [filterStatus, setFilterStatus] = useState("all");

    const [countMethod, setCountMethod] = useState<'suites' | 'tests'>('suites');

    const [showCharts, setShowCharts] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
    const [selectedLog, setSelectedLog] = useState<TestLog | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // AI Analysis State
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);
    const [isAnalyzingHistory] = useState(false);

    const parentRef = useRef<HTMLDivElement>(null);
    const historyContainerRef = useRef<HTMLDivElement>(null);
    const [isHistoryNarrow, setIsHistoryNarrow] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const isFirstRun = useRef(true);

    useEffect(() => {
        if (!historyContainerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setIsHistoryNarrow(entry.contentRect.width < 500);
            }
        });
        observer.observe(historyContainerRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        // Clear current history visually when path or user changes to prevent ghosting/duplication
        setHistory([]);
        setCachedHistory([]);

        const timer = setTimeout(() => {
            loadHistory();
            isFirstRun.current = false;
        }, 150);
        return () => clearTimeout(timer);
    }, [settings.paths.logs, user]);

    const loadHistory = async (refresh: boolean = false) => {
        setLoadingHistory(true);
        try {
            // 1. Load Local Logs from File System
            const localLogs = await invoke<TestLog[]>('get_test_history', {
                customPath: settings.paths.logs || null,
                refresh: refresh
            });

            let combinedLogs = [...localLogs];

            // 2. Fetch Global Logs from Firestore if logged in
            const currentUser = auth?.currentUser;
            if (currentUser && activeProfileId) {
                try {
                    const globalLogs = await fetchGlobalHistory(currentUser.uid, activeProfileId);
                    
                    // 3. Merge & Deduplicate
                    // Rule 1: Use run_id for absolute matching if available.
                    // Rule 2: Fallback to name+timestamp for older/missing records.
                    const merged = [...localLogs];
                    const matchedLocalIndices = new Set<number>();
                    
                    // Helper to normalize IDs for comparison (strips 'run_' prefix if present)
                    const normalizeId = (id?: string | null) => id?.replace(/^run_/, '') || '';

                    globalLogs.forEach(gLog => {
                        const gRunId = normalizeId(gLog.run_id);
                        const gDevice = gLog.device_udid || '';

                        // Find the best local match that hasn't been used yet
                        let matchedIdx = -1;
                        
                        // Pass 1: Try absolute run_id match
                        matchedIdx = localLogs.findIndex((lLog, idx) => {
                            if (matchedLocalIndices.has(idx)) return false;
                            const lRunId = normalizeId(lLog.run_id);
                            return lRunId && gRunId && lRunId === gRunId;
                        });

                        // Pass 2: Try heuristic (Name + Time + Device)
                        if (matchedIdx === -1) {
                            matchedIdx = localLogs.findIndex((lLog, idx) => {
                                if (matchedLocalIndices.has(idx)) return false;
                                
                                const timeDiff = Math.abs(new Date(lLog.timestamp).getTime() - new Date(gLog.timestamp).getTime());
                                const cleanLName = decodeHtml(lLog.suite_name).toLowerCase();
                                const cleanGName = decodeHtml(gLog.suite_name).toLowerCase();
                                const lDevice = lLog.device_udid || '';

                                // Heuristic criteria: Name match AND close time AND same device
                                const isNameMatch = cleanLName === cleanGName || cleanLName.includes(cleanGName) || cleanGName.includes(cleanLName);
                                const isDeviceMatch = !lDevice || !gDevice || lDevice === gDevice; // Only match device if both present

                                return isNameMatch && timeDiff < 60000 && isDeviceMatch;
                            });
                        }

                        if (matchedIdx !== -1) {
                            const localMatch = localLogs[matchedIdx];
                            localMatch.has_remote_sync = true;
                            if (!localMatch.id) localMatch.id = gLog.id;
                            matchedLocalIndices.add(matchedIdx);
                            console.log("[Sync] Matched cloud record to local:", { suite: gLog.suite_name, device: gDevice });
                        } else {
                            // No local match found, add as cloud-only
                            const alreadyAdded = merged.find(m => m.id === gLog.id || (m.run_id && m.run_id === gLog.run_id));
                            if (!alreadyAdded) {
                                merged.push(gLog);
                            }
                        }
                    });

                    // Sort by timestamp descending
                    combinedLogs = merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

                    // Sync any unsynced local logs to Firebase
                    const unsyncedLogs = localLogs.filter((_, idx) => !matchedLocalIndices.has(idx));
                    if (unsyncedLogs.length > 0) {
                        console.log(`[Sync] Found ${unsyncedLogs.length} unsynced local logs. Syncing in background...`);
                        Promise.all(
                            unsyncedLogs.map(async (log) => {
                                const docId = await uploadTestToFirebase(currentUser.uid, activeProfileId, log);
                                if (docId) {
                                    return { xml_path: log.xml_path, docId };
                                }
                                return null;
                            })
                        ).then((results) => {
                            const successfulUploads = results.filter((r): r is { xml_path: string; docId: string } => r !== null);
                            if (successfulUploads.length > 0) {
                                console.log(`[Sync] Successfully synced ${successfulUploads.length} logs to Firebase.`);
                                setHistory(prev => {
                                    const updated = prev.map(log => {
                                        const match = successfulUploads.find(u => u.xml_path === log.xml_path);
                                        if (match) {
                                            return { ...log, has_remote_sync: true, id: match.docId };
                                        }
                                        return log;
                                    });
                                    setCachedHistory(updated);
                                    return updated;
                                });
                            }
                        });
                    }
                } catch (err) {
                    console.error("[Sync] Failed to fetch/sync global history:", err);
                }
            }

            setHistory(combinedLogs);
            setCachedHistory(combinedLogs);
        } catch (e) {
            feedback.toast.error("tests_page.load_error", e);
        } finally {
            setLoadingHistory(false);
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    const handleAIAnalysis = () => {
        setIsAIModalOpen(true);
    };

    const isDateInPeriod = (dateStr: string, period: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffIds = (now.getTime() - date.getTime()) / (1000 * 3600 * 24);

        if (period === 'today') return diffIds < 1;
        if (period === 'last_7_days') return diffIds <= 7;
        if (period === 'last_30_days') return diffIds <= 30;
        return true;
    };

    const { devices, osVersions, statuses } = useMemo(() => {
        const devs = new Set<string>();
        const os = new Set<string>();
        const stats = new Set<string>();

        history.forEach(log => {
            if (log.device_model) devs.add(log.device_model);
            if (log.android_version) os.add(log.android_version);
            if (log.status) stats.add(log.status);
        });

        return {
            devices: Array.from(devs).sort(),
            osVersions: Array.from(os).sort(),
            statuses: Array.from(stats).sort()
        };
    }, [history]);

    const filteredHistory = useMemo(() => {
        return history.filter(log => {
            const decodedName = decodeHtml(log.suite_name);
            const matchesText = decodedName.toLowerCase().includes(filterText.toLowerCase());
            const matchesPeriod = isDateInPeriod(log.timestamp, filterPeriod);

            const matchesDevice = filterDevice === "all" || log.device_model === filterDevice;
            const matchesOS = filterOS === "all" || log.android_version === filterOS;
            const matchesStatus = filterStatus === "all" || log.status === filterStatus;

            return matchesText && matchesPeriod && matchesDevice && matchesOS && matchesStatus;
        });
    }, [history, filterText, filterPeriod, filterDevice, filterOS, filterStatus]);

    const groupedHistory = useMemo(() => {
        if (groupBy === 'none') return { 'All': filteredHistory };

        const groups: Record<string, TestLog[]> = {};

        if (groupBy === 'status') {
            groups['PASS'] = filteredHistory.filter(l => l.status === 'PASS');
            groups['FAIL'] = filteredHistory.filter(l => l.status === 'FAIL');
        } else if (groupBy === 'device') {
            filteredHistory.forEach(log => {
                const devName = log.device_model ? `${log.device_model} (${log.device_udid})` : (log.device_udid || 'Unknown Device');
                if (!groups[devName]) groups[devName] = [];
                groups[devName].push(log);
            });
        } else if (groupBy === 'suite') {
            filteredHistory.forEach(log => {
                const suite = decodeHtml(log.suite_name || 'Unknown');
                if (!groups[suite]) groups[suite] = [];
                groups[suite].push(log);
            });
        } else if (groupBy === 'os_version') {
            filteredHistory.forEach(log => {
                const ver = log.android_version ? `Android ${log.android_version}` : t('tests_page.unknown_os');
                if (!groups[ver]) groups[ver] = [];
                groups[ver].push(log);
            });
        }
        return groups;
    }, [filteredHistory, groupBy, t]);


    const toggleGroup = (group: string) => {
        setCollapsedGroups(prev => ({
            ...prev,
            [group]: !prev[group]
        }));
    };

    const handleLogClick = (log: TestLog) => {
        setSelectedLog(log);
        setIsModalOpen(true);
    };

    const updateLog = (updatedLog: TestLog) => {
        setHistory(prev => prev.map(log =>
            log.xml_path === updatedLog.xml_path ? { ...log, ...updatedLog } : log
        ));
        if (selectedLog?.xml_path === updatedLog.xml_path) {
            setSelectedLog({ ...selectedLog, ...updatedLog });
        }
    };

    // Flatten the grouped history for virtualization
    type VirtualItem =
        | { type: 'header'; id: string; groupName: string; count: number }
        | { type: 'log'; id: string; log: TestLog; groupName: string };

    const flatItems = useMemo(() => {
        const items: VirtualItem[] = [];
        Object.entries(groupedHistory).forEach(([groupName, logs]) => {
            if (logs.length === 0) return;

            if (groupBy !== 'none') {
                items.push({ type: 'header', id: `header-${groupName}`, groupName, count: logs.length });
            }

            if (groupBy === 'none' || !collapsedGroups[groupName]) {
                logs.forEach(log => {
                    items.push({ type: 'log', id: log.xml_path, log, groupName });
                });
            }
        });
        return items;
    }, [groupedHistory, groupBy, collapsedGroups]);

    // Setup React Virtualizer
    const rowVirtualizer = useVirtualizer({
        count: flatItems.length,
        getScrollElement: () => parentRef.current,
        estimateSize: (index) => flatItems[index].type === 'header' ? 44 : 96,
        overscan: 10,
    });

    return (
        <div ref={historyContainerRef} className="flex-1 min-h-0 bg-surface border border-outline-variant/30 rounded-2xl p-4 overflow-hidden relative flex flex-col">
            <Section
                title={t('tests_page.history')}
                icon={Calendar}
                variant="transparent"
                className="p-0 pb-4 mb-4"
                status={
                    <div className="flex items-center gap-2">
                        <AiButton
                            id="history_analysis"
                            onClick={handleAIAnalysis}
                            isLoading={isAnalyzingHistory}
                            disabled={filteredHistory.length === 0 || isAnalyzingHistory}
                            label={t('tests_page.actions.analyze_history')}
                            variant="primary"
                            className="shadow-lg shadow-primary/10 ml-2 h-8"
                            allowCustomPrompt={false}
                        />
                        <Button
                            onClick={() => loadHistory(true)}
                            variant="ghost"
                            size="sm"
                            className="p-1.5 text-on-surface-variant/80 hover:bg-surface-variant/30 rounded-2xl transition-colors h-auto"
                            title={t('tests_page.actions.refresh')}
                        >
                            {loadingHistory ? <ExpressiveLoading size="xsm" variant="circular" /> : <RefreshCw size={16} />}
                        </Button>
                    </div>
                } menus={!isHistoryNarrow ? (
                    <div className="flex-1 min-w-[200px] max-w-sm">
                        <Input
                            placeholder={t('tests_page.filter.search')}
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            leftIcon={<Search size={16} />}
                            className="bg-surface/50"
                        />
                    </div>
                ) : null
                }
                actions={
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={() => setShowCharts(!showCharts)}
                            variant="ghost"
                            size="sm"
                            className={clsx(
                                "px-3 py-1.5 rounded-2xl flex items-center gap-2 text-sm font-medium transition-colors h-auto",
                                showCharts
                                    ? "bg-primary/20 text-primary hover:bg-primary/30"
                                    : "text-on-surface-variant hover:bg-surface-variant/30"
                            )}
                        >
                            <PieChart size={16} />
                            {!isHistoryNarrow && (showCharts ? t('tests_page.charts.hide') : t('tests_page.charts.show'))}
                        </Button>
                    </div>
                }
            />

            {!isHistoryNarrow && (
                <div className="flex flex-wrap items-center gap-2 mb-4 justify-between w-full">
                    <div className="flex flex-wrap items-center gap-2">
                        <Select
                            value={filterPeriod}
                            onChange={(e) => setFilterPeriod(e.target.value)}
                            options={[
                                { value: "all_time", label: t('tests_page.filter.all_time') },
                                { value: "today", label: t('tests_page.filter.today') },
                                { value: "last_7_days", label: t('tests_page.filter.last_7_days') },
                                { value: "last_30_days", label: t('tests_page.filter.last_30_days') }
                            ]}
                            className="bg-surface/50 py-1.5 text-sm"
                            containerClassName="w-auto min-w-[130px]"
                        />
                        <Select
                            value={groupBy}
                            onChange={(e) => setGroupBy(e.target.value)}
                            options={[
                                { value: "none", label: `${t('tests_page.filter.group_by')}: ${t('tests_page.filter.none')}` },
                                { value: "status", label: t('tests_page.filter.status') },
                                { value: "device", label: t('tests_page.filter.device') },
                                { value: "suite", label: t('tests_page.filter.suite') },
                                { value: "os_version", label: t('tests_page.filter.os_version') }
                            ]}
                            className="bg-surface/50 py-1.5 text-sm"
                            containerClassName="w-auto min-w-[150px]"
                        />
                        <Select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            options={[
                                { value: "all", label: t('tests_page.filter.all_status') },
                                ...statuses.map(s => ({ value: s, label: s }))
                            ]}
                            className="bg-surface/50 py-1.5 text-sm"
                            containerClassName="w-auto min-w-[120px]"
                        />
                        <Select
                            value={filterDevice}
                            onChange={(e) => setFilterDevice(e.target.value)}
                            options={[
                                { value: "all", label: t('tests_page.filter.all_devices') },
                                ...devices.map(d => ({ value: d, label: d }))
                            ]}
                            className="bg-surface/50 py-1.5 text-sm"
                            containerClassName="w-auto min-w-[150px]"
                        />
                        <Select
                            value={filterOS}
                            onChange={(e) => setFilterOS(e.target.value)}
                            options={[
                                { value: "all", label: t('tests_page.filter.all_os') },
                                ...osVersions.map(o => ({ value: o, label: `Android ${o}` }))
                            ]}
                            className="bg-surface/50 py-1.5 text-sm"
                            containerClassName="w-auto min-w-[120px]"
                        />


                    </div>

                    {showCharts && (
                        <div className="flex items-center bg-surface/50 border border-outline-variant/30 rounded-lg p-1">
                            <button
                                onClick={() => setCountMethod('suites')}
                                className={clsx("px-3 py-1.5 text-xs font-medium rounded-md transition-colors", countMethod === 'suites' ? "bg-primary/20 text-primary" : "text-on-surface-variant hover:bg-on-surface/5")}
                            >
                                {t('tests_page.charts.count_by_suites')}
                            </button>
                            <button
                                onClick={() => setCountMethod('tests')}
                                className={clsx("px-3 py-1.5 text-xs font-medium rounded-md transition-colors", countMethod === 'tests' ? "bg-primary/20 text-primary" : "text-on-surface-variant hover:bg-on-surface/5")}
                            >
                                {t('tests_page.charts.count_by_tests')}
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div ref={parentRef} className="flex-1 overflow-y-auto pr-2 relative">
                <AnimatePresence>
                    {showCharts && (
                        <HistoryCharts logs={filteredHistory} groupBy={groupBy} countMethod={countMethod} />
                    )}
                </AnimatePresence>

                {/* Background Loading Indicator (Subtle Linear) */}
                {loadingHistory && history.length > 0 && (
                    <div className="sticky top-0 left-0 right-0 z-20 h-1 overflow-hidden">
                        <ExpressiveLoading variant="linear" size="xsm" className="w-full h-full opacity-60" />
                    </div>
                )}

                {/* Initial Loading Spinner (Large Centered) */}
                {loadingHistory && history.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 p-4 text-on-surface-variant/60">
                        <ExpressiveLoading size="md" variant="circular" className="mb-4" />
                        <p className="text-sm font-medium animate-pulse">{t('tests_page.loading_history')}</p>
                    </div>
                )}

                {/* Empty State / Not Configured */}
                {!loadingHistory && filteredHistory.length === 0 && (
                    <div className="flex flex-col items-center justify-center text-on-surface/80 border-2 border-dashed border-outline-variant/30 rounded-2xl m-4 p-6 text-center">
                        {!settings.paths.logs ? (
                            <>
                                <div className="p-4 bg-primary/10 rounded-full text-primary mb-4">
                                    <PieChart size={48} className="opacity-40" />
                                </div>
                                <h3 className="text-lg font-medium text-on-surface mb-2">
                                    {t('file_explorer.not_configured')}
                                </h3>
                                <p className="text-sm text-on-surface-variant max-w-xs mx-auto mb-6">
                                    {t('settings_page.paths.logs_desc', "Configure o diretório onde os logs do Robot Framework são salvos para visualizar o histórico.")}
                                </p>
                                <div className="flex gap-4">
                                    <Button
                                        onClick={async () => {
                                            const { open } = await import("@tauri-apps/plugin-dialog");
                                            const selected = await open({
                                                directory: true,
                                                multiple: false,
                                                defaultPath: settings.paths.automationRoot || undefined
                                            });

                                            if (selected && typeof selected === 'string') {
                                                updateSetting('paths', {
                                                    ...settings.paths,
                                                    logs: selected
                                                });
                                                feedback.toast.success(t('settings_page.path_auto_updated', { path: selected }));
                                            }
                                        }}
                                        variant="primary"
                                        leftIcon={<Calendar size={18} />}
                                    >
                                        {t('file_explorer.select_folder_btn')}
                                    </Button>

                                    {onNavigate && (
                                        <Button
                                            variant="secondary"
                                            onClick={() => onNavigate('settings')}
                                            leftIcon={<Settings size={18} />}
                                        >
                                            {t('common.go_to_settings')}
                                        </Button>
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                <Calendar className="mb-4 opacity-20" size={48} />
                                <p className="font-medium opacity-60">{t('tests_page.no_logs')}</p>
                            </>
                        )}
                    </div>
                )}

                <div className={clsx("w-full transition-opacity pb-8", loadingHistory && history.length === 0 ? "opacity-0" : "opacity-100")}>
                    <div
                        style={{
                            height: `${rowVirtualizer.getTotalSize()}px`,
                            width: '100%',
                            position: 'relative',
                        }}
                    >
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const item = flatItems[virtualRow.index];

                            return (
                                <div
                                    key={item.type === 'header' 
                                        ? `header-${item.groupName}` 
                                        : `${(item as any).run_id || (item as any).id || (item as any).path || virtualRow.index}`
                                    }
                                    data-index={virtualRow.index}
                                    ref={rowVirtualizer.measureElement}
                                    className="absolute top-0 left-0 w-full"
                                    style={{
                                        transform: `translateY(${virtualRow.start}px)`,
                                        paddingBottom: item.type === 'log' ? '12px' : '4px',
                                        zIndex: item.type === 'header' ? 10 : 1,
                                    }}
                                >
                                    {item.type === 'header' ? (
                                        <Button
                                            onClick={() => toggleGroup(item.groupName)}
                                            variant="ghost"
                                            className="flex items-center gap-2 w-full justify-start bg-surface-variant/30 px-3 py-2 rounded-2xl hover:bg-outline-variant transition-colors backdrop-blur-sm z-10 h-auto"
                                        >
                                            {!collapsedGroups[item.groupName] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            <span className="font-semibold text-sm text-on-surface-variant/80 flex-1 text-left">
                                                {item.groupName === 'PASS' ? <span className="text-on-success-container/10">{item.groupName}</span> :
                                                    item.groupName === 'FAIL' ? <span className="text-error-container/80">{item.groupName}</span> : item.groupName}
                                            </span>
                                            <span className="text-xs text-on-surface-variant/80 bg-outline-variant px-1.5 py-0.5 rounded-2xl">
                                                {item.count}
                                            </span>
                                        </Button>
                                    ) : (
                                        <div
                                            onClick={() => handleLogClick(item.log)}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    handleLogClick(item.log);
                                                }
                                            }}
                                            className="flex flex-row items-center gap-4 p-4 bg-surface/50 border border-outline-variant/30 rounded-2xl hover:border-primary/40 hover:bg-surface-variant/10 cursor-pointer transition-all shadow-sm group mx-1"
                                        >
                                            <div className="flex gap-4 items-start min-w-0 flex-1">
                                                <div className={clsx(
                                                    "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-1 transition-transform group-hover:scale-110",
                                                    item.log.status === 'PASS'
                                                        ? "bg-success/10 text-on-success-container"
                                                        : "bg-error/10 text-on-error-container"
                                                )}>
                                                    {item.log.status === 'PASS' ? <CheckCircle size={20} /> : <XCircle size={20} />}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-semibold text-on-surface/80 truncate group-hover:text-primary transition-colors" title={decodeHtml(item.log.suite_name)}>
                                                            {decodeHtml(item.log.suite_name)}
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant/80">
                                                        <div className="flex items-center gap-1">
                                                            <Calendar size={12} /> {formatDate(item.log.timestamp)}
                                                            <div className="flex items-center gap-1.5 ml-2">
                                                                {item.log.xml_path && (
                                                                    <div className="text-on-surface-variant/40" title={t('common.local_storage', "Armazenamento Local")}>
                                                                        <HardDrive size={12} />
                                                                    </div>
                                                                )}
                                                                {(item.log.is_remote || item.log.has_remote_sync) && (
                                                                    <div className="text-primary/60" title={t('common.cloud_sync', "Sincronizado na Nuvem")}>
                                                                        <Cloud size={12} />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1 bg-surface-variant/30 px-1.5 py-0.5 rounded text-[10px] font-medium border border-outline-variant/10">
                                                            <Clock size={10} className="shrink-0" />
                                                            <span>{item.log.duration}</span>
                                                            <span className="mx-1 opacity-20 h-2 w-[1px] bg-current" />
                                                            <span className="text-success">{item.log.pass_count}P</span>
                                                            <span className="opacity-30">/</span>
                                                            <span className={clsx(item.log.fail_count > 0 ? "text-error" : "opacity-40")}>{item.log.fail_count}F</span>
                                                        </div>
                                                        {(item.log.device_model || item.log.device_udid) && (
                                                            <div className="flex items-center gap-1 text-on-surface/80">
                                                                {item.log.android_version && <AndroidVersionPill version={item.log.android_version} className="bg-surface-variant/50" />}
                                                                {item.log.device_model || t('tests_page.unknown_model')}
                                                                {item.log.device_udid ? ` (${item.log.device_udid})` : ''}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className={clsx("text-xs font-bold px-1.5 py-0.5 rounded border",
                                                    item.log.status === 'PASS'
                                                        ? "bg-success/10 text-on-success-container border-success/20"
                                                        : "bg-error/10 text-on-error-container border-error/20"
                                                )}>
                                                    {item.log.status}
                                                </span>
                                                <div className="text-on-surface-variant/30 group-hover:text-primary/50 transition-colors">
                                                    <ChevronRight size={18} />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <HistoryDetailModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                log={selectedLog}
                onUpdateLog={updateLog}
            />

            <HistoryAIAnalysisModal
                isOpen={isAIModalOpen}
                onClose={() => setIsAIModalOpen(false)}
                historyData={filteredHistory}
                logsPath={settings.paths.logs || 'default'}
            />
        </div>
    );
}

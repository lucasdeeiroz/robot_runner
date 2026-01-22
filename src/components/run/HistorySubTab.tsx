import { useState, useEffect, useRef } from 'react';
import { useSettings } from "@/lib/settings";
import { HistoryCharts } from "../organisms/HistoryCharts";
import { XCircle, FileText, Folder, Calendar, RefreshCw, ChevronDown, ChevronRight, CheckCircle, Clock, PieChart } from 'lucide-react';
import clsx from 'clsx';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from "react-i18next";
import { feedback } from '@/lib/feedback';
import { Section } from "@/components/organisms/Section";

interface TestLog {
    path: string;
    suite_name: string;
    status: 'PASS' | 'FAIL';
    device_udid?: string | null;
    device_model?: string | null;
    android_version?: string | null;
    timestamp: string;
    duration: string;
    xml_path: string;
    log_html_path: string;
}

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

const decodeHtml = (text: string) => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        return doc.documentElement.textContent || text;
    } catch (e) {
        return text;
    }
};

export function HistorySubTab() {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const [history, setHistory] = useState<TestLog[]>([]);
    const [filterText, setFilterText] = useState("");
    const [filterPeriod, setFilterPeriod] = useState("all_time");
    const [groupBy, setGroupBy] = useState("none");
    const [showCharts, setShowCharts] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

    const historyContainerRef = useRef<HTMLDivElement>(null);
    const [isHistoryNarrow, setIsHistoryNarrow] = useState(false);

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
        loadHistory();
    }, [settings.paths.logs]);

    const loadHistory = async (refresh: boolean = false) => {
        setLoadingHistory(true);
        try {
            const logs = await invoke<TestLog[]>('get_test_history', {
                customPath: settings.paths.logs || null,
                refresh: refresh
            });
            setHistory(logs);
        } catch (e) {
            feedback.toast.error("tests_page.load_error", e);
        } finally {
            setLoadingHistory(false);
        }
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

    const filteredHistory = history.filter(log => {
        const decodedName = decodeHtml(log.suite_name);
        const matchesText = decodedName.toLowerCase().includes(filterText.toLowerCase());
        const matchesPeriod = isDateInPeriod(log.timestamp, filterPeriod);
        return matchesText && matchesPeriod;
    });

    const groupedHistory = () => {
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
    };

    const openLog = async (path: string) => {
        try {
            await invoke('open_log_folder', { path });
        } catch (e) {
            feedback.toast.error("common.errors.open_file_failed", e);
        }
    };

    const toggleGroup = (group: string) => {
        setCollapsedGroups(prev => ({
            ...prev,
            [group]: !prev[group]
        }));
    };

    const renderGroup = (group: string, logs: TestLog[]) => {
        const isCollapsed = collapsedGroups[group] === true;
        const isExpanded = !isCollapsed;

        return (
            <div key={group} className="space-y-2">
                {groupBy !== 'none' && (
                    <button
                        onClick={() => toggleGroup(group)}
                        className="flex items-center gap-2 w-full text-left bg-zinc-100 dark:bg-zinc-800/80 px-3 py-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors sticky top-0 backdrop-blur-sm z-10"
                    >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="font-semibold text-sm text-zinc-700 dark:text-zinc-300">
                            {group === 'PASS' ? <span className="text-green-600 dark:text-green-400">{group}</span> :
                                group === 'FAIL' ? <span className="text-red-600 dark:text-red-400">{group}</span> : group}
                        </span>
                        <span className="text-xs text-zinc-500 bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded-full">
                            {logs.length}
                        </span>
                    </button>
                )}

                {isExpanded && (
                    <div className="space-y-3 pl-1">
                        {logs.map((log, i) => (
                            <div key={i} className="flex flex-row items-center gap-4 p-4 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-700/50 rounded-lg hover:border-blue-200 dark:hover:border-blue-700 transition-colors shadow-sm">
                                <div className="flex gap-4 items-start min-w-0 flex-1">
                                    <div className={clsx(
                                        "w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-1",
                                        log.status === 'PASS'
                                            ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                                            : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                    )}>
                                        {log.status === 'PASS' ? <CheckCircle size={20} /> : <XCircle size={20} />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate" title={decodeHtml(log.suite_name)}>
                                                {decodeHtml(log.suite_name)}
                                            </span>
                                            <span className={clsx("text-xs font-bold px-1.5 py-0.5 rounded border",
                                                log.status === 'PASS'
                                                    ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                                                    : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
                                            )}>
                                                {log.status}
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                                            <div className="flex items-center gap-1">
                                                <Calendar size={12} /> {formatDate(log.timestamp)}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Clock size={12} /> {log.duration}
                                            </div>
                                            {(log.device_model || log.device_udid) && (
                                                <div className="flex items-center gap-1 text-zinc-400">
                                                    {log.android_version ? `Android ${log.android_version} • ` : ''}
                                                    {log.device_model || t('tests_page.unknown_model')}
                                                    {log.device_udid ? ` (${log.device_udid})` : ''}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0 border-l border-zinc-100 dark:border-zinc-700 pl-3">
                                    <button
                                        onClick={() => openLog(log.log_html_path)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 hover:bg-primary/10 text-zinc-600 hover:text-primary dark:bg-zinc-800 dark:hover:bg-blue-900/20 dark:text-zinc-400 dark:hover:text-blue-400 rounded-md text-xs font-medium transition-colors"
                                        title={isHistoryNarrow ? t('tests_page.report') : log.log_html_path}
                                    >
                                        <FileText size={14} /> {!isHistoryNarrow && t('tests_page.report')}
                                    </button>
                                    <button
                                        onClick={() => openLog(log.path)}
                                        className="flex items-center justify-center p-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-400 rounded-md transition-colors"
                                        title={t('tests_page.open_folder')}
                                    >
                                        <Folder size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div ref={historyContainerRef} className="flex-1 min-h-0 bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 overflow-hidden relative flex flex-col">
            <Section
                title={t('tests_page.history')}
                icon={Calendar}
                variant="transparent"
                className="p-0 pb-4 mb-4"
                status={
                    <button
                        onClick={() => loadHistory(true)}
                        className="p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                        title={t('tests_page.actions.refresh')}
                    >
                        <RefreshCw size={16} className={loadingHistory ? "animate-spin" : ""} />
                    </button>
                }
                menus={!isHistoryNarrow ? (
                    <div className="flex flex-wrap gap-2">
                        <input
                            type="text"
                            placeholder={t('tests_page.filter.search')}
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            className="flex-1 min-w-[200px] bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/50"
                        />
                        <select
                            value={filterPeriod}
                            onChange={(e) => setFilterPeriod(e.target.value)}
                            className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/50"
                        >
                            <option value="all_time">{t('tests_page.filter.all_time')}</option>
                            <option value="today">{t('tests_page.filter.today')}</option>
                            <option value="last_7_days">{t('tests_page.filter.last_7_days')}</option>
                            <option value="last_30_days">{t('tests_page.filter.last_30_days')}</option>
                        </select>
                        <select
                            value={groupBy}
                            onChange={(e) => setGroupBy(e.target.value)}
                            className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/50"
                        >
                            <option value="none">{t('tests_page.filter.group_by')}: {t('tests_page.filter.all_time').replace('Todo o período', 'Nenhum')}</option>
                            <option value="status">{t('tests_page.filter.status')}</option>
                            <option value="device">{t('tests_page.filter.device')}</option>
                            <option value="suite">{t('tests_page.filter.suite')}</option>
                            <option value="os_version">{t('tests_page.filter.os_version') || "Versão do SO"}</option>
                        </select>
                    </div>
                ) : null
                }
                actions={
                    <button
                        onClick={() => setShowCharts(!showCharts)}
                        className={clsx(
                            "px-3 py-1.5 rounded-md flex items-center gap-2 text-sm font-medium transition-colors",
                            showCharts
                                ? "bg-primary/10 text-primary"
                                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                        )}
                        title={showCharts ? t('tests_page.charts.hide') : t('tests_page.charts.show')}
                    >
                        <PieChart size={16} />
                    </button>
                }
            />

            <div className="flex-1 overflow-y-auto pr-2">
                {showCharts && (
                    <HistoryCharts logs={filteredHistory} groupBy={groupBy} />
                )}

                {loadingHistory && <div className="text-center p-4 text-zinc-500">{t('tests_page.loading')}</div>}

                {!loadingHistory && filteredHistory.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-400">
                        <p>{t('tests_page.no_logs')}</p>
                    </div>
                )}

                <div className="space-y-6">
                    {Object.entries(groupedHistory()).map(([group, logs]) => (
                        logs.length > 0 && renderGroup(group, logs)
                    ))}
                </div>
            </div>
        </div>
    );
}

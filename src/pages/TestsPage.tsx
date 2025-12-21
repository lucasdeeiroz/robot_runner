import { useState, useEffect } from 'react';
import { useTestSessions } from "@/lib/testSessionStore";
import { useSettings } from "@/lib/settings";
import { ToolboxView } from "../components/run/ToolboxView";
import { XCircle, FileText, Folder, Calendar, RefreshCw, ChevronDown, ChevronRight, CheckCircle, Clock } from 'lucide-react';
import clsx from 'clsx';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from "react-i18next";

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

export function TestsPage() {
    const { t } = useTranslation();
    const { sessions, activeSessionId, setActiveSessionId, clearSession } = useTestSessions();
    const { settings } = useSettings();
    const [subTab, setSubTab] = useState<'history' | string>('history');
    const [history, setHistory] = useState<TestLog[]>([]);
    const [filterText, setFilterText] = useState("");
    const [filterPeriod, setFilterPeriod] = useState("all_time");
    const [groupBy, setGroupBy] = useState("none");
    const [loadingHistory, setLoadingHistory] = useState(false);

    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (activeSessionId !== 'dashboard') {
            setSubTab(activeSessionId);
        }
    }, [activeSessionId]);

    useEffect(() => {
        if (subTab === 'history') {
            loadHistory();
        }
    }, [subTab, settings.paths.logs]);

    const loadHistory = async (refresh: boolean = false) => {
        setLoadingHistory(true);
        try {
            const logs = await invoke<TestLog[]>('get_test_tests_history', {
                customPath: settings.paths.logs || null,
                refresh: refresh
            });
            setHistory(logs);
        } catch (e) {
            console.error("Failed to load history", e);
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
        const matchesText = log.suite_name.toLowerCase().includes(filterText.toLowerCase());
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
                const suite = log.suite_name || 'Unknown';
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
            console.error("Failed to open file/folder", e);
        }
    };

    const handleTabChange = (id: string) => {
        setSubTab(id);
        if (id !== 'history') {
            setActiveSessionId(id);
        } else {
            setActiveSessionId('dashboard');
        }
    };

    const activeSession = sessions.find(s => s.runId === subTab);

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
                            <div key={i} className="flex flex-col sm:flex-row gap-4 p-4 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-700/50 rounded-lg hover:border-blue-200 dark:hover:border-blue-700 transition-colors shadow-sm">
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
                                            <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate" title={log.suite_name}>
                                                {log.suite_name}
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

                                <div className="flex items-center gap-2 shrink-0 border-t sm:border-t-0 sm:border-l border-zinc-100 dark:border-zinc-700 pt-3 sm:pt-0 sm:pl-3">
                                    <button
                                        onClick={() => openLog(log.log_html_path)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 hover:bg-blue-50 text-zinc-600 hover:text-blue-600 dark:bg-zinc-800 dark:hover:bg-blue-900/20 dark:text-zinc-400 dark:hover:text-blue-400 rounded-md text-xs font-medium transition-colors"
                                        title={log.log_html_path}
                                    >
                                        <FileText size={14} /> {t('tests_page.report')}
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
        <div className="h-full flex flex-col space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0 mb-2">
                <h1 className="text-2xl font-bold">
                    {activeSession?.type === 'toolbox' ? t('tests_page.toolbox') : t('tests_page.monitoring')}
                </h1>
            </div>

            {/* Tabs */}
            <div className="flex bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-lg w-full overflow-x-auto no-scrollbar gap-1 border border-zinc-200 dark:border-zinc-800 shrink-0">
                <button
                    onClick={() => handleTabChange('history')}
                    className={clsx(
                        "px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap",
                        subTab === 'history'
                            ? "bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm"
                            : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white/50 dark:hover:bg-zinc-700/50"
                    )}
                >
                    {t('tests_page.history')}
                </button>

                {sessions.map(s => {
                    const isSuccess = s.exitCode && (s.exitCode.includes("exit code: 0") || s.exitCode === "0");
                    const isFailed = s.status === 'finished' && !isSuccess;

                    return (
                        <div key={s.runId} className={clsx(
                            "group flex items-center gap-2 pl-3 pr-2 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap border border-transparent",
                            subTab === s.runId
                                ? "bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm border-zinc-200 dark:border-zinc-600"
                                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white/50 dark:hover:bg-zinc-700/50"
                        )}>
                            <button onClick={() => handleTabChange(s.runId)} className="flex items-center gap-2">
                                {s.type === 'toolbox' && <span className="w-2.5 h-2.5 rounded-full bg-zinc-400" />}
                                {s.type === 'test' && s.status === 'running' && <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />}
                                {s.type === 'test' && s.status === 'finished' && isSuccess && <span className="w-2.5 h-2.5 rounded-full bg-green-500" />}
                                {s.type === 'test' && isFailed && <span className="w-2.5 h-2.5 rounded-full bg-red-500" />}
                                {s.type === 'test' && s.status === 'error' && <span className="w-2.5 h-2.5 rounded-full bg-red-500" />}
                                <span>{s.deviceName}</span>
                            </button>
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

            {/* Content */}
            <div className="flex-1 min-h-0 bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 overflow-hidden relative">
                {subTab === 'history' ? (
                    <div className="h-full flex flex-col">
                        {/* Filters Bar */}
                        <div className="flex flex-wrap gap-4 mb-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                            <input
                                type="text"
                                placeholder={t('tests_page.filter.search')}
                                value={filterText}
                                onChange={(e) => setFilterText(e.target.value)}
                                className="flex-1 min-w-[200px] bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm"
                            />
                            <select
                                value={filterPeriod}
                                onChange={(e) => setFilterPeriod(e.target.value)}
                                className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm"
                            >
                                <option value="all_time">{t('tests_page.filter.all_time')}</option>
                                <option value="today">{t('tests_page.filter.today')}</option>
                                <option value="last_7_days">{t('tests_page.filter.last_7_days')}</option>
                                <option value="last_30_days">{t('tests_page.filter.last_30_days')}</option>
                            </select>
                            <select
                                value={groupBy}
                                onChange={(e) => setGroupBy(e.target.value)}
                                className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm"
                            >
                                <option value="none">{t('tests_page.filter.group_by')}: {t('tests_page.filter.all_time').replace('Todo o período', 'Nenhum')}</option>
                                <option value="status">{t('tests_page.filter.status')}</option>
                                <option value="device">{t('tests_page.filter.device')}</option>
                                <option value="suite">{t('tests_page.filter.suite')}</option>
                                <option value="os_version">{t('tests_page.filter.os_version') || "Versão do SO"}</option>
                            </select>
                            <button
                                onClick={() => loadHistory(true)}
                                className="p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md"
                                title={t('tests_page.actions.refresh')}
                            >
                                <RefreshCw size={16} className={loadingHistory ? "animate-spin" : ""} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2">
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
                ) : activeSession ? (
                    <ToolboxView session={activeSession} />
                ) : (
                    <div className="h-full flex items-center justify-center text-zinc-400">
                        {t('tests_page.session_not_found')}
                    </div>
                )}
            </div>
        </div>
    );
}

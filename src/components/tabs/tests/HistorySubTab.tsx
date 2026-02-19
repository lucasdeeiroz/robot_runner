import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSettings } from "@/lib/settings";
import { HistoryCharts } from "@/components/organisms/HistoryCharts";
import { XCircle, FileText, Folder, Calendar, ChevronDown, ChevronRight, CheckCircle, Clock, PieChart, Search, RefreshCw } from 'lucide-react';
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
        // Delay initial load slightly to allow tab transition animation to finish
        const timer = setTimeout(() => {
            loadHistory();
        }, 350);
        return () => clearTimeout(timer);
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
                    <Button
                        onClick={() => toggleGroup(group)}
                        variant="ghost"
                        className="flex items-center gap-2 w-full justify-start bg-surface-variant/30 px-3 py-2 rounded-2xl hover:bg-outline-variant transition-colors sticky top-0 backdrop-blur-sm z-10 h-auto"
                    >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="font-semibold text-sm text-on-surface-variant/80 flex-1 text-left">
                            {group === 'PASS' ? <span className="text-on-success-container/10">{group}</span> :
                                group === 'FAIL' ? <span className="text-error-container/80">{group}</span> : group}
                        </span>
                        <span className="text-xs text-on-surface-variant/80 bg-outline-variant px-1.5 py-0.5 rounded-2xl">
                            {logs.length}
                        </span>
                    </Button>
                )}

                {isExpanded && (
                    <div className="space-y-3 pl-1">
                        {logs.map((log, i) => (
                            <div key={i} className="flex flex-row items-center gap-4 p-4 bg-surface/50 border border-outline-variant/30 rounded-2xl hover:border-primary/20 transition-colors shadow-sm">
                                <div className="flex gap-4 items-start min-w-0 flex-1">
                                    <div className={clsx(
                                        "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-1",
                                        log.status === 'PASS'
                                            ? "bg-success/10 text-on-success-container"
                                            : "bg-error/10 text-on-error-container"
                                    )}>
                                        {log.status === 'PASS' ? <CheckCircle size={20} /> : <XCircle size={20} />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-semibold text-on-surface/80 truncate" title={decodeHtml(log.suite_name)}>
                                                {decodeHtml(log.suite_name)}
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant/80">
                                            <div className="flex items-center gap-1">
                                                <Calendar size={12} /> {formatDate(log.timestamp)}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Clock size={12} /> {log.duration}
                                            </div>
                                            {(log.device_model || log.device_udid) && (
                                                <div className="flex items-center gap-1 text-on-surface/80">
                                                    {log.android_version && <AndroidVersionPill version={log.android_version} className="bg-surface-variant/50" />}
                                                    {log.device_model || t('tests_page.unknown_model')}
                                                    {log.device_udid ? ` (${log.device_udid})` : ''}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={clsx("text-xs font-bold px-1.5 py-0.5 rounded border",
                                        log.status === 'PASS'
                                            ? "bg-success/10 text-on-success-container border-success/20"
                                            : "bg-error/10 text-on-error-container border-error/20"
                                    )}>
                                        {log.status}
                                    </span>
                                    <div className="border border-outline-variant/30 py-2">
                                    </div>
                                    <Button
                                        onClick={() => openLog(log.log_html_path)}
                                        variant="ghost"
                                        size="sm"
                                        className="flex items-center gap-2 px-3 py-1.5 bg-surface-variant/30 hover:bg-primary/10 text-on-surface-variant/80 hover:text-primary rounded-2xl text-xs font-medium transition-colors h-auto"
                                        title={isHistoryNarrow ? t('tests_page.report') : log.log_html_path}
                                        leftIcon={<FileText size={14} />}
                                    >
                                        {!isHistoryNarrow && t('tests_page.report')}
                                    </Button>
                                    <Button
                                        onClick={() => openLog(log.path)}
                                        variant="ghost"
                                        size="icon"
                                        className="p-1.5 bg-surface-variant/30 hover:bg-outline-variant text-on-surface-variant/80 rounded-2xl transition-colors h-auto w-auto"
                                        title={t('tests_page.open_folder')}
                                    >
                                        <Folder size={14} />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div ref={historyContainerRef} className="flex-1 min-h-0 bg-surface border border-outline-variant/30 rounded-2xl p-4 overflow-hidden relative flex flex-col">
            <Section
                title={t('tests_page.history')}
                icon={Calendar}
                variant="transparent"
                className="p-0 pb-4 mb-4"
                status={
                    <Button
                        onClick={() => loadHistory(true)}
                        variant="ghost"
                        size="sm"
                        className="p-1.5 text-on-surface-variant/80 hover:bg-surface-variant/30 rounded-2xl transition-colors h-auto"
                        title={t('tests_page.actions.refresh')}
                    >
                        {loadingHistory ? <ExpressiveLoading size="xsm" variant="circular" /> : <RefreshCw size={16} />}
                    </Button>
                }
                menus={!isHistoryNarrow ? (
                    <div className="flex flex-wrap gap-2">
                        <div className="flex-1 min-w-[200px]">
                            <Input
                                placeholder={t('tests_page.filter.search')}
                                value={filterText}
                                onChange={(e) => setFilterText(e.target.value)}
                                leftIcon={<Search size={16} />}
                                className="bg-surface/50"
                            />
                        </div>
                        <Select
                            value={filterPeriod}
                            onChange={(e) => setFilterPeriod(e.target.value)}
                            options={[
                                { value: "all_time", label: t('tests_page.filter.all_time') },
                                { value: "today", label: t('tests_page.filter.today') },
                                { value: "last_7_days", label: t('tests_page.filter.last_7_days') },
                                { value: "last_30_days", label: t('tests_page.filter.last_30_days') }
                            ]}
                            className="bg-surface/50"
                            containerClassName="w-auto min-w-[150px]"
                        />
                        <Select
                            value={groupBy}
                            onChange={(e) => setGroupBy(e.target.value)}
                            options={[
                                { value: "none", label: `${t('tests_page.filter.group_by')}: ${t('tests_page.filter.all_time').replace('Todo o período', 'Nenhum')}` },
                                { value: "status", label: t('tests_page.filter.status') },
                                { value: "device", label: t('tests_page.filter.device') },
                                { value: "suite", label: t('tests_page.filter.suite') },
                                { value: "os_version", label: t('tests_page.filter.os_version') || "Versão do SO" }
                            ]}
                            className="bg-surface/50"
                            containerClassName="w-auto min-w-[200px]"
                        />
                    </div>
                ) : null
                }
                actions={
                    <Button
                        onClick={() => setShowCharts(!showCharts)}
                        variant="ghost"
                        size="sm"
                        className={clsx(
                            "px-3 py-1.5 rounded-2xl flex items-center gap-2 text-sm font-medium transition-colors h-auto",
                            showCharts
                                ? "bg-primary/10 text-primary"
                                : "bg-surface-variant/30 text-on-surface-variant/80 hover:bg-outline-variant"
                        )}
                        title={showCharts ? t('tests_page.charts.hide') : t('tests_page.charts.show')}
                        leftIcon={<PieChart size={16} />}
                    >
                    </Button>
                }
            />

            <div className="flex-1 overflow-y-auto pr-2">
                <AnimatePresence>
                    {showCharts && (
                        <HistoryCharts logs={filteredHistory} groupBy={groupBy} />
                    )}
                </AnimatePresence>

                {loadingHistory && (
                    <div className="flex justify-center p-4">
                        <ExpressiveLoading size="md" variant="circular" />
                    </div>
                )}

                {!loadingHistory && filteredHistory.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-on-surface/80">
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

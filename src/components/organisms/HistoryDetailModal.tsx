import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from "react-i18next";
import {
    XCircle, CheckCircle2, Calendar, Clock, Smartphone,
    FileText, Folder
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { getCachedResult, parseXmlBackground, onParseComplete, ParseResult } from '@/lib/xmlParseCache';
import { Modal } from '@/components/organisms/Modal';
import { Button } from '@/components/atoms/Button';
import { LogTree } from '@/components/molecules/LogTree';
import { LogNode } from '@/lib/robotParser';
import { feedback } from '@/lib/feedback';
import { AndroidVersionPill } from '@/components/atoms/AndroidVersionPill';
import { ExpressiveLoading } from '@/components/atoms/ExpressiveLoading';
import { decodeHtml } from '@/lib/utils';
import clsx from 'clsx';

interface TestLog {
    path: string;
    suite_name: string;
    status: 'PASS' | 'FAIL';
    device_udid?: string | null;
    device_model?: string | null;
    android_version?: string | null;
    timestamp: string;
    duration: string;
    pass_count: number;
    fail_count: number;
    xml_path: string;
    log_html_path: string;
}

interface ParseProgress {
    xml_path: string;
    stage: string;
    percent: number;
}

const STAGE_KEYS: Record<string, string> = {
    parsing_xml: 'run_tab.console.progress_parsing_xml',
    mapping_structure: 'run_tab.console.progress_mapping_structure',
    compressing_cache: 'run_tab.console.progress_compressing_cache',
    loading_tree: 'run_tab.console.progress_loading_tree',
};

interface HistoryDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    log: TestLog | null;
}

export function HistoryDetailModal({ isOpen, onClose, log }: HistoryDetailModalProps) {
    const { t } = useTranslation();
    const [tree, setTree] = useState<LogNode[]>([]);
    const [dbPath, setDbPath] = useState<string | undefined>();
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState<ParseProgress | null>(null);
    const unlistenRef = useRef<UnlistenFn | null>(null);
    const currentPathRef = useRef<string | null>(null);

    // Cleanup event listener
    const cleanupListener = useCallback(() => {
        if (unlistenRef.current) {
            unlistenRef.current();
            unlistenRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (isOpen && log && log.xml_path) {
            loadXml(log.xml_path);
        } else if (!isOpen) {
            // When closing, DO NOT cancel the parse — it continues in the cache.
            // Only reset local UI state.
            setTree([]);
            setDbPath(undefined);
            setProgress(null);
            cleanupListener();
            currentPathRef.current = null;
        }
        return cleanupListener;
    }, [isOpen, log]);

    // Subscribe to parse completions so re-opening picks up cached results
    useEffect(() => {
        const unsubscribe = onParseComplete((xmlPath, result: ParseResult | null) => {
            if (xmlPath === currentPathRef.current && result) {
                setTree([result.rootSuite]);
                setDbPath(result.dbPath);
                setLoading(false);
                setProgress(null);
                cleanupListener();
            }
        });
        return unsubscribe;
    }, []);

    const loadXml = async (xmlPath: string) => {
        currentPathRef.current = xmlPath;

        // 1. Check global cache for instant display
        const cached = getCachedResult(xmlPath);
        if (cached) {
            setTree([cached.rootSuite]);
            setDbPath(cached.dbPath);
            setLoading(false);
            return;
        }

        // 2. Start loading with progress
        setLoading(true);
        setProgress(null);

        cleanupListener();
        unlistenRef.current = await listen<ParseProgress>('xml-parse-progress', (event) => {
            if (event.payload.xml_path === currentPathRef.current) {
                setProgress(event.payload);
            }
        });

        try {
            // parseXmlBackground deduplicates and caches globally
            const result = await parseXmlBackground(xmlPath);
            // Only update if still viewing the same path (not closed or changed)
            if (currentPathRef.current === xmlPath) {
                setTree([result.rootSuite]);
                setDbPath(result.dbPath);
            }
        } catch (e) {
            if (currentPathRef.current === xmlPath) {
                console.error("Failed to parse history XML via backend:", e);
                feedback.toast.error("common.errors.parse_failed");
            }
        } finally {
            if (currentPathRef.current === xmlPath) {
                setLoading(false);
                setProgress(null);
                cleanupListener();
            }
        }
    };

    const openLog = async (path: string) => {
        try {
            await invoke('open_log_folder', { path });
        } catch (e) {
            feedback.toast.error("common.errors.open_file_failed", e);
        }
    };

    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            return new Intl.DateTimeFormat(undefined, {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
            }).format(date);
        } catch (e) {
            return dateStr;
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={log ? decodeHtml(log.suite_name) : ""}
            className="max-w-6xl h-[90vh]"
        >
            {log && (
                <div className="flex flex-col h-full">
                    {/* Header Info */}
                    <div className="flex flex-wrap gap-4 p-4 mb-4 bg-surface-variant/20 rounded-2xl border border-outline-variant/30">
                        <div className="flex items-center gap-2">
                            <div className={clsx(
                                "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                                log.status === 'PASS' ? "bg-success/10 text-success" : "bg-error/10 text-error"
                            )}>
                                {log.status === 'PASS' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                            </div>
                            <span className={clsx("font-bold text-sm", log.status === 'PASS' ? "text-success" : "text-error")}>
                                {t(`run_tab.console.${log.status.toLowerCase()}`)}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-on-surface-variant/80">
                            <Calendar size={14} /> {formatDate(log.timestamp)}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-on-surface-variant/80">
                            <Clock size={14} /> 
                            <span>{log.duration}</span>
                            <span className="mx-1 opacity-20 h-2 w-[1px] bg-current" />
                            <span className="text-success font-medium">{log.pass_count}P</span>
                            <span className="opacity-30">/</span>
                            <span className={clsx("font-medium", log.fail_count > 0 ? "text-error" : "opacity-40")}>{log.fail_count}F</span>
                        </div>

                        {(log.device_model || log.device_udid) && (
                            <div className="flex items-center gap-2 text-xs text-on-surface/80">
                                <Smartphone size={14} />
                                {log.android_version && <AndroidVersionPill version={log.android_version} className="bg-surface-variant/50" />}
                                {log.device_model || t('tests_page.unknown_model')}
                                {log.device_udid ? ` (${log.device_udid})` : ''}
                            </div>
                        )}

                        <div className="flex-1" />

                        <div className="flex items-center gap-2">
                            <Button
                                onClick={() => openLog(log.log_html_path)}
                                variant="outline"
                                size="sm"
                                className="h-8 px-3 rounded-xl text-[10px] font-bold uppercase tracking-wider"
                                leftIcon={<FileText size={14} />}
                            >
                                {t('tests_page.report')}
                            </Button>
                            <Button
                                onClick={() => openLog(log.path)}
                                variant="outline"
                                size="sm"
                                className="h-8 px-3 rounded-xl text-[10px] font-bold uppercase tracking-wider"
                                leftIcon={<Folder size={14} />}
                            >
                                {t('tests_page.open_folder')}
                            </Button>
                        </div>
                    </div>

                    {/* Content / Tree */}
                    <div className="flex-1 overflow-y-auto px-1">
                        {loading ? (
                            <div className="h-full flex flex-col items-center justify-center gap-4 opacity-80">
                                <ExpressiveLoading size="md" variant="circular" />
                                <div className="flex flex-col items-center gap-2 w-64">
                                    <span className="text-sm font-medium animate-pulse">
                                        {progress && STAGE_KEYS[progress.stage]
                                            ? t(STAGE_KEYS[progress.stage])
                                            : t('run_tab.console.loading_xml')}
                                    </span>
                                    {progress && (
                                        <div className="w-full flex flex-col items-center gap-1.5">
                                            <div className="w-full h-1.5 bg-surface-variant/40 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                                                    style={{ width: `${progress.percent}%` }}
                                                />
                                            </div>
                                            <span className="text-[10px] font-mono text-on-surface-variant/60">{progress.percent}%</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : tree.length > 0 ? (
                            <div className="space-y-2 pb-4">
                                {tree.map(node => (
                                    <LogTree key={node.id} node={node} initiallyOpen={true} dbPath={dbPath} />
                                ))}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center gap-2 text-on-surface-variant opacity-50">
                                <XCircle size={40} strokeWidth={1} />
                                <span className="text-sm font-medium">{t('tests_page.no_logs')}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Modal>
    );
}

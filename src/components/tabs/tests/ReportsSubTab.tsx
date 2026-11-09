import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import {
    FileText, Trash2, Eye, ExternalLink, RefreshCw,
    FolderOpen, Clock, CheckCircle2, ShieldCheck, Sparkles,
    Search, Upload, Tv, XCircle
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Modal } from '@/components/organisms/Modal';
import { ExpressiveLoading } from '@/components/atoms/ExpressiveLoading';
import { FileSavedFeedback } from '@/components/molecules/FileSavedFeedback';
import {
    getTemporaryReports, removeTemporaryReport,
    markReportPublished, subscribeReports,
    ReportItem, RustReportFileInfo
} from '@/lib/reportsCache';

function formatFileSize(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return new Intl.DateTimeFormat(undefined, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).format(d);
    } catch {
        return dateStr;
    }
}

export function ReportsSubTab() {
    const { t } = useTranslation();

    const [temporaryReports, setTemporaryReports] = useState<ReportItem[]>(() => getTemporaryReports());
    const [publishedReports, setPublishedReports] = useState<RustReportFileInfo[]>([]);
    const [isLoadingPublished, setIsLoadingPublished] = useState(false);
    const [filterStatus, setFilterStatus] = useState<'all' | 'temporary' | 'published'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [publishingId, setPublishingId] = useState<string | null>(null);
    const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);

    // Preview Modal State
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [previewReport, setPreviewReport] = useState<{ title: string; html: string; path?: string } | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);

    // Delete confirmation modal state
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [reportToDelete, setReportToDelete] = useState<{ id?: string; path?: string; name: string } | null>(null);

    // Subscribe to in-memory temporary reports updates
    useEffect(() => {
        const unsubscribe = subscribeReports(() => {
            setTemporaryReports(getTemporaryReports());
        });
        return unsubscribe;
    }, []);

    // Fetch published reports from <app_root>/reports
    const fetchPublishedReports = useCallback(async () => {
        setIsLoadingPublished(true);
        try {
            const list: RustReportFileInfo[] = await invoke('list_app_reports');
            setPublishedReports(list || []);
        } catch (error) {
            console.error('Failed to list published reports', error);
        } finally {
            setIsLoadingPublished(false);
        }
    }, []);

    useEffect(() => {
        fetchPublishedReports();
    }, [fetchPublishedReports]);

    // Open /reports directory in file manager
    const handleOpenReportsFolder = async () => {
        try {
            const dir: string = await invoke('get_reports_dir');
            await invoke('open_path', { path: dir });
        } catch (error) {
            console.error('Failed to open reports directory', error);
            toast.error(t('reports_subtab.open_folder_error', 'Failed to open reports folder'));
        }
    };

    // Publish a temporary report to <app_root>/reports
    const handlePublishReport = async (report: ReportItem) => {
        setPublishingId(report.id);
        const toastId = toast.loading(t('reports_subtab.publishing', 'Publishing report...'));
        try {
            const dateStr = new Date(report.timestamp).toISOString().split('T')[0];
            const safeDevice = report.deviceUdid ? report.deviceUdid.replace(/[^a-zA-Z0-9]/g, '_') : 'device';
            const fileName = `report_${report.type}_${safeDevice}_${dateStr}_${Date.now().toString().slice(-4)}.html`;

            const savedPath: string = await invoke('save_app_report', {
                filename: fileName,
                content: report.htmlContent
            });

            markReportPublished(report.id, savedPath);
            setLastSavedPath(savedPath);
            toast.success(t('reports_subtab.published_success', 'Report published successfully to /reports!'), { id: toastId });
            await fetchPublishedReports();
        } catch (error) {
            console.error('Failed to publish report', error);
            toast.error(t('reports_subtab.publish_error', 'Failed to publish report to /reports.'), { id: toastId });
        } finally {
            setPublishingId(null);
        }
    };

    // Open preview modal
    const handlePreviewReport = async (report: ReportItem | RustReportFileInfo, isPublishedFile = false) => {
        if (!isPublishedFile && 'htmlContent' in report) {
            setPreviewReport({
                title: report.title,
                html: report.htmlContent,
                path: report.filePath
            });
            setPreviewModalOpen(true);
        } else if ('path' in report) {
            setIsLoadingPreview(true);
            try {
                const htmlContent: string = await invoke('fs_read_text_file', { path: report.path });
                setPreviewReport({
                    title: report.title || report.name,
                    html: htmlContent,
                    path: report.path
                });
                setPreviewModalOpen(true);
            } catch (error) {
                console.error('Failed to read report for preview', error);
                toast.error(t('reports_subtab.read_error', 'Failed to read report file'));
            } finally {
                setIsLoadingPreview(false);
            }
        }
    };

    // Open in system browser
    const handleOpenInBrowser = async (filePath?: string) => {
        if (!filePath) return;
        try {
            await invoke('open_path', { path: filePath });
        } catch (error) {
            console.error('Failed to open path', error);
            toast.error(t('common.error', 'Error opening file'));
        }
    };

    // Confirm and execute deletion
    const confirmDelete = async () => {
        if (!reportToDelete) return;
        try {
            if (reportToDelete.id) {
                removeTemporaryReport(reportToDelete.id);
            }
            if (reportToDelete.path) {
                await invoke('delete_app_report', { path: reportToDelete.path });
                await fetchPublishedReports();
            }
            toast.success(t('reports_subtab.delete_success', 'Report deleted successfully.'));
        } catch (error) {
            console.error('Failed to delete report', error);
            toast.error(t('reports_subtab.delete_error', 'Failed to delete report'));
        } finally {
            setDeleteModalOpen(false);
            setReportToDelete(null);
        }
    };

    // Unified report items list for rendering
    const unifiedReports = useMemo(() => {
        type UnifiedItem = {
            uniqueKey: string;
            isPublished: boolean;
            isTemporary: boolean;
            title: string;
            deviceModel: string;
            deviceUdid: string;
            analystName: string;
            timestamp: string;
            sizeBytes: number;
            type: string;
            result?: string;
            comments?: string;
            path?: string;
            tempReportObj?: ReportItem;
            publishedFileObj?: RustReportFileInfo;
        };

        const items: UnifiedItem[] = [];

        // 1. Add temporary reports from in-memory cache
        for (const tr of temporaryReports) {
            items.push({
                uniqueKey: `temp_${tr.id}`,
                isPublished: tr.status === 'published',
                isTemporary: tr.status === 'temporary',
                title: tr.title,
                deviceModel: tr.deviceModel,
                deviceUdid: tr.deviceUdid,
                analystName: tr.analystName,
                timestamp: tr.timestamp,
                sizeBytes: tr.sizeBytes || 0,
                type: tr.type,
                result: tr.result,
                comments: tr.comments,
                path: tr.filePath,
                tempReportObj: tr
            });
        }

        // 2. Add published files from disk (avoid duplicates if already tracked in tempReportObj with identical path)
        const trackedPaths = new Set(items.map(i => i.path).filter(Boolean));
        for (const pr of publishedReports) {
            if (trackedPaths.has(pr.path)) continue;

            const dateStr = pr.modified_timestamp ? new Date(pr.modified_timestamp).toISOString() : new Date().toISOString();
            items.push({
                uniqueKey: `disk_${pr.path}`,
                isPublished: true,
                isTemporary: false,
                title: pr.title || pr.name,
                deviceModel: 'N/A',
                deviceUdid: '',
                analystName: pr.analyst || 'N/A',
                timestamp: dateStr,
                sizeBytes: pr.size_bytes,
                type: pr.name.includes('ai_verified') ? 'ai_checkup' : 'checkup',
                result: pr.result,
                comments: pr.comments,
                path: pr.path,
                publishedFileObj: pr
            });
        }

        // Filter by status tab
        let filtered = items;
        if (filterStatus === 'temporary') {
            filtered = filtered.filter(i => i.isTemporary);
        } else if (filterStatus === 'published') {
            filtered = filtered.filter(i => i.isPublished);
        }

        // Filter by search query
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(i =>
                i.title.toLowerCase().includes(q) ||
                i.deviceModel.toLowerCase().includes(q) ||
                i.deviceUdid.toLowerCase().includes(q) ||
                i.analystName.toLowerCase().includes(q) ||
                (i.result && i.result.toLowerCase().includes(q)) ||
                (i.comments && i.comments.toLowerCase().includes(q)) ||
                (i.path && i.path.toLowerCase().includes(q))
            );
        }

        return filtered;
    }, [temporaryReports, publishedReports, filterStatus, searchQuery]);

    const getTypeBadge = (type: string) => {
        if (type === 'ai_checkup') {
            return (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/25 flex items-center gap-1 font-medium">
                    <Sparkles size={12} />
                    {t('reports_subtab.type_ai_checkup', 'AI Verified Checkup')}
                </span>
            );
        }
        if (type === 'companion_bdd') {
            return (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/25 flex items-center gap-1 font-medium">
                    <Tv size={12} />
                    {t('reports_subtab.type_companion_bdd', 'Companion BDD Tests')}
                </span>
            );
        }
        return (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-variant/40 text-on-surface-variant border border-outline-variant/30 flex items-center gap-1 font-medium">
                <ShieldCheck size={12} />
                {t('reports_subtab.type_checkup', 'Hardware & OS Checkup')}
            </span>
        );
    };

    const getResultBadge = (result?: string) => {
        if (!result) return null;
        if (result === 'approved') {
            return (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30 flex items-center gap-1 font-semibold">
                    <CheckCircle2 size={11} />
                    {t('toolbox.checkup.report.approved', 'Approved')}
                </span>
            );
        }
        if (result === 'rejected') {
            return (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-error/15 text-error border border-error/30 flex items-center gap-1 font-semibold">
                    <XCircle size={11} />
                    {t('toolbox.checkup.report.rejected', 'Rejected')}
                </span>
            );
        }
        if (result === 'pending') {
            return (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30 flex items-center gap-1 font-semibold">
                    <Clock size={11} />
                    {t('toolbox.checkup.report.pending', 'Pending')}
                </span>
            );
        }
        return null;
    };

    return (
        <div className="h-full flex-1 min-h-0 flex flex-col p-4 space-y-4 overflow-y-auto font-inter">
            {/* Feedback for newly saved files */}
            <FileSavedFeedback
                path={lastSavedPath}
                onClose={() => setLastSavedPath(null)}
            />

            {/* Top Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-surface/50 backdrop-blur-md p-3 rounded-2xl border border-outline-variant/30 shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 bg-surface-variant/20 p-0.5 rounded-xl border border-outline-variant/30">
                        <button
                            type="button"
                            onClick={() => setFilterStatus('all')}
                            title={t('reports_subtab.filter_all')}
                            data-position='left'
                            className={clsx(
                                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                                filterStatus === 'all'
                                    ? "bg-primary text-white shadow-sm"
                                    : "text-on-surface-variant hover:text-on-surface"
                            )}
                        >
                            {t('reports_subtab.filter_all', 'All')} ({temporaryReports.length + publishedReports.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterStatus('temporary')}
                            title={t('reports_subtab.filter_temporary')}
                            data-position='left'
                            className={clsx(
                                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
                                filterStatus === 'temporary'
                                    ? "bg-amber-500 text-white shadow-sm"
                                    : "text-on-surface-variant hover:text-on-surface"
                            )}
                        >
                            <Clock size={13} />
                            {t('reports_subtab.filter_temporary', 'Temporary')} ({temporaryReports.filter(r => r.status === 'temporary').length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterStatus('published')}
                            title={t('reports_subtab.filter_published')}
                            data-position='left'
                            className={clsx(
                                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
                                filterStatus === 'published'
                                    ? "bg-success text-white shadow-sm"
                                    : "text-on-surface-variant hover:text-on-surface"
                            )}
                        >
                            <CheckCircle2 size={13} />
                            {t('reports_subtab.filter_published', 'Published')} ({publishedReports.length})
                        </button>
                    </div>

                    <div className="relative w-64">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('reports_subtab.search_placeholder', 'Search by title, device, or analyst...')}
                            className="h-8 pl-8 pr-3 text-xs w-full bg-surface-variant/10 border-outline-variant/30"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleOpenReportsFolder}
                        className="h-8 px-2.5 text-xs flex items-center gap-1.5 text-on-surface-variant hover:text-on-surface border border-outline-variant/30"
                        title={t('reports_subtab.open_reports_folder', 'Open /reports Folder')}
                        data-position='left'
                    >
                        <FolderOpen size={14} className="text-primary" />
                        <span>{t('reports_subtab.open_reports_folder', 'Open /reports Folder')}</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={fetchPublishedReports}
                        disabled={isLoadingPublished}
                        className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-outline-variant/30"
                        title={t('common.refresh', 'Refresh')}
                        data-position='left'
                    >
                        <RefreshCw size={14} className={clsx(isLoadingPublished && "animate-spin")} />
                    </Button>
                </div>
            </div>

            {/* Reports List */}
            {unifiedReports.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant/50 p-12 text-center min-h-[300px] bg-surface/30 rounded-2xl border border-outline-variant/20">
                    <FileText size={48} className="mb-3 opacity-40 text-primary" />
                    <h4 className="text-sm font-semibold text-on-surface mb-1">
                        {t('reports_subtab.no_reports_found', 'No reports found')}
                    </h4>
                    <p className="text-xs max-w-sm opacity-75">
                        {t('reports_subtab.no_reports_desc', 'Generate reports in Checkup to view and publish them here.')}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {unifiedReports.map((item) => {
                        const isPublishing = publishingId === item.tempReportObj?.id;

                        return (
                            <div
                                key={item.uniqueKey}
                                className={clsx(
                                    "p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 relative group",
                                    item.isTemporary
                                        ? "bg-surface/60 border-amber-500/30 hover:border-amber-500/60 shadow-sm"
                                        : "bg-surface/60 border-outline-variant/30 hover:border-primary/40 shadow-sm"
                                )}
                            >
                                {/* Header */}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                            {getTypeBadge(item.type)}
                                            {getResultBadge(item.result)}
                                            {item.isTemporary ? (
                                                <span
                                                    className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/25 font-semibold flex items-center gap-1"
                                                    title={t('reports_subtab.temporary_badge_tooltip', 'This report is in memory for this session and will disappear on app close if not published.')}
                                                >
                                                    <Clock size={11} />
                                                    {t('reports_subtab.temporary_badge', 'Temporary')}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/25 font-semibold flex items-center gap-1">
                                                    <CheckCircle2 size={11} />
                                                    {t('reports_subtab.published_badge', 'Published')}
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="text-xs font-bold text-on-surface truncate" title={item.title}>
                                            {item.title}
                                        </h3>
                                    </div>
                                </div>

                                {/* Metadata Details */}
                                <div className="flex flex-col gap-2 bg-surface-variant/15 p-2.5 rounded-xl border border-outline-variant/20">
                                    <div className="grid grid-cols-2 gap-2 text-[11px] text-on-surface-variant/80">
                                        <div>
                                            <span className="text-[10px] text-on-surface-variant/50 uppercase tracking-wider block font-semibold">
                                                {t('reports_subtab.device', 'Device')}
                                            </span>
                                            <span className="font-medium text-on-surface truncate block" title={item.deviceModel}>
                                                {item.deviceModel}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-on-surface-variant/50 uppercase tracking-wider block font-semibold">
                                                {t('reports_subtab.analyst', 'Analyst')}
                                            </span>
                                            <span className="font-medium text-on-surface truncate block" title={item.analystName}>
                                                {item.analystName}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-on-surface-variant/50 uppercase tracking-wider block font-semibold">
                                                {t('reports_subtab.date', 'Date')}
                                            </span>
                                            <span className="font-medium text-on-surface truncate block">
                                                {formatDate(item.timestamp)}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-on-surface-variant/50 uppercase tracking-wider block font-semibold">
                                                {t('reports_subtab.size', 'Size')}
                                            </span>
                                            <span className="font-mono font-medium text-on-surface truncate block">
                                                {formatFileSize(item.sizeBytes)}
                                            </span>
                                        </div>
                                    </div>

                                    {item.comments && (
                                        <div className="text-[11px] text-on-surface-variant/90 bg-surface-variant/20 px-2 py-1.5 rounded-lg border border-outline-variant/15 flex items-start gap-1.5">
                                            <span className="font-semibold text-[10px] uppercase tracking-wider text-on-surface-variant/60 shrink-0">
                                                {t('toolbox.checkup.report.comments', 'Comments')}:
                                            </span>
                                            <span className="truncate italic text-[11px]">{item.comments}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Actions Bar */}
                                <div className="flex items-center justify-between gap-2 pt-2 border-t border-outline-variant/20">
                                    <div className="flex items-center gap-1.5">
                                        {/* Publish button for temporary reports */}
                                        {item.isTemporary && item.tempReportObj && (
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                onClick={() => handlePublishReport(item.tempReportObj!)}
                                                disabled={isPublishing}
                                                className="h-7 px-2.5 text-xs flex items-center gap-1.5 shadow-sm"
                                                title={t('reports_subtab.publish', 'Publish')}
                                                data-position='right'
                                            >
                                                {isPublishing ? (
                                                    <ExpressiveLoading variant="circular" size="sm" />
                                                ) : (
                                                    <Upload size={12} />
                                                )}
                                                <span>{isPublishing ? t('reports_subtab.publishing', 'Publishing...') : t('reports_subtab.publish', 'Publish')}</span>
                                            </Button>
                                        )}

                                        {/* Preview Button */}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handlePreviewReport(item.tempReportObj || item.publishedFileObj!, !item.tempReportObj)}
                                            className="h-7 px-2 text-xs flex items-center gap-1 text-on-surface-variant hover:text-on-surface border border-outline-variant/30"
                                            title={t('reports_subtab.preview', 'Preview')}
                                            data-position='right'
                                        >
                                            <Eye size={12} />
                                            <span>{t('reports_subtab.preview', 'Preview')}</span>
                                        </Button>

                                        {/* Open in Browser */}
                                        {item.path && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleOpenInBrowser(item.path)}
                                                className="h-7 w-7 p-0 flex items-center justify-center text-on-surface-variant hover:text-on-surface rounded border border-outline-variant/30"
                                                title={t('reports_subtab.open_file', 'Open in Browser')}
                                                data-position='right'
                                            >
                                                <ExternalLink size={12} />
                                            </Button>
                                        )}
                                    </div>

                                    {/* Delete Button */}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setReportToDelete({
                                                id: item.tempReportObj?.id,
                                                path: item.path,
                                                name: item.title
                                            });
                                            setDeleteModalOpen(true);
                                        }}
                                        className="h-7 w-7 p-0 flex items-center justify-center text-error/70 hover:text-error hover:bg-error/10 rounded"
                                        title={t('reports_subtab.delete', 'Delete')}
                                        data-position='left'
                                    >
                                        <Trash2 size={13} />
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Preview Modal */}
            <Modal
                isOpen={previewModalOpen}
                onClose={() => {
                    setPreviewModalOpen(false);
                    setPreviewReport(null);
                }}
                title={previewReport?.title || t('reports_subtab.preview_title', 'Report Preview')}
                className="max-w-6xl w-[95vw] h-[90vh] flex flex-col"
            >
                <div className="h-full flex flex-col justify-between min-h-0 gap-3">
                    <div className="flex-1 min-h-0 relative rounded-xl overflow-hidden border border-outline-variant/30 bg-white">
                        {isLoadingPreview ? (
                            <div className="h-full flex items-center justify-center">
                                <ExpressiveLoading variant="circular" size="lg" />
                            </div>
                        ) : (
                            <iframe
                                title="Report Preview"
                                srcDoc={previewReport?.html || ''}
                                className="w-full h-full border-none"
                                sandbox="allow-scripts allow-same-origin"
                            />
                        )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-outline-variant/30 shrink-0">
                        <div>
                            {previewReport?.path && (
                                <span className="text-xs text-on-surface-variant font-mono truncate block max-w-md">
                                    {previewReport.path}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {previewReport?.path && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleOpenInBrowser(previewReport.path)}
                                    title={t('reports_subtab.open_file', 'Open in Browser')}
                                    data-position='left'
                                    className="h-8 text-xs flex items-center gap-1.5"
                                >
                                    <ExternalLink size={14} />
                                    <span>{t('reports_subtab.open_file', 'Open in Browser')}</span>
                                </Button>
                            )}
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => {
                                    setPreviewModalOpen(false);
                                    setPreviewReport(null);
                                }}
                                title={t('reports_subtab.close_preview', 'Close')}
                                data-position='left'
                                className="h-8 text-xs"
                            >
                                {t('reports_subtab.close_preview', 'Close')}
                            </Button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={deleteModalOpen}
                onClose={() => {
                    setDeleteModalOpen(false);
                    setReportToDelete(null);
                }}
                title={t('reports_subtab.delete', 'Delete Report')}
                className="max-w-md w-[90vw]"
            >
                <div className="space-y-4">
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                        {t('reports_subtab.delete_confirm', 'Are you sure you want to delete this report?')}
                    </p>
                    {reportToDelete && (
                        <div className="p-3 bg-surface-variant/20 rounded-xl border border-outline-variant/30 text-xs font-semibold text-on-surface">
                            {reportToDelete.name}
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-outline-variant/30">
                    <Button
                        variant="ghost"
                        size="sm"
                        data-position='left'
                        title={t('common.cancel', 'Cancel')}
                        onClick={() => {
                            setDeleteModalOpen(false);
                            setReportToDelete(null);
                        }}
                    >
                        {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        data-position='left'
                        title={t('reports_subtab.delete', 'Delete')}
                        onClick={confirmDelete}
                        className="bg-error hover:bg-error/90 hover:brightness-110 text-white"
                    >
                        {t('reports_subtab.delete', 'Delete')}
                    </Button>
                </div>
            </Modal>
        </div>
    );
}

export default ReportsSubTab;

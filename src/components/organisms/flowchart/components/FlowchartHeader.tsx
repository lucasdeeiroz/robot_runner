import { useTranslation } from 'react-i18next';
import {
    X, ZoomIn, ZoomOut, Maximize, Save,
    Upload, Download, Camera, AlertTriangle, Eraser
} from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Select } from '@/components/atoms/Select';
import { AiButton } from '@/components/atoms/AiButton';

interface FlowchartHeaderProps {
    missedScreensCount: number;
    isReorganizing: boolean;
    onAutoReorganize: (prompt?: string) => void;
    onImport: () => void;
    onExport: () => void;
    onSave: () => void;
    onClearCurvatures: () => void;
    onExportImage: () => void;
    filterTag: string | null;
    setFilterTag: (tag: string | null) => void;
    allTags: string[];
    onCenterView: () => void;
    onZoom: (delta: number) => void;
    scale: number;
    onClose: () => void;
}

export function FlowchartHeader({
    missedScreensCount,
    isReorganizing,
    onAutoReorganize,
    onImport,
    onExport,
    onSave,
    onClearCurvatures,
    onExportImage,
    filterTag,
    setFilterTag,
    allTags,
    onCenterView,
    onZoom,
    scale,
    onClose
}: FlowchartHeaderProps) {
    const { t } = useTranslation();

    return (
        <div className="flex items-center justify-between px-6 py-2 border-b border-outline-variant/30 bg-surface">
            <h2 className="text-lg font-semibold text-on-surface flex items-center gap-2">
                {t('mapper.flowchart.title', 'Navigation Flow')}
            </h2>
            <div className="flex items-center gap-2">
                {missedScreensCount > 0 && (
                    <div
                        className="flex items-center gap-1.5 px-3 py-1 bg-warning/10 text-warning border border-warning/20 rounded-lg text-xs font-medium animate-pulse cursor-help"
                        data-tooltip={t('mapper.flowchart.ai_missed_help', 'These screens were placed in the quarantine area on the right.')}
                        data-position="bottom"
                    >
                        <AlertTriangle size={14} />
                        {t('mapper.flowchart.ai_missed_count', { count: missedScreensCount })}
                    </div>
                )}
                <AiButton
                    id="flowchart_reorganize"
                    onClick={(_, cp) => onAutoReorganize(cp)}
                    variant="primary"
                    label={t('mapper.flowchart.reorganize')}
                    isLoading={isReorganizing}
                />
                <Button
                    variant="ghost"
                    onClick={onImport}
                    className="p-2 hover:bg-primary/10 text-primary dark:text-primary/80 rounded-full"
                    data-tooltip={t('mapper.flowchart.import')}
                    data-position="bottom"
                >
                    <Download size={16} />
                </Button>
                <Button
                    variant="ghost"
                    onClick={onExport}
                    className="p-2 hover:bg-primary/10 text-primary dark:text-primary/80 rounded-full"
                    data-tooltip={t('mapper.flowchart.export')}
                    data-position="bottom"
                >
                    <Upload size={16} />
                </Button>
                <div className="h-4 w-px bg-outline-variant/30 mx-2" />
                <Button
                    variant="ghost"
                    onClick={onSave}
                    className="p-2 bg-primary/10 hover:bg-primary hover:text-on-primary text-primary rounded-full shadow-md transition-all active:scale-95"
                    data-tooltip={t('common.save')}
                    data-position="bottom"
                >
                    <Save size={16} className="stroke-[2.5]" />
                </Button>
                <div className="h-4 w-px bg-outline-variant/30 mx-2" />
                <Button
                    variant="ghost"
                    onClick={onClearCurvatures}
                    className="p-2 hover:bg-primary/10 text-primary dark:text-primary/80 rounded-full"
                    data-tooltip={t('mapper.flowchart.clear_curvatures', 'Clear all edge curvatures')}
                    data-position="bottom"
                >
                    <Eraser size={16} />
                </Button>
                <Button
                    variant="ghost"
                    onClick={onExportImage}
                    className="p-2 hover:bg-primary/10 text-primary dark:text-primary/80 rounded-full transition-colors"
                    data-tooltip={t('mapper.flowchart.export_image')}
                    data-position="bottom"
                >
                    <Camera size={16} />
                </Button>
                <div className="h-4 w-px bg-outline-variant/30 mx-2" />
                <div className="flex items-center gap-2 px-3 py-1 bg-surface-variant/10 rounded-lg border border-outline-variant/20">
                    <span className="text-[10px] uppercase font-bold text-on-surface-variant/70 whitespace-nowrap">{t('mapper.flowchart.filter_by_tag')}</span>
                    <Select
                        className="bg-transparent border-none text-xs font-semibold text-primary dark:text-primary/80 outline-none cursor-pointer py-0 h-6 min-w-[120px]"
                        containerClassName="space-y-0 w-auto"
                        value={filterTag || ""}
                        onChange={(e) => setFilterTag(e.target.value || null)}
                        options={[
                            { value: "", label: t('mapper.flowchart.all_tags') },
                            ...allTags.map(tag => ({ value: tag, label: tag }))
                        ]}
                    />
                </div>
                <Button
                    variant="ghost"
                    onClick={onCenterView}
                    className="p-2 hover:bg-primary/10 text-primary dark:text-primary/80 rounded-full"
                    data-tooltip={t('mapper.flowchart.center_view')}
                    data-position="bottom"
                >
                    <Maximize size={16} />
                </Button>
                <div className="h-6 w-px bg-outline-variant/30 mx-2" />
                <div className="flex bg-surface-variant/30 rounded-lg p-1 mr-4">
                    <Button
                        variant="ghost"
                        onClick={() => onZoom(-0.1)}
                        className="p-1.5 hover:bg-surface/50 rounded text-on-surface-variant">
                        <ZoomOut size={16} />
                    </Button>
                    <span className="px-2 text-xs flex items-center text-on-surface-variant/80 min-w-[3rem] justify-center">{Math.round(scale * 100)}%</span>
                    <Button
                        variant="ghost"
                        onClick={() => onZoom(0.1)}
                        className="p-1.5 hover:bg-surface/50 rounded text-on-surface-variant">
                        <ZoomIn size={16} />
                    </Button>
                </div>
                <Button
                    variant="ghost"
                    onClick={onClose}
                    className="p-2 hover:bg-error/10 hover:text-error rounded-full transition-colors text-on-surface/60">
                    <X size={16} />
                </Button>
            </div>
        </div>
    );
}

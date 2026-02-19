
import { useEffect, useRef } from 'react';
import { Button } from '@/components/atoms/Button';
import { useTranslation } from 'react-i18next';
import { FileDown, FileText, Copy, Trash2 } from 'lucide-react';
import { feedback } from '@/lib/feedback';
import clsx from 'clsx';
import { exportToXlsx, exportToDocx } from '@/lib/dashboard/export';
import { addToHistory } from './HistoryPanel';

interface ScenarioEditorProps {
    content: string;
    onUpdate: (content: string) => void;
    onClear: () => void;
}

export function ScenarioEditor({ content, onUpdate, onClear }: ScenarioEditorProps) {
    const { t, i18n } = useTranslation();
    const editorRef = useRef<HTMLDivElement>(null);

    // Sync content to editable div initially or when regenerated
    useEffect(() => {
        if (editorRef.current && content !== editorRef.current.innerText) {
            editorRef.current.innerText = content;
        }
    }, [content]);

    const handleInput = () => {
        if (editorRef.current) {
            onUpdate(editorRef.current.innerText);
        }
    };

    const handleExportXlsx = () => {
        if (!content.trim()) return;
        try {
            const blob = exportToXlsx(content, i18n.language);
            if (blob) {
                addToHistory("XLSX", `cenarios_${new Date().getTime()}.xlsx`, blob);
            }
            feedback.toast.success(t('dashboard.export.success', "Successfully exported!"));
        } catch (e) {
            feedback.toast.error("dashboard.export.error", e);
        }
    };

    const handleExportDocx = async () => {
        if (!editorRef.current || !content.trim()) return;
        try {
            const blob = await exportToDocx(content, i18n.language);
            if (blob) {
                addToHistory("DOCX", `cenarios_${new Date().getTime()}.docx`, blob);
            }
            feedback.toast.success(t('dashboard.export.success', "Successfully exported!"));
        } catch (e) {
            feedback.toast.error("dashboard.export.error", e);
        }
    };

    const handleCopy = () => {
        if (!content) return;
        navigator.clipboard.writeText(content);
        feedback.toast.success(t('common.copied', "Copied!"));
    };

    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
                    {t('dashboard.editor.title', "Generated Scenarios")}
                </h3>
                <div className="flex gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopy}
                        disabled={!content}
                        className="text-on-surface-variant"
                        title={t('common.copy')}
                    >
                        <Copy size={16} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClear}
                        disabled={!content}
                        className="text-on-surface-variant hover:text-error"
                        title={t('common.clear')}
                    >
                        <Trash2 size={16} />
                    </Button>
                </div>
            </div>

            <div
                ref={editorRef}
                contentEditable
                onInput={handleInput}
                className={clsx(
                    "flex-1 w-full bg-surface-variant/30 text-on-surface p-4 rounded-2xl outline-none border border-transparent focus:border-primary/50 transition-all text-sm font-mono custom-scrollbar overflow-y-auto whitespace-pre-wrap",
                    "empty:before:content-[attr(data-placeholder)] empty:before:text-on-surface-variant/50"
                )}
                data-placeholder={t('dashboard.editor.placeholder', "Generated scenarios will appear here. You can edit and paste images...")}
                style={{ minHeight: '200px' }}
            />

            <div className="grid grid-cols-2 gap-3">
                <Button
                    variant="outline"
                    onClick={handleExportXlsx}
                    disabled={!content}
                    leftIcon={<FileDown size={16} className="text-green-600" />}
                    className="justify-center"
                >
                    {t('dashboard.actions.export_xlsx', "Excel (.xlsx)")}
                </Button>
                <Button
                    variant="outline"
                    onClick={handleExportDocx}
                    disabled={!content}
                    leftIcon={<FileText size={16} className="text-blue-600" />}
                    className="justify-center"
                >
                    {t('dashboard.actions.export_docx', "Word (.docx)")}
                </Button>
            </div>
        </div>
    );
}

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { Button } from '@/components/atoms/Button';
import { feedback } from '@/lib/feedback';
import { IncomingSnippetData } from '@/hooks/useCompanion';
import { Bot, Copy, Download, X, CheckCircle2 } from 'lucide-react';

interface IncomingSnippetModalProps {
    snippetData: IncomingSnippetData | null;
    onClose: () => void;
}

export const IncomingSnippetModal: React.FC<IncomingSnippetModalProps> = ({ snippetData, onClose }) => {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const [saving, setSaving] = useState(false);

    if (!snippetData) return null;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(snippetData.content);
            setCopied(true);
            feedback.toast.success(t('companion.snippet_copied', 'Snippet copied to clipboard!'));
            setTimeout(() => setCopied(false), 2000);
        } catch (e) {
            console.error('Failed to copy snippet:', e);
        }
    };

    const handleSaveFile = async () => {
        setSaving(true);
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const defaultFilename = `snippet_${timestamp}.robot`;
            
            const selectedPath = await save({
                defaultPath: defaultFilename,
                filters: [
                    {
                        name: 'Robot Framework (*.robot)',
                        extensions: ['robot']
                    }
                ]
            });

            if (selectedPath) {
                await writeTextFile(selectedPath, snippetData.content);
                feedback.toast.success(t('companion.snippet_saved_success', 'Robot Framework file saved successfully!'));
                onClose();
            }
        } catch (e) {
            console.error('Failed to save robot file:', e);
            feedback.toast.error(t('companion.snippet_save_error', 'Failed to save file'));
        } finally {
            setSaving(false);
        }
    };

    const lineCount = snippetData.content.split('\n').length;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="relative w-full max-w-2xl bg-surface border border-outline-variant/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 bg-surface-variant/40">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                <Bot className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-on-surface">
                                    {t('companion.incoming_snippet_title', 'Snippet .robot Received from Companion')}
                                </h3>
                                <p className="text-xs text-on-surface-variant">
                                    {t('companion.incoming_snippet_desc', 'Recorded test scenario synced from the device.')}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content Preview */}
                    <div className="p-6 flex-1 overflow-y-auto space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-on-surface-variant">
                                {t('companion.snippet_preview', 'Preview')} ({lineCount} {t('companion.lines', 'lines')})
                            </span>
                            <span className="text-xs text-on-surface-variant/70 font-mono">
                                {snippetData.deviceUdid}
                            </span>
                        </div>

                        <div className="relative group">
                            <pre className="p-4 rounded-xl bg-surface-container font-mono text-xs text-on-surface leading-relaxed overflow-x-auto border border-outline-variant/20 max-h-72">
                                <code>{snippetData.content}</code>
                            </pre>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between px-6 py-4 border-t border-outline-variant/20 bg-surface-variant/20">
                        <Button
                            variant="ghost"
                            onClick={onClose}
                            className="text-xs"
                        >
                            {t('common.dismiss', 'Dismiss')}
                        </Button>

                        <div className="flex items-center gap-3">
                            <Button
                                variant="outline"
                                onClick={handleCopy}
                                className="text-xs gap-2"
                            >
                                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                {copied ? t('common.copied', 'Copied!') : t('companion.copy_snippet', 'Copy Snippet')}
                            </Button>

                            <Button
                                variant="primary"
                                onClick={handleSaveFile}
                                disabled={saving}
                                className="text-xs gap-2"
                            >
                                <Download className="w-4 h-4" />
                                {saving ? t('common.saving', 'Saving...') : t('companion.save_as_file', 'Save File as...')}
                            </Button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

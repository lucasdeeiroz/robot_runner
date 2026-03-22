import { X, Trash2, FileText, Folder, FileCode, Search } from "lucide-react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { useSelection, SelectionItem } from "@/lib/selectionStore";
import { useSettings } from "@/lib/settings";
import { Button } from "@/components/atoms/Button";
import clsx from "clsx";

interface SelectionSummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SelectionSummaryModal({ isOpen, onClose }: SelectionSummaryModalProps) {
    const { t } = useTranslation();
    const { items, removeItem, clearSelection } = useSelection();
    const { settings } = useSettings();
    const rootPath = settings.paths.automationRoot;

    const groupedItems = items.reduce((acc, item) => {
        const type = item.type;
        if (!acc[type]) acc[type] = [];
        acc[type]!.push(item);
        return acc;
    }, {} as Partial<Record<SelectionItem['type'], SelectionItem[]>>);

    const renderItem = (item: SelectionItem) => {
        const Icon = item.type === 'folder' ? Folder : item.type === 'args' ? FileText : FileCode;

        return (
            <div
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-2xl bg-surface-variant/20 hover:bg-surface-variant/40 transition-colors group"
            >
                <div className={clsx(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    item.type === 'folder' ? "bg-warning-container/20 text-warning" :
                        item.type === 'args' ? "bg-info-container/20 text-info" : "bg-primary-container/20 text-primary"
                )}>
                    <Icon size={20} />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-on-surface truncate">
                        {item.name}
                    </div>
                    <div className="text-xs text-on-surface-variant truncate font-mono opacity-60">
                        {rootPath && item.path.startsWith(rootPath)
                            ? item.path.replace(rootPath, '').replace(/^[\\/]/, '') || './'
                            : item.path}
                    </div>
                    {item.tests && item.tests.length > 0 && (
                        <div className="text-[10px] mt-1 px-2 py-0.5 bg-secondary-container/30 text-secondary rounded-full inline-block">
                            {t('tests.selection.tests', { count: item.tests.length })}
                        </div>
                    )}
                </div>

                <button
                    onClick={() => removeItem(item.id)}
                    className="p-2 opacity-0 group-hover:opacity-100 hover:bg-error/10 hover:text-error rounded-xl transition-all"
                    title={t('tests.selection.remove')}
                >
                    <Trash2 size={16} />
                </button>
            </div>
        );
    };

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="bg-surface border border-outline-variant/30 rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh] relative z-10 overflow-hidden"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-outline-variant/30 flex items-center justify-between bg-surface/50 backdrop-blur-md sticky top-0 z-10">
                            <div>
                                <h3 className="text-xl font-bold text-on-surface">
                                    {t('tests.selection.title')}
                                </h3>
                                <p className="text-sm text-on-surface-variant">
                                    {t('tests.selection.items', { count: items.length })}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={clearSelection}
                                    className="text-error hover:bg-error/10"
                                >
                                    {t('tests.selection.clear_all')}
                                </Button>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-surface-variant/50 rounded-full transition-colors"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {items.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant">
                                    <Search size={48} className="mb-4 opacity-20" />
                                    <p>{t('tests.no_selection')}</p>
                                </div>
                            ) : (
                                <>
                                    {groupedItems.folder && (
                                        <section>
                                            {Object.keys(groupedItems).length > 1 && (
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60 mb-3 px-1">
                                                    {t('tests.selection.folders', { count: groupedItems.folder.length })}
                                                </h4>
                                            )}
                                            <div className="grid gap-2">
                                                {groupedItems.folder.map(renderItem)}
                                            </div>
                                        </section>
                                    )}

                                    {groupedItems.file && (
                                        <section>
                                            {Object.keys(groupedItems).length > 1 && (
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60 mb-3 px-1">
                                                    {t('tests.selection.files', { count: groupedItems.file.length })}
                                                </h4>
                                            )}
                                            <div className="grid gap-2">
                                                {groupedItems.file.map(renderItem)}
                                            </div>
                                        </section>
                                    )}

                                    {groupedItems.args && (
                                        <section>
                                            {Object.keys(groupedItems).length > 1 && (
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60 mb-3 px-1">
                                                    {t('tests.selection.args', { count: groupedItems.args.length })}
                                                </h4>
                                            )}
                                            <div className="grid gap-2">
                                                {groupedItems.args.map(renderItem)}
                                            </div>
                                        </section>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-outline-variant/30 flex justify-end bg-surface/50 backdrop-blur-md">
                            <Button onClick={onClose} variant="primary" className="px-8 hover:bg-secondary-container">
                                {t('common.close', 'Close')}
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}

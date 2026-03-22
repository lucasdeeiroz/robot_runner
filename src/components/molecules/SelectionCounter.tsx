import { useSelection } from "@/lib/selectionStore";
import { useTranslation } from "react-i18next";
import { Trash2, ListFilter } from "lucide-react";
import { useState, useEffect } from "react";
import { SelectionSummaryModal } from "@/components/organisms/SelectionSummaryModal";

export function SelectionCounter() {
    const { items, clearSelection } = useSelection();
    const { t } = useTranslation();
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Reset modal state when selection becomes empty to prevent automatic re-opening on next selection
    useEffect(() => {
        if (items.length === 0 && isModalOpen) {
            setIsModalOpen(false);
        }
    }, [items.length, isModalOpen]);

    if (items.length === 0) return null;

    const fileCount = items.filter(i => i.type === 'file').length;
    const folderCount = items.filter(i => i.type === 'folder').length;
    const argsCount = items.filter(i => i.type === 'args').length;

    // Build summary string parts
    const parts = [];
    if (fileCount > 0) parts.push(t('tests.selection.files', { count: fileCount }));
    if (folderCount > 0) parts.push(t('tests.selection.folders', { count: folderCount }));
    if (argsCount > 0) parts.push(t('tests.selection.args', { count: argsCount }));

    return (
        <div className="flex items-center gap-2 px-4 py-2 bg-secondary-container text-on-secondary-container rounded-2xl shadow-lg border border-secondary/20 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2 mr-2">
                <ListFilter size={18} className="text-secondary" />
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="text-sm font-medium hover:underline px-2 py-1 rounded-lg hover:bg-on-secondary-container/10 transition-colors whitespace-nowrap"
                >
                    {parts.join(", ")}
                </button>
            </div>

            <div className="h-4 w-px bg-on-secondary-container/20 mx-1" />


            <button
                onClick={clearSelection}
                className="p-1.5 hover:bg-error/10 hover:text-error rounded-full transition-colors"
                title={t('tests.selection.clear_all')}
            >
                <Trash2 size={16} />
            </button>

            <SelectionSummaryModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
        </div>
    );
}

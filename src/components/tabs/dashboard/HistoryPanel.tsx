
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/atoms/Button';
import { Download, Trash2, Clock } from 'lucide-react';
import clsx from 'clsx';
import { feedback } from '@/lib/feedback';

interface HistoryItem {
    id: string; // generated
    doc_type: "XLSX" | "DOCX";
    file_name: string;
    created_at: string; // ISO string or locale string
    base64: string; // Data URL for download
}

export function HistoryPanel() {
    const { t } = useTranslation();
    const [history, setHistory] = useState<HistoryItem[]>([]);

    useEffect(() => {
        const saved = localStorage.getItem("robot_runner_history");
        if (saved) {
            try {
                setHistory(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse history", e);
            }
        }

        // Listener for custom event if we want cross-component updates (optional, for now using direct updates via prop or just polling/event if needed. 
        // simpler: export function to add to history and dispatch event)
        const handleStorage = () => {
            const saved = localStorage.getItem("robot_runner_history");
            if (saved) setHistory(JSON.parse(saved));
        };

        window.addEventListener('robot_runner-history-update', handleStorage);
        return () => window.removeEventListener('robot_runner-history-update', handleStorage);
    }, []);

    const handleDelete = (id: string) => {
        const newHistory = history.filter(item => item.id !== id);
        setHistory(newHistory);
        localStorage.setItem("robot_runner_history", JSON.stringify(newHistory));
    };

    const handleDownload = (item: HistoryItem) => {
        const a = document.createElement("a");
        a.href = item.base64;
        a.download = item.file_name;
        a.click();
        feedback.toast.success(t('common.downloading', "Downloading..."));
    };

    return (
        <div className="flex flex-col gap-3 h-full">
            <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider flex items-center gap-2 mb-2">
                <Clock size={16} />
                {t('dashboard.history.title', "History")}
            </h3>

            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-1">
                {history.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-40 text-on-surface-variant/50 border-2 border-dashed border-outline-variant/30 rounded-2xl">
                        <span className="text-sm">{t('dashboard.history.empty', "No files generated.")}</span>
                    </div>
                )}

                {history.map((item) => (
                    <div key={item.id} className="bg-surface p-3 rounded-2xl border border-outline-variant/30 flex flex-col gap-2 group hover:border-primary/30 transition-colors">
                        <div className="flex items-center justify-between">
                            <span className="font-medium text-sm text-on-surface truncate flex-1" title={item.file_name}>{item.file_name}</span>
                            <span className={clsx(
                                "text-[10px] px-1.5 py-0.5 rounded-2xl font-bold uppercase tracking-wider",
                                item.doc_type === 'XLSX' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            )}>
                                {item.doc_type}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-on-surface-variant/70">
                            <span>{new Date(item.created_at).toLocaleString()}</span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDownload(item)}
                                    className="h-6 w-6 p-0 text-primary"
                                    title={t('common.download')}
                                >
                                    <Download size={14} />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(item.id)}
                                    className="h-6 w-6 p-0 text-error"
                                    title={t('common.delete')}
                                >
                                    <Trash2 size={14} />
                                </Button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Global helper to add to history
export function addToHistory(doc_type: "XLSX" | "DOCX", file_name: string, blob: Blob) {
    const reader = new FileReader();
    reader.onload = function () {
        const history = JSON.parse(localStorage.getItem("robot_runner_history") || "[]");
        history.unshift({
            id: Date.now().toString(),
            doc_type,
            file_name,
            created_at: new Date().toISOString(),
            base64: reader.result as string
        });
        localStorage.setItem("robot_runner_history", JSON.stringify(history));
        window.dispatchEvent(new Event('robot_runner-history-update'));
    };
    reader.readAsDataURL(blob);
}

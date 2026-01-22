import { X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";

interface FileSavedFeedbackProps {
    path: string | null;
    onClose?: () => void;
    className?: string;
}

export function FileSavedFeedback({ path, onClose, className = "" }: FileSavedFeedbackProps) {
    const { t } = useTranslation();

    if (!path) return null;

    return (
        <div className={`bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 p-3 rounded-md text-sm mb-4 border border-green-100 dark:border-green-900/50 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${className}`}>
            <span>{t('feedback.saved_to_prefix', 'File saved to:')}</span>
            <span
                className="underline cursor-pointer hover:text-green-900 dark:hover:text-green-100 font-mono break-all flex-1"
                onClick={() => invoke('open_path', { path })}
                title={t('common.open_file', "Click to open file")}
            >
                {path}
            </span>
            {onClose && (
                <button
                    onClick={onClose}
                    className="ml-2 hover:bg-green-100 dark:hover:bg-green-800 rounded p-1 transition-colors"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
}

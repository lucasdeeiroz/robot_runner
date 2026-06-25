import { X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/atoms/Button";

interface FileSavedFeedbackProps {
    path: string | null;
    onClose?: () => void;
    className?: string;
}

export function FileSavedFeedback({ path, onClose, className = "" }: FileSavedFeedbackProps) {
    const { t } = useTranslation();

    if (!path) return null;

    return (
        <div className={`bg-success-container/20 text-on-success-container p-3 rounded-2xl text-sm mb-4 border border-success/20 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${className}`}>
            <span>{t('feedback.saved_to_prefix', 'File saved to:')}</span>
            <span
                className="underline cursor-pointer hover:opacity-80 font-mono break-all flex-1"
                onClick={() => invoke('open_path', { path })}
                title={t('common.open_file', "Click to open file")}
            >
                {path}
            </span>
            {onClose && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="ml-2 rounded-full p-1.5 hover:bg-success/20 hover:text-success transition-colors h-auto w-auto"
                >
                    <X size={14} />
                </Button>
            )}
        </div>
    );
}

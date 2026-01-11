import { Trash2, AlertTriangle, X } from "lucide-react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning';
    isLoading?: boolean;
}

export function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText,
    cancelText,
    variant = 'danger',
    isLoading = false
}: ConfirmationModalProps) {
    const { t } = useTranslation();

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-md p-6 relative animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                    disabled={isLoading}
                >
                    <X size={20} />
                </button>

                <div className="flex flex-col items-center text-center">
                    <div className={clsx(
                        "w-12 h-12 rounded-full flex items-center justify-center mb-4",
                        variant === 'danger' ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400"
                    )}>
                        {variant === 'danger' ? <Trash2 size={24} /> : <AlertTriangle size={24} />}
                    </div>

                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        {title}
                    </h3>

                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
                        {description}
                    </p>

                    <div className="flex items-center gap-3 w-full">
                        <button
                            onClick={onClose}
                            disabled={isLoading}
                            className="flex-1 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors font-medium text-sm disabled:opacity-50"
                        >
                            {cancelText || t('common.cancel')}
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={isLoading}
                            className={clsx(
                                "flex-1 px-4 py-2 text-white rounded-lg transition-colors font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2",
                                variant === 'danger'
                                    ? "bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                                    : "bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-600 dark:hover:bg-yellow-700"
                            )}
                        >
                            {isLoading && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            {confirmText || t('common.confirm')}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

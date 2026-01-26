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
            <div className="bg-surface border border-outline-variant/30 rounded-xl shadow-xl w-full max-w-md p-6 relative animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-on-surface/80 hover:text-on-surface-variant/80 transition-colors"
                    disabled={isLoading}
                >
                    <X size={20} />
                </button>

                <div className="flex flex-col items-center text-center">
                    <div className={clsx(
                        "w-12 h-12 rounded-full flex items-center justify-center mb-4",
                        variant === 'danger' ? "bg-error-container/50 text-on-surface/80" : "bg-warning-container/50 text-on-surface/80"
                    )}>
                        {variant === 'danger' ? <Trash2 size={24} /> : <AlertTriangle size={24} />}
                    </div>

                    <h3 className="text-lg font-semibold text-on-surface/80 mb-2">
                        {title}
                    </h3>

                    <p className="text-sm text-on-surface-variant/80 mb-6">
                        {description}
                    </p>

                    <div className="flex items-center gap-3 w-full">
                        <button
                            onClick={onClose}
                            disabled={isLoading}
                            className="flex-1 px-4 py-2 bg-surface-variant hover:bg-surface-variant/80 text-on-surface-variant/80 rounded-lg transition-colors font-medium text-sm disabled:opacity-50"
                        >
                            {cancelText || t('common.cancel')}
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={isLoading}
                            className={clsx(
                                "flex-1 px-4 py-2 text-on-primary rounded-lg transition-colors font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2",
                                variant === 'danger'
                                    ? "bg-error-container hover:bg-error-container/80 text-on-surface/80"
                                    : "bg-warning-container hover:bg-warning-container/80 text-on-surface/80"
                            )}
                        >
                            {isLoading && <div className="w-3 h-3 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />}
                            {confirmText || t('common.confirm')}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

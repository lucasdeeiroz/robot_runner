import { AlertCircle, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface WarningModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description: string;
    buttonText?: string;
}

export function WarningModal({
    isOpen,
    onClose,
    title,
    description,
    buttonText
}: WarningModalProps) {
    const { t } = useTranslation();

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-surface border border-outline-variant/30 rounded-xl shadow-xl w-full max-w-md p-6 relative animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-on-surface/80 hover:text-on-surface-variant/80 transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="flex flex-col items-center text-center">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4 bg-warning-container text-warning-container/80">
                        <AlertCircle size={24} />
                    </div>

                    <h3 className="text-lg font-semibold text-on-surface/80 mb-2">
                        {title}
                    </h3>

                    <p className="text-sm text-on-surface-variant/80 mb-6 on-primaryspace-pre-wrap">
                        {description}
                    </p>

                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 bg-warning-container/80 hover:bg-on-warning-container text-on-primary rounded-lg transition-colors font-medium text-sm flex items-center justify-center"
                    >
                        {buttonText || t('common.ok', "OK")}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

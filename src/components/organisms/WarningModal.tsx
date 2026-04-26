import React from "react";
import { AlertCircle, X, AlertTriangle } from "lucide-react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "../atoms/Button";

interface WarningModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm?: () => void;
    title: string;
    description: string | React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: 'warning' | 'danger';
    secondaryAction?: {
        label: string;
        onClick: () => void;
        variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning' | 'outline';
        icon?: React.ReactNode;
    };
}

export function WarningModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText,
    cancelText,
    variant = 'warning',
    secondaryAction
}: WarningModalProps) {
    const { t } = useTranslation();

    const Icon = variant === 'danger' ? AlertTriangle : AlertCircle;
    const colorClass = variant === 'danger' ? 'bg-error-container text-error' : 'bg-warning-container text-warning';

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="bg-surface border border-outline-variant/30 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative z-10"
                    >
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${colorClass}`}>
                                    <Icon size={24} />
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 -mr-2 text-on-surface/40 hover:text-on-surface/80 hover:bg-surface-variant/50 rounded-xl transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <h3 className="text-xl font-bold text-on-surface mb-2">
                                {title}
                            </h3>

                            <div className="text-on-surface-variant/80 text-sm leading-relaxed mb-8">
                                {description}
                            </div>

                            <div className="flex flex-col sm:flex-row items-center gap-3">
                                {secondaryAction && (
                                    <Button
                                        variant={secondaryAction.variant || "ghost"}
                                        className="w-full sm:flex-1 order-2 sm:order-1"
                                        onClick={secondaryAction.onClick}
                                        leftIcon={secondaryAction.icon}
                                    >
                                        {secondaryAction.label}
                                    </Button>
                                )}
                                <div className="flex flex-1 w-full items-center gap-3 order-1 sm:order-2">
                                    {onConfirm ? (
                                        <>
                                            <Button
                                                variant="ghost"
                                                className="flex-1"
                                                onClick={onClose}
                                            >
                                                {cancelText || t('common.cancel', "Cancel")}
                                            </Button>
                                            <Button
                                                variant={variant === 'danger' ? 'danger' : 'primary'}
                                                className="flex-1"
                                                onClick={onConfirm}
                                            >
                                                {confirmText || t('common.ok', "OK")}
                                            </Button>
                                        </>
                                    ) : (
                                        <Button
                                            variant="primary"
                                            className="w-full"
                                            onClick={onClose}
                                        >
                                            {confirmText || t('common.ok', "OK")}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}

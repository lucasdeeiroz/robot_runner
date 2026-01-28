import { Upload, Trash2, Check, Image as ImageIcon } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

interface LogoInputProps {
    label: string;
    value?: string;
    onUpload: () => void;
    onDelete: () => void;
    placeholder?: string;
}

export function LogoInput({ label, value, onUpload, onDelete, placeholder }: LogoInputProps) {
    const { t } = useTranslation();

    return (
        <div className="flex flex-col gap-2">
            <span className="text-xs text-on-surface-variant/80">{label}</span>
            <div className="flex items-center gap-2 bg-surface/50 border border-outline-variant/30 rounded-2xl px-3 py-2 h-[42px]">
                {/* Status Icon */}
                <div className={clsx(
                    "flex items-center justify-center w-6 h-6 rounded-2xl shrink-0",
                    value
                        ? "bg-success-container text-on-success-container/10"
                        : "bg-outline-variant text-on-surface/80"
                )}>
                    {value ? <Check size={14} /> : <ImageIcon size={14} />}
                </div>

                {/* Status Text / Placeholder */}
                <span className={clsx(
                    "flex-1 text-xs truncate",
                    value ? "text-on-surface/80 font-medium" : "text-on-surface/80 italic"
                )}>
                    {value ? t('settings.appearance.logo_set') : (placeholder || t('settings.appearance.no_logo'))}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1">
                    {value && (
                        <button
                            onClick={onDelete}
                            className="p-1.5 text-on-surface/80 hover:text-error hover:bg-error-container/10 rounded-2xl transition-all"
                            title={t('settings.appearance.remove_logo')}
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                    <button
                        onClick={onUpload}
                        className="p-1.5 text-on-surface-variant/80 hover:text-primary hover:bg-outline-variant rounded-2xl transition-all"
                        title={t('settings.appearance.upload_logo')}
                    >
                        <Upload size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}

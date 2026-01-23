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
            <span className="text-xs text-zinc-500">{label}</span>
            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 h-[42px]">
                {/* Status Icon */}
                <div className={clsx(
                    "flex items-center justify-center w-6 h-6 rounded-full shrink-0",
                    value
                        ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
                )}>
                    {value ? <Check size={14} /> : <ImageIcon size={14} />}
                </div>

                {/* Status Text / Placeholder */}
                <span className={clsx(
                    "flex-1 text-xs truncate",
                    value ? "text-zinc-900 dark:text-zinc-100 font-medium" : "text-zinc-400 italic"
                )}>
                    {value ? t('settings.appearance.logo_set') : (placeholder || t('settings.appearance.no_logo'))}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={onUpload}
                        className="p-1.5 text-zinc-500 hover:text-primary hover:bg-zinc-200 dark:hover:bg-zinc-700/50 rounded-lg transition-all"
                        title={t('settings.appearance.upload_logo')}
                    >
                        <Upload size={14} />
                    </button>
                    {value && (
                        <button
                            onClick={onDelete}
                            className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                            title={t('settings.appearance.remove_logo')}
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

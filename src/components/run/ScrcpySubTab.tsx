import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Cast, Smartphone, AlertCircle } from "lucide-react";
import clsx from "clsx";

interface ScrcpySubTabProps {
    selectedDevice: string;
}

export function ScrcpySubTab({ selectedDevice }: ScrcpySubTabProps) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleStartMirror = async () => {
        setLoading(true);
        setError(null);
        try {
            await invoke('open_scrcpy', { device: selectedDevice });
            // Scrcpy opens in a separate window, so we just reset state
        } catch (e) {
            console.error("Failed to open Scrcpy:", e);
            setError(typeof e === 'string' ? e : t('scrcpy.error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
            <div className="mb-6 p-4 bg-zinc-100 dark:bg-zinc-800 rounded-full">
                <Cast size={48} className="text-zinc-400 dark:text-zinc-500" />
            </div>

            <h2 className="text-xl font-semibold mb-2 text-zinc-800 dark:text-zinc-100">{t('scrcpy.title')}</h2>
            <p className="text-zinc-500 mb-8">
                {t('scrcpy.description')}
            </p>

            {error && (
                <div className="flex items-start gap-3 p-4 mb-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm text-left border border-red-100 dark:border-red-900/50">
                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                    <div>{error}</div>
                </div>
            )}

            <button
                onClick={handleStartMirror}
                disabled={loading}
                className={clsx(
                    "flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all shadow-sm active:scale-95",
                    loading
                        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20"
                )}
            >
                {loading ? (
                    <>
                        {t('scrcpy.starting')}
                    </>
                ) : (
                    <>
                        <Smartphone size={20} />
                        {t('scrcpy.start')}
                    </>
                )}
            </button>

            <p className="mt-8 text-xs text-zinc-400 text-center">
                {t('scrcpy.note')}
            </p>
        </div>
    );
}

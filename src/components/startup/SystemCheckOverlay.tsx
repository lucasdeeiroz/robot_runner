import { SystemCheckStatus } from "@/lib/settings";
import { Loader2, AlertTriangle, XCircle, MonitorX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/common/Modal";
import { TOOL_LINKS } from "@/lib/tools";

interface SystemCheckOverlayProps {
    status: SystemCheckStatus;
    onCriticalExit: () => void;
    onTestingRedirect: () => void;
    onMirroringContinue: () => void;
    onDismiss: () => void;
}

export function SystemCheckOverlay({ status, onCriticalExit, onTestingRedirect, onMirroringContinue, onDismiss }: SystemCheckOverlayProps) {
    const { t } = useTranslation();

    // We can derive the current state to show based on priority
    // 1. Loading
    // 2. Critical Error (Node/ADB)
    // 3. Testing Error (Python/Robot/Appium) - Only if not acknowledged ? Actually, if we redirect, we are "done" with the overlay.
    // 4. Mirroring Error (Scrcpy)

    if (status.loading || !status.complete) {
        return (
            <div className="fixed inset-0 z-[100] bg-white dark:bg-zinc-950 flex flex-col items-center justify-center space-y-4 animate-in fade-in duration-300">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <div className="flex flex-col items-center gap-2">
                    <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{t('startup.loading')}</h2>
                    <p className="text-sm text-zinc-500">{t('startup.checking')}</p>
                </div>
            </div>
        );
    }

    // Critical Tools Check
    if (status.missingCritical.length > 0) {
        const isAdbMissing = status.missingCritical.some(t => t.toLowerCase().includes('adb'));

        return (
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white dark:bg-zinc-900 rounded-xl max-w-md w-full p-6 border border-zinc-200 dark:border-zinc-800 shadow-2xl space-y-6">
                    <div className="flex flex-col items-center text-center space-y-2">
                        <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full text-red-600 dark:text-red-400">
                            <XCircle size={32} />
                        </div>
                        <h2 className="text-lg font-bold text-zinc-900 dark:text-white">{t('startup.critical.title')}</h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('startup.critical.description')}</p>
                    </div>

                    <div className="bg-zinc-100 dark:bg-zinc-800/50 rounded-lg p-3">
                        <ul className="list-disc list-inside text-sm text-zinc-700 dark:text-zinc-300 space-y-1">
                            {status.missingCritical.map(tool => (
                                <li key={tool} className="font-medium">{tool}</li>
                            ))}
                        </ul>
                        {isAdbMissing && (
                            <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700 flex justify-center">
                                <a
                                    href={TOOL_LINKS.adb}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                                >
                                    Download ADB Platform Tools
                                </a>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={onCriticalExit}
                        className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                    >
                        {t('startup.critical.action')}
                    </button>
                </div>
            </div>
        );
    }

    // Testing Tools Check
    // If we haven't acknowledged it yet
    if (status.missingTesting.length > 0) {
        return (
            <Modal
                isOpen={true}
                onClose={onDismiss}
                title={t('startup.testing.title')}
                className="max-w-md"
            >
                <div className="space-y-6">
                    <div className="flex flex-col items-center text-center space-y-2">
                        <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-full text-amber-600 dark:text-amber-400">
                            <AlertTriangle size={32} />
                        </div>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('startup.testing.description')}</p>
                    </div>

                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 border border-zinc-100 dark:border-zinc-700">
                        <ul className="list-disc list-inside text-sm text-zinc-700 dark:text-zinc-300 space-y-1">
                            {status.missingTesting.map(tool => (
                                <li key={tool} className="font-medium">{tool}</li>
                            ))}
                        </ul>
                    </div>

                    <p className="text-xs text-zinc-400 text-center italic">{t('startup.testing.note')}</p>

                    <button
                        onClick={onTestingRedirect}
                        className="w-full py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-lg font-medium transition-opacity hover:opacity-90"
                    >
                        {t('startup.testing.action')}
                    </button>
                </div>
            </Modal>
        );
    }

    // Mirroring Tools Check (Scrcpy)
    if (status.missingMirroring.length > 0) {
        // Priority: Critical > Testing > Mirroring.
        // If we are here, Critical is clean. Testing is clean OR acknowledged/redirected?
        // Wait, if Testing redirected, we essentially unmount this component or `onTestingRedirect` handles the navigation and this component might still be mounted?
        // Actually, `App.tsx` logic will determine if we stay on overlay.
        // If we define that this component manages the *sequence* of modals:

        return (
            <Modal
                isOpen={true}
                onClose={onDismiss}
                title={t('startup.mirroring.title')}
                className="max-w-md"
            >
                <div className="space-y-6">
                    <div className="flex flex-col items-center text-center space-y-2">
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600 dark:text-blue-400">
                            <MonitorX size={32} />
                        </div>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('startup.mirroring.description')}</p>
                    </div>

                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 border border-zinc-100 dark:border-zinc-700">
                        <ul className="list-disc list-inside text-sm text-zinc-700 dark:text-zinc-300 space-y-1">
                            {status.missingMirroring.map(tool => (
                                <li key={tool} className="font-medium">{tool}</li>
                            ))}
                        </ul>
                    </div>
                    <p className="text-xs text-zinc-400 text-center italic">{t('startup.mirroring.note')}</p>

                    <button
                        onClick={onMirroringContinue}
                        className="w-full py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-lg font-medium transition-opacity hover:opacity-90"
                    >
                        {t('startup.mirroring.action')}
                    </button>
                </div>
            </Modal>
        );
    }

    return null; // All checks passed
}

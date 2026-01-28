import { SystemCheckStatus } from "@/lib/settings";
import { Loader2, AlertTriangle, XCircle, MonitorX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/organisms/Modal";
import { TOOL_LINKS } from "@/lib/tools";
import { motion } from "framer-motion";

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
    // 3. Testing Error (Python/Robot/Appium)
    // 4. Mirroring Error (Scrcpy)

    if (status.loading || !status.complete) {
        return (
            <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-surface flex flex-col items-center justify-center space-y-4"
            >
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <div className="flex flex-col items-center gap-2">
                    <h2 className="text-xl font-semibold text-on-surface/80">{t('startup.loading')}</h2>
                    <p className="text-sm text-on-surface-variant/80">{t('startup.checking')}</p>
                </div>
            </motion.div>
        );
    }

    // Critical Tools Check
    if (status.missingCritical.length > 0) {
        const isAdbMissing = status.missingCritical.some(t => t.toLowerCase().includes('adb'));

        return (
            <motion.div
                key="critical"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-surface rounded-2xl max-w-md w-full p-6 border border-outline-variant/30 shadow-2xl space-y-6"
                >
                    <div className="flex flex-col items-center text-center space-y-2">
                        <div className="p-3 bg-error-container rounded-2xl text-on-error-container">
                            <XCircle size={32} />
                        </div>
                        <h2 className="text-lg font-bold text-on-surface/80">{t('startup.critical.title')}</h2>
                        <p className="text-sm text-on-surface-variant/80">{t('startup.critical.description')}</p>
                    </div>

                    <div className="bg-surface-variant/50 rounded-2xl p-3">
                        <ul className="list-disc list-inside text-sm text-on-surface/80 space-y-1">
                            {status.missingCritical.map(tool => (
                                <li key={tool} className="font-medium">{tool}</li>
                            ))}
                        </ul>
                        {isAdbMissing && (
                            <div className="mt-3 pt-3 border-t border-outline-variant/30 flex justify-center">
                                <a
                                    href={TOOL_LINKS.adb}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                                >
                                    Download ADB Platform Tools
                                </a>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={onCriticalExit}
                        className="w-full py-2.5 bg-error hover:bg-error/90 text-on-error rounded-2xl font-medium transition-colors"
                    >
                        {t('startup.critical.action')}
                    </button>
                </motion.div>
            </motion.div>
        );
    }

    // Testing Tools Check
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
                        <div className="p-3 bg-warning-container rounded-2xl text-warning-container/80">
                            <AlertTriangle size={32} />
                        </div>
                        <p className="text-sm text-on-surface-variant/80">{t('startup.testing.description')}</p>
                    </div>

                    <div className="bg-surface/50 rounded-2xl p-3 border border-outline-variant/30">
                        <ul className="list-disc list-inside text-sm text-on-surface-variant/80 space-y-1">
                            {status.missingTesting.map(tool => (
                                <li key={tool} className="font-medium">{tool}</li>
                            ))}
                        </ul>
                    </div>

                    <p className="text-xs text-on-surface/80 text-center italic">{t('startup.testing.note')}</p>

                    <button
                        onClick={onTestingRedirect}
                        className="w-full py-2.5 bg-on-surface text-on-primary rounded-2xl font-medium transition-opacity hover:opacity-90"
                    >
                        {t('startup.testing.action')}
                    </button>
                </div>
            </Modal>
        );
    }

    // Mirroring Tools Check (Scrcpy)
    if (status.missingMirroring.length > 0) {

        return (
            <Modal
                isOpen={true}
                onClose={onDismiss}
                title={t('startup.mirroring.title')}
                className="max-w-md"
            >
                <div className="space-y-6">
                    <div className="flex flex-col items-center text-center space-y-2">
                        <div className="p-3 bg-info-container rounded-2xl text-primary">
                            <MonitorX size={32} />
                        </div>
                        <p className="text-sm text-on-surface-variant/80">{t('startup.mirroring.description')}</p>
                    </div>

                    <div className="bg-surface/50 rounded-2xl p-3 border border-outline-variant/30">
                        <ul className="list-disc list-inside text-sm text-on-surface-variant/80 space-y-1">
                            {status.missingMirroring.map(tool => (
                                <li key={tool} className="font-medium">{tool}</li>
                            ))}
                        </ul>
                    </div>
                    <p className="text-xs text-on-surface/80 text-center italic">{t('startup.mirroring.note')}</p>

                    <button
                        onClick={onMirroringContinue}
                        className="w-full py-2.5 bg-on-surface text-on-primary rounded-2xl font-medium transition-opacity hover:opacity-90"
                    >
                        {t('startup.mirroring.action')}
                    </button>
                </div>
            </Modal>
        );
    }

    return null; // All checks passed
}

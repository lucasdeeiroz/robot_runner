import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { SystemCheckStatus } from "@/lib/settings";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";

interface BackgroundToolCheckIndicatorProps {
    status: SystemCheckStatus;
}

// Non-blocking pill shown while optional tools are still being identified after ADB is ready
export function BackgroundToolCheckIndicator({ status }: BackgroundToolCheckIndicatorProps) {
    const { t } = useTranslation();
    const isVisible = !status.loading && !status.complete && status.totalTools > 0;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    key="background-tool-check"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 16 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    style={{ x: "-50%" }}
                    className="fixed bottom-4 left-1/2 z-[90] flex items-center gap-2.5 px-4 py-2 rounded-full bg-surface/80 backdrop-blur-md border border-outline-variant/30 shadow-lg text-xs text-on-surface-variant pointer-events-none"
                    role="status"
                    aria-live="polite"
                >
                    <ExpressiveLoading size="xsm" variant="circular" className="text-primary" />
                    <span>
                        {status.revalidating
                            ? t('startup.background.revalidating', 'Confirming tool versions...')
                            : t('startup.background.checking', 'Identifying tools in background...')}
                    </span>
                    <span className="font-mono text-on-surface/80">
                        {status.checkedTools}/{status.totalTools}
                    </span>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

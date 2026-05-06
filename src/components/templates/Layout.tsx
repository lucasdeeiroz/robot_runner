import { ReactNode } from 'react';
import { Sidebar } from '../organisms/Sidebar';
import { PresentationPanel } from '../organisms/presentation/PresentationPanel';
import { AiAgentPanel } from '../organisms/AiAgentPanel';
import { useSettings } from "@/lib/settings";
import { useRemoteConfig } from '@/lib/RemoteConfigProvider';
import { AnimatePresence, motion } from 'framer-motion';

interface LayoutProps {
    children: ReactNode;
    activePage: string;
    onNavigate: (page: string) => void;
}

export function Layout({ children, activePage, onNavigate }: LayoutProps) {
    const { settings } = useSettings();
    const { getBool } = useRemoteConfig();
    const isAskRaiEnabled = getBool('is_ask_rai_enabled');

    return (
        <div
            className="flex h-screen overflow-hidden transition-colors duration-300 pb-4"
            style={{ backgroundColor: 'var(--bg-app-variant)', color: 'var(--text-app-variant)' }}
        >
            <AnimatePresence>
                {settings.presentationEnabled && (
                    <motion.div
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: "19rem", opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.5, ease: "easeInOut" }}
                        className="overflow-hidden h-full flex-shrink-0"
                    >
                        <PresentationPanel />
                    </motion.div>
                )}
                {settings.aiChatEnabled && isAskRaiEnabled && (
                    <motion.div
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: "24rem", opacity: 1 }} // w-96 is 24rem
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.5, ease: "easeInOut" }}
                        className="overflow-hidden h-full flex-shrink-0"
                    >
                        <AiAgentPanel onNavigate={onNavigate} />
                    </motion.div>
                )}
            </AnimatePresence>
            <Sidebar activePage={activePage} onNavigate={onNavigate} />
            <main
                className="flex-1 h-full overflow-y-auto transition-colors duration-300 px-6 pt-6 pb-0 custom-scrollbar"
                style={{ backgroundColor: 'var(--bg-app)' }}
            >
                {children}
            </main>
        </div>
    );
}

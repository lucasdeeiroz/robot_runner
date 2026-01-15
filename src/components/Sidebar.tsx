import { useState, useEffect, useMemo } from 'react';
import {
    PlayCircle,
    Settings,
    Menu,
    FileText,
    Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettings } from "@/lib/settings";

import { useTranslation } from "react-i18next";
import packageJson from '../../package.json';
import { CustomLogo } from './common/CustomLogo';

interface SidebarProps {
    activePage: string;
    onNavigate: (page: string) => void;
}

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
    const { settings, updateInfo } = useSettings();
    const [collapsed, setCollapsed] = useState(false);
    const { t } = useTranslation();

    const updateAvailable = updateInfo?.available || false;
    const appVersion = updateInfo?.currentVersion || packageJson.version;

    useEffect(() => {
        let timeoutId: NodeJS.Timeout;
        const handleResize = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                // Auto-collapse on small screens
                if (window.innerWidth < 1024) {
                    setCollapsed(true);
                }
                if (window.innerWidth > 1400) {
                    setCollapsed(false);
                }
            }, 100);
        };

        handleResize(); // Check on mount (immediate)
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(timeoutId);
        };
    }, []);

    const navItems = useMemo(() => [
        { id: 'run', label: t('sidebar.run'), icon: PlayCircle },
        { id: 'tests', label: t('sidebar.tests'), icon: FileText },
        { id: 'settings', label: t('sidebar.settings'), icon: Settings },
        { id: 'about', label: t('sidebar.about'), icon: Info },
    ], [t]);

    return (
        <div className={cn(
            "h-screen bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-r border-zinc-200 dark:border-zinc-800 transition-all duration-300 flex flex-col",
            collapsed ? "w-16" : "w-64"
        )}>
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 h-[65px]">
                {!collapsed && (
                    settings.theme === 'light' && settings.customLogoLight ? (
                        <CustomLogo key={settings.customLogoLight} path={settings.customLogoLight} className="h-8 object-contain" />
                    ) : settings.theme === 'dark' && settings.customLogoDark ? (
                        <CustomLogo key={settings.customLogoDark} path={settings.customLogoDark} className="h-8 object-contain" />
                    ) : (
                        <span className="font-bold text-lg text-gray-900 dark:text-white tracking-tight">Robot Runner</span>
                    )
                )}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-transform active:scale-95"
                >
                    <Menu size={20} />
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-2 space-y-1">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => onNavigate(item.id)}
                        className={cn(
                            "w-full flex items-center p-2 rounded-xl transition-all duration-200 active:scale-95 relative",
                            activePage === item.id
                                ? "bg-primary text-white shadow-md shadow-primary/20"
                                : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white",
                            collapsed ? "justify-center" : "gap-3"
                        )}
                        title={collapsed ? item.label : undefined}
                    >
                        <div className="relative">
                            <item.icon size={20} />
                        </div>
                        {!collapsed && <span className="font-medium">{item.label}</span>}
                    </button>
                ))}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                {!collapsed && <div className="text-xs text-zinc-500 flex justify-between items-center">
                    <span>v{appVersion}</span>
                    {updateAvailable && (
                        <button
                            onClick={() => onNavigate('about')}
                            className="text-red-500 font-bold text-[10px] bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors animate-pulse cursor-pointer"
                        >
                            {t('about.update_badge')}
                        </button>
                    )}
                </div>}
            </div>
        </div>
    );
}

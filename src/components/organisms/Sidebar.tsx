import { useState, useEffect, useMemo } from 'react';
import {
    PlayCircle,
    Settings,
    Menu,
    FileText,
    Info,
    LayoutDashboard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettings } from "@/lib/settings";

import { useTranslation } from "react-i18next";
import packageJson from '../../../package.json';
import { CustomLogo } from '../molecules/CustomLogo';

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
        { id: 'dashboard', label: t('sidebar.dashboard'), icon: LayoutDashboard }, // Dashboard Button
        { id: 'settings', label: t('sidebar.settings'), icon: Settings },
        { id: 'about', label: t('sidebar.about'), icon: Info },
    ], [t]);

    return (
        <div className={cn(
            "h-screen bg-surface backdrop-blur-md border-r border-outline-variant/30 transition-all duration-300 flex flex-col",
            collapsed ? "w-16" : "w-64"
        )}>
            {/* Header */}
            <div className="p-4 flex items-center justify-between h-[65px]">
                {!collapsed && (
                    settings.theme === 'light' && settings.customLogoLight ? (
                        <CustomLogo key={settings.customLogoLight} path={settings.customLogoLight} className="h-8 object-contain" />
                    ) : settings.theme === 'dark' && settings.customLogoDark ? (
                        <CustomLogo key={settings.customLogoDark} path={settings.customLogoDark} className="h-8 object-contain" />
                    ) : (
                        <span className="font-bold text-lg text-on-surface/80 tracking-tight">Robot Runner</span>
                    )
                )}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="p-1 hover:bg-surface-variant/50 rounded-2xl text-on-surface-variant/80 hover:text-on-surface/80 transition-transform active:scale-95"
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
                            "w-full flex items-center p-2 rounded-2xl transition-all duration-200 active:scale-95 relative",
                            activePage === item.id
                                ? "bg-primary/10 text-primary shadow-primary/20"
                                : "text-on-surface-variant/80/80 hover:bg-surface-variant/50 hover:text-on-surface/80",
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
            <div className="p-4 mb-2.5">
                {!collapsed && <div className="text-[10px] flex justify-between items-center">
                    <span className="text-on-surface-variant/80 bg-surface-variant/20 px-1.5 py-0.5 rounded-2xl">v{appVersion}</span>
                    {updateAvailable && (
                        <button
                            onClick={() => onNavigate('about')}
                            className="text-error font-bold bg-error-container px-1.5 py-0.5 rounded-2xl hover:bg-error-container/80 transition-colors animate-pulse cursor-pointer"
                        >
                            {t('about.update_badge')}
                        </button>
                    )}
                </div>}
                {collapsed && <div className="text-[10px] flex justify-center items-center">
                    <span className="text-on-surface-variant/80 bg-surface-variant/20 px-1.5 py-0.5 rounded-2xl">v{appVersion}</span>
                </div>}
            </div>
        </div >
    );
}

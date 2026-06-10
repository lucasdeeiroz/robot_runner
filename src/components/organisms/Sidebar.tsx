import { useState, useEffect, useMemo } from 'react';
import {
    PlayCircle,
    Settings,
    Menu,
    FileText,
    Info,
    LayoutDashboard,
    Wrench,
    Home,
    LogOut,
    User as UserIcon,
    Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettings } from "@/lib/settings";
import { logEvent } from '@/lib/analytics';
import { motion, AnimatePresence } from 'framer-motion';

import { useTranslation } from "react-i18next";
import packageJson from '../../../package.json';
import { CustomLogo } from '../molecules/CustomLogo';
import { useDevices } from "@/lib/deviceStore";
import { useTestSessions } from "@/lib/testSessionStore";
import { useAuth } from '@/lib/authStore';

import { useRemoteConfig } from '@/lib/RemoteConfigProvider';
import { Button } from "@/components/atoms/Button";

interface SidebarProps {
    activePage: string;
    onNavigate: (page: string) => void;
}

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
    const { settings, updateInfo, updateSetting } = useSettings();
    const { sessions, appiumRunning } = useTestSessions();
    const { devices } = useDevices();
    const { user, signOut } = useAuth();
    const [collapsed, setCollapsed] = useState(false);
    const { t } = useTranslation();

    const adbRunning = devices.length > 0;

    const updateAvailable = updateInfo?.available || false;
    const appVersion = updateInfo?.currentVersion || packageJson.version;

    const versionParts = appVersion.match(/^(\d+\.\d+\.\d+)(?:-([a-zA-Z0-9]+))?$/);
    const displayVersion = versionParts ? versionParts[1] : appVersion;
    const stageTag = versionParts && versionParts[2] ? versionParts[2].toUpperCase() : null;

    const hasApiKey = useMemo(() => {
        const provider = settings.aiProvider || 'gemini';
        if (provider === 'gemini') return !!settings.geminiApiKey;
        if (provider === 'claude') return !!settings.claudeApiKey;
        if (provider === 'openai') return !!settings.openaiApiKey;
        if (provider === 'claude-code' || provider === 'antigravity-cli') return true;
        return false;
    }, [settings.aiProvider, settings.geminiApiKey, settings.claudeApiKey, settings.openaiApiKey]);

    const { isFeatureEnabled } = useRemoteConfig();
    const isAiEnabled = isFeatureEnabled('is_ai_analysis_enabled');
    const isAskRaiEnabled = isFeatureEnabled('is_ask_rai_enabled');

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
        { id: 'home', label: t('sidebar.home'), icon: Home },
        { id: 'run', label: t('sidebar.run'), icon: PlayCircle },
        {
            id: 'tests',
            label: settings.usageMode === 'explorer' ? t('sidebar.toolbox') : t('sidebar.tests'),
            icon: settings.usageMode === 'explorer' ? Wrench : FileText
        },
        { id: 'dashboard', label: t('sidebar.dashboard'), icon: LayoutDashboard }, // Dashboard Button
        { id: 'settings', label: t('sidebar.settings'), icon: Settings },
        { id: 'about', label: t('sidebar.about'), icon: Info },
    ], [t, settings.usageMode]);

    const handleAiChatToggle = () => {
        const newState = !settings.aiChatEnabled;
        updateSetting('aiChatEnabled', newState);
        if (newState && !collapsed) {
            setCollapsed(true);
        }
        logEvent(newState ? 'feature_opened' : 'feature_closed', { feature_name: 'ask_rai' });
    };

    return (
        <div className={cn(
            "h-full bg-surface backdrop-blur-md border-r border-outline-variant/30 transition-all duration-300 flex flex-col",
            collapsed ? "w-16" : "w-64"
        )}>
            {/* Header */}
            <div className="p-4 flex items-center justify-between h-16 shrink-0">
                <AnimatePresence>
                    {!collapsed && (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            transition={{ duration: 0.15 }}
                            className="flex-1"
                        >
                            {settings.theme === 'light' && settings.customLogoLight ? (
                                <CustomLogo key={settings.customLogoLight} path={settings.customLogoLight} className="h-8 object-contain" />
                            ) : settings.theme === 'dark' && settings.customLogoDark ? (
                                <CustomLogo key={settings.customLogoDark} path={settings.customLogoDark} className="h-8 object-contain" />
                            ) : (
                                <span className="font-bold text-lg text-on-surface/80 tracking-tight">Robot Runner</span>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
                <Button
                    onClick={() => setCollapsed(!collapsed)}
                    className="p-1 bg-transparent hover:bg-surface-variant/50 shadow-none hover:shadow-lg rounded-full text-on-surface-variant/80 hover:text-on-surface/80 transition-transform active:scale-95"
                >
                    <motion.div
                        animate={{ rotate: collapsed ? 0 : 180 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        className="flex items-center justify-center"
                    >
                        <Menu size={20} />
                    </motion.div>
                </Button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-2 space-y-1">
                {navItems.map((item) => (
                    <Button
                        key={item.id}
                        onClick={() => {
                            onNavigate(item.id);
                            logEvent('feature_opened', { feature_name: item.id });
                        }}
                        className={cn(
                            "group w-full flex items-center justify-start p-2 rounded-2xl transition-all duration-200 active:scale-95 relative",
                            activePage === item.id
                                ? "bg-primary/10 text-primary dark:text-primary/80 shadow-primary/20"
                                : "bg-transparent text-on-surface-variant/80 shadow-none hover:bg-surface-variant/50 hover:text-on-surface/80 hover:shadow-lg",
                            collapsed ? "justify-center" : "gap-3"
                        )}
                        data-tooltip={collapsed ? item.label : undefined}
                        data-position="right"
                    >
                        <div className="relative">
                            <item.icon size={20} />
                            {/* Status Indicators */}
                            {item.id === 'tests' && sessions.some(s => s.status === 'running') && (
                                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                </span>
                            )}

                            {/* ADB Indicator */}
                            {item.id === 'run' && adbRunning && (
                                <span className="absolute -top-1 -right-1 flex h-2 w-2 cursor-help" data-tooltip={t('sidebar.adb_active')} data-position="top">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                            )}

                            {/* Appium Indicator */}
                            {item.id === 'settings' && appiumRunning && (
                                <span className="absolute -top-1 -right-1 flex h-2 w-2 cursor-help" data-tooltip={t('sidebar.appium_active')} data-position="top">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                </span>
                            )}
                        </div>
                        <AnimatePresence>
                            {!collapsed && (
                                <motion.span
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -8 }}
                                    transition={{ duration: 0.15 }}
                                    className="font-medium whitespace-nowrap"
                                >
                                    {item.label}
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </Button>
                ))}
            </nav>

            {/* AI Chat Agent Button */}
            {hasApiKey && isAiEnabled && isAskRaiEnabled && (
                <div className="px-2 pb-2">
                    <Button
                        onClick={handleAiChatToggle}
                        className={cn(
                            "w-full flex items-center justify-start p-2 rounded-2xl transition-all duration-200 active:scale-95 relative group",
                            settings.aiChatEnabled
                                ? "bg-primary text-on-primary shadow-lg shadow-primary/30"
                                : "bg-surface-variant/30 text-primary hover:bg-primary/10 border border-primary/20",
                            collapsed ? "justify-center" : "gap-3"
                        )}
                        data-tooltip={collapsed ? "Ask RAI" : undefined}
                        data-position="right"
                    >
                        {/* Animated background effect with overflow-hidden boundary */}
                        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:animate-[shimmer_2s_infinite]" />
                        </div>

                        <Sparkles size={20} className={cn(settings.aiChatEnabled ? "animate-pulse" : "")} />

                        <AnimatePresence>
                            {!collapsed && (
                                <motion.span
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -8 }}
                                    transition={{ duration: 0.15 }}
                                    className="font-bold tracking-wide flex items-center gap-1 whitespace-nowrap"
                                >
                                    <span>Ask </span>
                                    <span className="rai-container">
                                        <span className="rai-letter-r">
                                            R
                                            <span className={cn("rai-letter-r-ghost", settings.aiChatEnabled ? "text-on-primary/60" : "text-primary/70")}>R</span>
                                        </span>
                                        <span>AI</span>
                                    </span>
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </Button>
                </div>
            )}

            {/* User Profile */}
            <div className="px-2 pb-2">
                <div
                    className={cn(
                        "group flex items-center gap-3 p-2 rounded-2xl bg-surface-variant/20 border border-outline-variant/30 relative shadow-lg",
                        collapsed ? "justify-center" : "px-3"
                    )}
                    data-tooltip={collapsed ? (user?.displayName || user?.email?.split('@')[0]) : undefined}
                    data-position="right"
                >
                    {user?.photoURL ? (
                        <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20" />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                            <UserIcon size={16} />
                        </div>
                    )}
                    <AnimatePresence>
                        {!collapsed && (
                            <motion.div
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -8 }}
                                transition={{ duration: 0.15 }}
                                className="flex-1 min-w-0 overflow-hidden"
                            >
                                <p className="text-xs font-bold text-on-surface truncate">{user?.displayName || user?.email?.split('@')[0]}</p>
                                <p className="text-[10px] text-on-surface-variant truncate">{user?.email}</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {!collapsed && (
                        <Button
                            onClick={signOut}
                            className="p-1.5 bg-transparent hover:bg-error/10 text-on-surface-variant hover:text-error shadow-none hover:shadow-lg rounded-xl transition-all active:scale-95"
                            data-tooltip={t('auth.logout')}
                            data-position="top"
                        >
                            <LogOut size={16} />
                        </Button>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="px-4 pb-2">
                {!collapsed && <div className="text-[10px] flex justify-between items-center gap-2">
                    <div className="flex items-center gap-1.5">
                        <span
                            onClick={() => onNavigate('about')}
                            className="flex items-center gap-2 text-on-surface-variant/80 bg-surface-variant/20 px-1.5 py-0.5 rounded-2xl cursor-pointer hover:bg-surface-variant/40 transition-colors select-none"
                        >
                            v{displayVersion}
                            {stageTag && (
                                <span className="text-[9px] font-bold tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded-xl uppercase border border-primary/20">
                                    {stageTag.replace(/([A-Z]+)(\d+)/i, '$1 $2')}
                                </span>
                            )}
                        </span>
                    </div>
                    {updateAvailable && (
                        <Button
                            onClick={() => onNavigate('about')}
                            className="text-error font-bold bg-error-container px-1.5 py-0.5 rounded-2xl hover:bg-error-container/80 transition-colors animate-pulse cursor-pointer shrink-0"
                        >
                            {t('about.update_badge')}
                        </Button>
                    )}
                </div>}
                {collapsed && <div className="text-[10px] flex flex-col gap-1 justify-center items-center">
                    <span
                        onClick={() => onNavigate('about')}
                        className="flex flex-col items-center text-on-surface-variant/80 bg-surface-variant/20 px-1.5 py-0.5 rounded-2xl cursor-pointer select-none"
                    >
                        v{displayVersion}
                        {stageTag && (
                            <span className="text-[8px] font-bold text-primary opacity-80 uppercase text-center w-full truncate px-1">
                                {stageTag}
                            </span>
                        )}
                    </span>
                </div>}
            </div>
        </div >
    );
}

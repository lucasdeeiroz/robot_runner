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
import { feedback } from '@/lib/feedback';
import { logEvent } from '@/lib/analytics';

import { useTranslation } from "react-i18next";
import packageJson from '../../../package.json';
import { CustomLogo } from '../molecules/CustomLogo';
import { useDevices } from "@/lib/deviceStore";
import { useTestSessions } from "@/lib/testSessionStore";
import { useAuth } from '@/lib/authStore';

import { useRemoteConfig } from '@/lib/RemoteConfigProvider';

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
    const [clickCount, setClickCount] = useState(0);
    const [lastClickTime, setLastClickTime] = useState(0);
    const { t } = useTranslation();

    const adbRunning = devices.length > 0;

    const updateAvailable = updateInfo?.available || false;
    const appVersion = updateInfo?.currentVersion || packageJson.version;

    const hasApiKey = useMemo(() => {
        const provider = settings.aiProvider || 'gemini';
        if (provider === 'gemini') return !!settings.geminiApiKey;
        if (provider === 'claude') return !!settings.claudeApiKey;
        if (provider === 'openai') return !!settings.openaiApiKey;
        if (provider === 'claude-code' || provider === 'gemini-code') return true;
        return false;
    }, [settings.aiProvider, settings.geminiApiKey, settings.claudeApiKey, settings.openaiApiKey]);

    const { getBool } = useRemoteConfig();
    const isAiEnabled = getBool('is_ai_analysis_enabled');
    const isAskRaiEnabled = getBool('is_ask_rai_enabled');

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

    const handleVersionClick = () => {
        const now = Date.now();
        if (now - lastClickTime < 500) { // Faster threshold: 500ms
            const newCount = clickCount + 1;
            if (newCount === 10) {
                const newState = !settings.presentationEnabled;
                updateSetting('presentationEnabled', newState);
                feedback.toast.info(newState ? 'presentation.activated' : 'presentation.deactivated');
                setClickCount(0);
            } else {
                setClickCount(newCount);
            }
        } else {
            setClickCount(1);
        }
        setLastClickTime(now);
    };

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
                        onClick={() => {
                            onNavigate(item.id);
                            logEvent('feature_opened', { feature_name: item.id });
                        }}
                        className={cn(
                            "w-full flex items-center p-2 rounded-2xl transition-all duration-200 active:scale-95 relative",
                            activePage === item.id
                                ? "bg-primary/10 text-primary dark:text-primary/80 shadow-primary/20"
                                : "text-on-surface-variant/80/80 hover:bg-surface-variant/50 hover:text-on-surface/80",
                            collapsed ? "justify-center" : "gap-3"
                        )}
                        title={collapsed ? item.label : undefined}
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
                                <span className="absolute -top-1 -right-1 flex h-2 w-2" title={t('sidebar.adb_active')}>
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                            )}

                            {/* Appium Indicator */}
                            {item.id === 'settings' && appiumRunning && (
                                <span className="absolute -top-1 -right-1 flex h-2 w-2" title={t('sidebar.appium_active')}>
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                </span>
                            )}
                        </div>
                        {!collapsed && <span className="font-medium">{item.label}</span>}
                    </button>
                ))}
            </nav>

            {/* AI Chat Agent Button */}
            {hasApiKey && isAiEnabled && isAskRaiEnabled && (
                <div className="px-2 pb-2">
                    <button
                        onClick={handleAiChatToggle}
                        className={cn(
                            "w-full flex items-center p-2 rounded-2xl transition-all duration-200 active:scale-95 relative overflow-hidden group",
                            settings.aiChatEnabled
                                ? "bg-primary text-on-primary shadow-lg shadow-primary/30"
                                : "bg-surface-variant/30 text-primary hover:bg-primary/10 border border-primary/20",
                            collapsed ? "justify-center" : "gap-3"
                        )}
                        title="Ask RAI"
                    >
                        {/* Animated background effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:animate-[shimmer_2s_infinite]" />

                        <Sparkles size={20} className={cn(settings.aiChatEnabled ? "animate-pulse" : "")} />

                        {!collapsed && (
                            <span className="font-bold tracking-wide flex items-center gap-1">
                                <span>Ask </span>
                                <span className="rai-container">
                                    <span className="rai-letter-r">
                                        R
                                        <span className={cn("rai-letter-r-ghost", settings.aiChatEnabled ? "text-on-primary/60" : "text-primary/70")}>R</span>
                                    </span>
                                    <span>AI</span>
                                </span>
                            </span>
                        )}
                    </button>
                </div>
            )}

            {/* User Profile */}
            <div className="px-2 pb-2">
                <div className={cn(
                    "flex items-center gap-3 p-2 rounded-2xl bg-surface-variant/20 border border-outline-variant/30",
                    collapsed ? "justify-center" : "px-3"
                )}>
                    {user?.photoURL ? (
                        <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20" />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                            <UserIcon size={16} />
                        </div>
                    )}
                    {!collapsed && (
                        <div className="flex-1 min-w-0 overflow-hidden">
                            <p className="text-xs font-bold text-on-surface truncate">{user?.displayName || user?.email?.split('@')[0]}</p>
                            <p className="text-[10px] text-on-surface-variant truncate">{user?.email}</p>
                        </div>
                    )}
                    {!collapsed && (
                        <button
                            onClick={signOut}
                            className="p-1.5 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-xl transition-all active:scale-95"
                            title={t('auth.logout')}
                        >
                            <LogOut size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="p-4 mb-2.5">
                {!collapsed && <div className="text-[10px] flex justify-between items-center">
                    <span
                        onClick={handleVersionClick}
                        className="text-on-surface-variant/80 bg-surface-variant/20 px-1.5 py-0.5 rounded-2xl cursor-pointer hover:bg-surface-variant/40 transition-colors select-none"
                    >
                        v{appVersion}
                    </span>
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
                    <span
                        onClick={handleVersionClick}
                        className="text-on-surface-variant/80 bg-surface-variant/20 px-1.5 py-0.5 rounded-2xl cursor-pointer select-none"
                    >
                        v{appVersion}
                    </span>
                </div>}
            </div>
        </div >
    );
}

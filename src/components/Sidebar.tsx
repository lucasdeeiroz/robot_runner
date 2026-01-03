
import { useState, useEffect } from 'react';
import {
    PlayCircle,
    Settings,
    Menu,
    FileText,
    Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettings } from "@/lib/settings";
import { readFile } from '@tauri-apps/plugin-fs';

import { useTranslation } from "react-i18next";

interface SidebarProps {
    activePage: string;
    onNavigate: (page: string) => void;
}

function CustomLogo({ path }: { path: string }) {
    const [src, setSrc] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        setSrc(null);
        setError(null);

        async function load() {
            try {
                if (!path) {
                    throw new Error("Empty path");
                }

                // If path is already a data URI (Base64), use it directly
                // This allows us to store the image data in settings and bypass fs permissions on restart
                if (path.startsWith('data:')) {
                    if (active) setSrc(path);
                    return;
                }

                // Try reading with the exact path first
                let data: Uint8Array | null = null;
                let lastError: any = null;

                try {
                    data = await readFile(path);
                } catch (e) {
                    lastError = e;
                    // If explicit path fails, try force-converting to Windows backslashes
                    // This often solves the "forbidden path" issue if scope expects backslashes
                    // but path has forward slashes (common in JS).
                    if (path.includes('/')) {
                        try {
                            const winPath = path.replace(/\//g, '\\');
                            console.log("Retrying with Windows path:", winPath);
                            data = await readFile(winPath);
                        } catch (e2) {
                            lastError = e2;
                        }
                    }
                }

                if (!data) throw lastError;

                // Convert to Base64
                const base64 = btoa(
                    new Uint8Array(data).reduce((data, byte) => data + String.fromCharCode(byte), '')
                );

                const ext = path.split('.').pop()?.toLowerCase();
                const mime = ext === 'svg' ? 'image/svg+xml' : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png';

                if (active) setSrc(`data:${mime};base64,${base64}`);
            } catch (e: any) {
                const msg = e instanceof Error ? e.message : String(e);
                console.error("Failed to load logo:", path, msg);
                // Simplify error message for UI but include path hint
                if (active) setError(`${msg} (${path})`);
            }
        }

        load();

        return () => { active = false; };
    }, [path]);

    if (error) return <span className="text-[10px] text-red-500 font-mono break-all px-2" title={error}>{error}</span>;
    if (!src) return <span className="text-xs text-zinc-500 animate-pulse px-2">Loading...</span>;
    return <img src={src} alt="Logo" className="h-8 object-contain" />;
}

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
    const { settings } = useSettings();
    const [collapsed, setCollapsed] = useState(false);
    const { t } = useTranslation();

    const navItems = [
        { id: 'run', label: t('sidebar.run'), icon: PlayCircle },
        { id: 'tests', label: t('sidebar.tests'), icon: FileText },
        { id: 'settings', label: t('sidebar.settings'), icon: Settings },
        { id: 'about', label: t('sidebar.about'), icon: Info },
    ];

    return (
        <div className={cn(
            "h-screen bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-r border-zinc-200 dark:border-zinc-800 transition-all duration-300 flex flex-col",
            collapsed ? "w-16" : "w-64"
        )}>
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 h-[65px]">
                {!collapsed && (
                    settings.theme === 'light' && settings.customLogoLight ? (
                        <CustomLogo key={settings.customLogoLight} path={settings.customLogoLight} />
                    ) : settings.theme === 'dark' && settings.customLogoDark ? (
                        <CustomLogo key={settings.customLogoDark} path={settings.customLogoDark} />
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
                            "w-full flex items-center p-2 rounded-xl transition-all duration-200 active:scale-95",
                            activePage === item.id
                                ? "bg-primary text-white shadow-md shadow-primary/20"
                                : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white",
                            collapsed ? "justify-center" : "gap-3"
                        )}
                        title={collapsed ? item.label : undefined}
                    >
                        <item.icon size={20} />
                        {!collapsed && <span className="font-medium">{item.label}</span>}
                    </button>
                ))}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                {!collapsed && <div className="text-xs text-zinc-500">v2.0.5</div>}
            </div>
        </div>
    );
}

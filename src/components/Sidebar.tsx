
import { useState } from 'react';
import {
    PlayCircle,
    Settings,
    Cpu,
    Menu,
    FileText,
    Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { useTranslation } from "react-i18next";

interface SidebarProps {
    activePage: string;
    onNavigate: (page: string) => void;
}

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
    const [collapsed, setCollapsed] = useState(false);
    const { t } = useTranslation();

    const navItems = [
        { id: 'run', label: t('sidebar.run'), icon: PlayCircle },
        { id: 'tests', label: t('sidebar.tests'), icon: FileText },
        { id: 'ai', label: t('sidebar.ai_assistant'), icon: Cpu },
        { id: 'settings', label: t('sidebar.settings'), icon: Settings },
        { id: 'about', label: t('sidebar.about'), icon: Info },
    ];

    return (
        <div className={cn(
            "h-screen bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-r border-zinc-200 dark:border-zinc-800 transition-all duration-300 flex flex-col",
            collapsed ? "w-16" : "w-64"
        )}>
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
                {!collapsed && <span className="font-bold text-lg text-gray-900 dark:text-white tracking-tight">Robot Runner</span>}
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
                {!collapsed && <div className="text-xs text-zinc-500">v2.0.2</div>}
            </div>
        </div>
    );
}

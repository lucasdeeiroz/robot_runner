
import { useState } from 'react';
import {
    PlayCircle,
    Settings,
    Smartphone,
    Box,
    Cpu,
    Menu,
    FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
    activePage: string;
    onNavigate: (page: string) => void;
}

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
    const [collapsed, setCollapsed] = useState(false);

    const navItems = [
        { id: 'run', label: 'Run', icon: PlayCircle },
        { id: 'devices', label: 'Devices', icon: Smartphone },
        { id: 'logs', label: 'Logs', icon: FileText },
        { id: 'inspector', label: 'Inspector', icon: Box },
        { id: 'ai', label: 'AI Assistant', icon: Cpu },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    return (
        <div className={cn(
            "h-screen bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 transition-all duration-300 flex flex-col",
            collapsed ? "w-16" : "w-64"
        )}>
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
                {!collapsed && <span className="font-bold text-lg text-gray-900 dark:text-white">Robot Runner</span>}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
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
                            "w-full flex items-center p-2 rounded-md transition-colors",
                            activePage === item.id
                                ? "bg-blue-600 text-white"
                                : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white",
                            collapsed ? "justify-center" : "gap-3"
                        )}
                        title={collapsed ? item.label : undefined}
                    >
                        <item.icon size={20} />
                        {!collapsed && <span>{item.label}</span>}
                    </button>
                ))}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                {!collapsed && <div className="text-xs text-zinc-500">v2.0.0-alpha</div>}
            </div>
        </div>
    );
}

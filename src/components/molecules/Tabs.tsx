import { twMerge } from 'tailwind-merge';
import { LucideIcon } from 'lucide-react';

export interface TabItem {
    id: string;
    label: string;
    icon?: LucideIcon;
    count?: number;
}

interface TabsProps {
    tabs: TabItem[];
    activeId: string;
    onChange: (id: string) => void;
    orientation?: 'horizontal' | 'vertical';
    variant?: 'underline' | 'pills' | 'cards';
    className?: string;
}

export const Tabs = ({
    tabs,
    activeId,
    onChange,
    orientation = 'horizontal',
    variant = 'underline',
    className
}: TabsProps) => {

    // styles based on variant
    const containerBase = orientation === 'horizontal'
        ? 'flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800'
        : 'flex flex-col gap-1';

    const pillContainer = 'flex p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg border border-zinc-200/50 dark:border-zinc-700/50';

    const itemBase = 'relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md cursor-pointer select-none';

    const activeStyles = {
        underline: 'text-primary border-b-2 border-primary rounded-none',
        pills: 'bg-white dark:bg-zinc-700 text-primary shadow-sm border border-zinc-200/50 dark:border-zinc-600/50',
        cards: 'bg-white dark:bg-zinc-800 text-primary border-zinc-200',
    };

    const inactiveStyles = {
        underline: 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-b-2 border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 rounded-none',
        pills: 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50',
        cards: 'text-zinc-500 hover:text-zinc-900',
    };

    return (
        <div className={twMerge(
            variant === 'underline' ? containerBase : pillContainer,
            orientation === 'vertical' ? "flex-col h-auto" : "items-center",
            orientation === 'vertical' && variant === 'underline' && "border-b-0 border-r",
            className
        )}>
            {tabs.map((tab) => {
                const isActive = activeId === tab.id;
                return (
                    <button
                        key={tab.id}
                        onClick={() => onChange(tab.id)}
                        className={twMerge(
                            itemBase,
                            // Only apply flex-1 for horizontal pills to spread them
                            variant === 'pills' && orientation === 'horizontal' && "flex-1 justify-center",
                            isActive ? activeStyles[variant] : inactiveStyles[variant],
                            // Vertical adjustments
                            orientation === 'vertical' && "justify-start w-full text-left",
                            // Remove rounded corners for underline vertical
                            variant === 'underline' && orientation === 'vertical' && "border-b-0 border-l-2 -ml-[1px]",
                        )}
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            {tab.icon && <tab.icon size={16} />}
                            {tab.label}
                            {tab.count !== undefined && (
                                <span className={twMerge(
                                    "ml-auto text-xs px-1.5 py-0.5 rounded-full",
                                    isActive
                                        ? (variant === 'pills' ? "bg-zinc-100 dark:bg-zinc-600" : "bg-primary/10 text-primary")
                                        : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                                )}>
                                    {tab.count}
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};

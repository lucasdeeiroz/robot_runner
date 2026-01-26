import { twMerge } from 'tailwind-merge';
import { LucideIcon, X } from 'lucide-react';

export interface TabItem {
    id: string;
    label: React.ReactNode;
    icon?: LucideIcon;
    count?: number;
    onClose?: () => void;
    selected?: boolean;
}

interface TabsProps {
    tabs: TabItem[];
    activeId: string;
    onChange: (id: string) => void;
    orientation?: 'horizontal' | 'vertical';
    variant?: 'underline' | 'pills' | 'cards';
    className?: string;
    transparent?: boolean;
}

export const Tabs = ({
    tabs,
    activeId,
    onChange,
    orientation = 'horizontal',
    variant = 'underline',
    className,
    transparent = false
}: TabsProps) => {

    // styles based on variant
    const containerBase = orientation === 'horizontal'
        ? 'flex items-center gap-1 border-b border-outline-variant'
        : 'flex flex-col gap-1';

    const pillContainer = 'flex p-1 bg-surface-variant/30 rounded-lg border border-outline-variant/30';

    const itemBase = 'relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md cursor-pointer select-none group whitespace-nowrap';

    const activeStyles = {
        underline: 'text-primary border-b-2 border-primary rounded-none',
        pills: 'bg-surface text-primary shadow-sm border border-outline-variant/30',
        cards: 'bg-surface text-primary border-outline',
    };

    const inactiveStyles = {
        underline: 'text-on-surface-variant/80 hover:text-on-surface/80 border-b-2 border-transparent hover:border-outline-variant/30 rounded-none',
        pills: 'text-on-surface-variant/80 hover:text-on-surface/80 hover:bg-surface-variant/50',
        cards: 'text-on-surface-variant/80 hover:text-on-surface/80',
    };

    return (
        <div className={twMerge(
            !transparent && (variant === 'underline' ? containerBase : pillContainer),
            transparent && (orientation === 'horizontal' ? 'flex items-center gap-1' : 'flex flex-col gap-1'),
            orientation === 'vertical' ? "flex-col h-auto" : "items-center",
            orientation === 'vertical' && variant === 'underline' && !transparent && "border-b-0 border-r",
            className
        )}>
            {tabs.map((tab) => {
                const isActive = tab.selected !== undefined ? tab.selected : activeId === tab.id;
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
                                        ? (variant === 'pills' ? "bg-surface-variant text-on-surface-variant/80" : "bg-primary-container text-on-primary-container")
                                        : "bg-surface-variant/50 text-on-surface-variant/80"
                                )}>
                                    {tab.count}
                                </span>
                            )}
                        </span>
                        {tab.onClose && (
                            <div
                                role="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    tab.onClose?.();
                                }}
                                className={twMerge(
                                    "ml-1 p-0.5 rounded-full transition-opacity hover:bg-surface-variant/50",
                                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                )}
                            >
                                <X size={14} className={isActive ? "text-primary" : "text-on-surface-variant"} />
                            </div>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

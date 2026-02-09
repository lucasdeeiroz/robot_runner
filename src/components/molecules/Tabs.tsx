import { twMerge } from 'tailwind-merge';
import { LucideIcon, X } from 'lucide-react';
import { motion } from 'framer-motion';

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
    layoutId?: string;
}

export const Tabs = ({
    tabs,
    activeId,
    onChange,
    orientation = 'horizontal',
    variant = 'underline',
    className,
    transparent = false,
    layoutId // New Prop
}: TabsProps) => {

    // styles based on variant
    const containerBase = orientation === 'horizontal'
        ? 'flex items-center gap-1 border-b border-outline-variant'
        : 'flex flex-col gap-1';

    const pillContainer = 'flex p-1 bg-surface-variant/30 rounded-2xl border border-outline-variant/30';

    const itemBase = 'relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl cursor-pointer select-none group whitespace-nowrap';

    // Revised active/inactive styles to rely on motion div for background
    const activeText = 'text-primary';
    const inactiveText = 'text-on-surface-variant/80 hover:text-on-surface/80';

    // Unique IDs for this instance
    const activeTabId = layoutId ? `${layoutId}-activeTab` : "activeTab";
    const activeUnderlineId = layoutId ? `${layoutId}-activeUnderline` : "activeUnderline";

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
                            // Only apply flex-1 for horizontal pills to spread them (Removed per user request for left-alignment)
                            // variant === 'pills' && orientation === 'horizontal' && "flex-1 justify-center", // OLD
                            variant === 'pills' && orientation === 'horizontal' && "justify-center",
                            isActive ? activeText : inactiveText,
                            // Vertical adjustments
                            orientation === 'vertical' && "justify-start w-full text-left",
                            // Remove rounded corners for underline vertical
                            variant === 'underline' && orientation === 'vertical' && "border-b-0 border-l-2 -ml-[1px]",
                        )}
                    >
                        {isActive && variant === 'pills' && (
                            <motion.div
                                layoutId={tab.selected !== undefined ? `${activeTabId}-${tab.id}` : activeTabId}
                                className="absolute inset-0 bg-surface rounded-2xl shadow-sm border border-outline-variant/30"
                                transition={{ type: "spring", duration: 0.5 }}
                            />
                        )}
                        {isActive && variant === 'underline' && (
                            <motion.div
                                layoutId={activeUnderlineId}
                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                                transition={{ type: "spring", duration: 0.5 }}
                            />
                        )}

                        <span className="relative z-10 flex items-center gap-2">
                            {tab.icon && <tab.icon size={16} />}
                            {tab.label}
                            {tab.count !== undefined && (
                                <span className={twMerge(
                                    "ml-auto text-xs px-1.5 py-0.5 rounded-2xl",
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
                                    "ml-1 p-0.5 rounded-2xl z-10 transition-opacity hover:bg-surface-variant/50",
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

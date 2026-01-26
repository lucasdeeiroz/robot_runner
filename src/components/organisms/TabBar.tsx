import React from 'react';
import { Tabs, TabItem } from '../molecules/Tabs';
import { twMerge } from 'tailwind-merge';

interface TabBarProps {
    tabs: TabItem[];
    activeId: string;
    onChange: (id: string) => void;
    menus?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
    orientation?: 'horizontal' | 'vertical';
    variant?: 'underline' | 'pills' | 'cards';
}

export const TabBar = ({ tabs, activeId, onChange, menus, actions, className, orientation = 'horizontal', variant = 'underline' }: TabBarProps) => {
    return (
        <div className={twMerge(
            'z-10 flex',
            // Default styling matches the "pills" container look
            'bg-surface-variant/30 border border-outline-variant/30 rounded-lg p-1',
            orientation === 'horizontal'
                ? 'items-center justify-between'
                : 'flex-col h-full gap-4 justify-between',
            className
        )}>
            <Tabs
                tabs={tabs}
                activeId={activeId}
                orientation={orientation}
                onChange={onChange}
                variant={variant}
                transparent={true} // Tabs is transparent because TabBar handles the container
                className={variant === 'underline' && orientation === 'horizontal' ? "border-b-0" : ""}
            />

            {(menus || actions) && (
                <div className={twMerge(
                    "flex gap-3",
                    orientation === 'horizontal' ? "items-center px-2" : "flex-col w-full"
                )}>
                    {menus && (
                        <div className={twMerge(
                            "flex",
                            orientation === 'horizontal' ? "items-center" : "flex-col w-full gap-2",
                        )}>
                            {menus}
                        </div>
                    )}
                    {actions && (
                        <div className={twMerge(
                            "flex",
                            orientation === 'horizontal' ? "items-center gap-2" : "flex-col w-full gap-2",
                        )}>
                            {actions}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

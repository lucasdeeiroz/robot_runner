import React from 'react';
import { Tabs, TabItem } from '../molecules/Tabs';
import { twMerge } from 'tailwind-merge';

interface TabBarProps {
    tabs: TabItem[];
    activeId: string;
    onChange: (id: string) => void;
    rightElement?: React.ReactNode;
    className?: string;
}

export const TabBar = ({ tabs, activeId, onChange, rightElement, className }: TabBarProps) => {
    return (
        <div className={twMerge(
            'sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-6',
            className
        )}>
            <Tabs
                tabs={tabs}
                activeId={activeId}
                onChange={onChange}
                variant="underline"
                className="border-b-0"
            />
            {rightElement && (
                <div className="flex items-center gap-2 py-2">
                    {rightElement}
                </div>
            )}
        </div>
    );
};

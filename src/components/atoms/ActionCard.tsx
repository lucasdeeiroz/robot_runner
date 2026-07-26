import React from 'react';
import clsx from 'clsx';
import { CheckCircle2 } from 'lucide-react';

export interface ActionCardProps {
    title: string;
    description: string;
    icon?: React.ReactNode;
    selected: boolean;
    onClick: () => void;
    orientation?: 'vertical' | 'horizontal';
    badge?: React.ReactNode;
    className?: string;
    centered?: boolean;
    children?: React.ReactNode;
}

export function ActionCard({
    title,
    description,
    icon,
    selected,
    onClick,
    orientation = 'vertical',
    badge,
    className,
    centered = false,
    children
}: ActionCardProps) {
    const isVertical = orientation === 'vertical';

    return (
        <div
            onClick={onClick}
            className={clsx(
                "relative rounded-2xl border-2 cursor-pointer transition-all hover:shadow-md h-full flex",
                isVertical ? "p-6 flex-col" : "p-4 items-center gap-4",
                isVertical && centered ? "items-center justify-center text-center" : "",
                selected
                    ? "bg-primary/5 border-primary"
                    : "bg-surface border-outline-variant/30 hover:bg-surface-variant/30",
                className
            )}
        >
            {selected && isVertical && (
                <div className="absolute top-4 right-4 text-primary dark:text-primary/80">
                    <CheckCircle2 size={24} />
                </div>
            )}
            
            {icon && (
                <div className={clsx(
                    "bg-primary/10 flex items-center justify-center text-primary dark:text-primary/80 flex-shrink-0",
                    isVertical ? "w-14 h-14 rounded-2xl mb-4" : "w-12 h-12 rounded-xl"
                )}>
                    {icon}
                </div>
            )}
            
            <div className={clsx(isVertical ? "flex flex-col h-full" : "flex-1")}>
                <div className={clsx("flex items-center gap-2 mb-1", isVertical ? "pr-8" : "", isVertical && centered ? "justify-center" : "")}>
                    <h3 className={clsx("font-bold text-on-surface", isVertical ? "text-lg" : "text-base")}>
                        {title}
                    </h3>
                    {badge && badge}
                </div>
                <p className={clsx("text-on-surface-variant/80", isVertical ? "text-sm" : "text-xs")}>
                    {description}
                </p>
                {children && <div className="mt-auto pt-4 w-full" onClick={e => e.stopPropagation()}>{children}</div>}
            </div>
            
            {selected && !isVertical && (
                <div className="text-primary">
                    <CheckCircle2 size={24} />
                </div>
            )}
        </div>
    );
}

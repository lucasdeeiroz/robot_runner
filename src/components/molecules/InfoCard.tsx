import clsx from "clsx";
import React from "react";

export interface InfoCardProps {
    title: React.ReactNode;
    children?: React.ReactNode;
    href?: string;
    className?: string;
    headerRight?: React.ReactNode;
    onClick?: () => void;
    titleClassName?: string;
    icon?: React.ReactNode;
    iconClassName?: string;
}

export function InfoCard({
    title,
    children,
    href,
    className,
    headerRight,
    onClick,
    titleClassName,
    icon,
    iconClassName
}: InfoCardProps) {
    const Component = href ? 'a' : 'div';
    const interactable = !!href || !!onClick;

    return (
        <Component
            href={href}
            onClick={onClick}
            target={href ? "_blank" : undefined}
            rel={href ? "noopener noreferrer" : undefined}
            className={clsx(
                "block bg-surface rounded-xl border border-outline-variant/30 p-3",
                "h-full transition-all group",
                interactable && "hover:bg-surface-variant/30 hover:scale-[1.02] cursor-pointer hover:border-primary/50",
                className
            )}
        >
            <div className="flex items-center gap-4">
                {icon && (
                    <div className={clsx("shrink-0", iconClassName)}>
                        {icon}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                        <div className={clsx("font-semibold text-sm text-on-surface/80 truncate pr-2", titleClassName)}>
                            {title}
                        </div>
                        {headerRight && (
                            <div className="text-on-surface-variant/80 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                {headerRight}
                            </div>
                        )}
                    </div>
                    <div className="text-xs text-on-surface-variant/80 leading-snug">
                        {children}
                    </div>
                </div>
            </div>
        </Component>
    );
}

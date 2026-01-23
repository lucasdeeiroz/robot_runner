import clsx from "clsx";
import React from "react";

interface InfoCardProps {
    title: React.ReactNode;
    children?: React.ReactNode;
    href?: string;
    className?: string;
    headerRight?: React.ReactNode;
    onClick?: () => void;
    titleClassName?: string;
}

export function InfoCard({
    title,
    children,
    href,
    className,
    headerRight,
    onClick,
    titleClassName
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
                "block bg-zinc-50 dark:bg-black/20 rounded-xl border border-zinc-200 dark:border-zinc-800/50 p-3",
                "flex flex-col justify-between group h-full transition-all",
                interactable && "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:scale-[1.02] cursor-pointer hover:border-primary/30",
                className
            )}
        >
            <div className="flex items-center justify-between mb-1">
                <div className={clsx("font-semibold text-sm text-gray-900 dark:text-zinc-200", titleClassName)}>
                    {title}
                </div>
                {headerRight && (
                    <div className="text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        {headerRight}
                    </div>
                )}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 leading-snug">
                {children}
            </div>
        </Component>
    );
}

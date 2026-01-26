import React from 'react';
import { LucideIcon } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { IconBox } from '@/components/atoms/IconBox';
import { Heading } from '@/components/atoms/Typography';

export interface SectionProps {
    title: string;
    description?: string;
    icon?: LucideIcon;
    status?: React.ReactNode;
    menus?: React.ReactNode;
    actions?: React.ReactNode;
    children?: React.ReactNode;
    variant?: 'card' | 'transparent';
    className?: string;
}

export const Section = ({
    title,
    description,
    icon,
    status,
    menus,
    actions,
    children,
    variant = 'card',
    className
}: SectionProps) => {

    const containerStyles = {
        card: 'bg-surface border border-outline-variant/30 rounded-xl p-6 shadow-sm',
        transparent: 'bg-transparent',
    };

    const hasHeaderRight = status || menus || actions;

    return (
        <section className={twMerge(containerStyles[variant], className)}>
            <div className={twMerge("flex flex-wrap items-center justify-between gap-4", children && "mb-6")}>
                {/* Header Left: Icon + Title + Description */}
                <div className="flex items-center gap-3">
                    {icon && <IconBox icon={icon} variant="primary" />}
                    <div>
                        <Heading level={4} className={!icon ? "ml-1" : ""}>{title}</Heading>
                        {description && (
                            <p className="text-sm text-on-surface/80 font-normal mt-0.5">{description}</p>
                        )}
                    </div>
                </div>

                {/* Header Right: Status | Menus | Buttons */}
                {hasHeaderRight && (
                    <div className="flex items-center gap-3">
                        {status && (
                            <>
                                <div className="flex items-center gap-2">{status}</div>
                                {(menus || actions) && <div className="h-4 w-px bg-outline-variant mx-1" />}
                            </>
                        )}

                        {menus && (
                            <>
                                <div className="flex items-center gap-2">{menus}</div>
                                {actions && <div className="h-4 w-px bg-outline-variant mx-1" />}
                            </>
                        )}

                        {actions && (
                            <div className="flex items-center gap-2">{actions}</div>
                        )}
                    </div>
                )}
            </div>

            {/* Content */}
            {children && (
                <div>
                    {children}
                </div>
            )}
        </section>
    );
};

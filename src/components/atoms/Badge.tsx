import React from 'react';
import { twMerge } from 'tailwind-merge';

interface BadgeProps {
    children: React.ReactNode;
    variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'outline';
    size?: 'sm' | 'md';
    className?: string;
}

export const Badge = ({ children, variant = 'neutral', size = 'md', className }: BadgeProps) => {
    const variants = {
        success: 'bg-success-container text-on-success-container border-transparent',
        warning: 'bg-warning-container text-on-warning-container border-transparent',
        error: 'bg-error-container text-on-error-container border-transparent',
        info: 'bg-info-container text-on-info-container border-transparent',
        neutral: 'bg-surface-variant text-on-surface-variant/80 border-transparent',
        outline: 'bg-transparent text-on-surface-variant/80 border-outline-variant',
    };

    const sizes = {
        sm: 'text-[10px] px-1.5 py-0.5',
        md: 'text-xs px-2.5 py-0.5',
    };

    return (
        <span className={twMerge(
            'inline-flex items-center justify-center rounded-2xl font-medium border',
            variants[variant],
            sizes[size],
            className
        )}>
            {children}
        </span>
    );
};

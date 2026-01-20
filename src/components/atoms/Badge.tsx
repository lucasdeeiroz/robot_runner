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
        success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-transparent',
        warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-transparent',
        error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-transparent',
        info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-transparent',
        neutral: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-transparent',
        outline: 'bg-transparent text-zinc-500 border-zinc-200 dark:border-zinc-700',
    };

    const sizes = {
        sm: 'text-[10px] px-1.5 py-0.5',
        md: 'text-xs px-2.5 py-0.5',
    };

    return (
        <span className={twMerge(
            'inline-flex items-center justify-center rounded-full font-medium border',
            variants[variant],
            sizes[size],
            className
        )}>
            {children}
        </span>
    );
};

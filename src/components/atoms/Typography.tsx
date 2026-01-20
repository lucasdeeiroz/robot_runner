import React from 'react';
import { twMerge } from 'tailwind-merge';

type HeadingProps = React.HTMLAttributes<HTMLHeadingElement> & {
    level?: 1 | 2 | 3 | 4 | 5 | 6;
    variant?: 'default' | 'muted' | 'gradient';
};

export const Heading = ({
    className,
    level = 1,
    variant = 'default',
    children,
    ...props
}: HeadingProps) => {
    const Component = `h${level}` as any;

    const sizes = {
        1: 'text-2xl font-bold tracking-tight',
        2: 'text-xl font-semibold tracking-tight',
        3: 'text-lg font-semibold',
        4: 'text-base font-semibold',
        5: 'text-sm font-semibold',
        6: 'text-xs font-semibold uppercase tracking-wider',
    };

    const variants = {
        default: 'text-zinc-900 dark:text-zinc-50',
        muted: 'text-zinc-500 dark:text-zinc-400',
        gradient: 'bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent',
    };

    return (
        <Component
            className={twMerge(sizes[level], variants[variant], className)}
            {...props}
        >
            {children}
        </Component>
    );
};

type TextProps = React.HTMLAttributes<HTMLElement> & {
    as?: 'p' | 'span' | 'div' | 'label';
    size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl';
    weight?: 'normal' | 'medium' | 'semibold' | 'bold';
    variant?: 'default' | 'muted' | 'success' | 'error' | 'warning';
};

export const Text = ({
    className,
    as: Component = 'p',
    size = 'base',
    weight = 'normal',
    variant = 'default',
    children,
    ...props
}: TextProps) => {
    const sizes = {
        xs: 'text-xs',
        sm: 'text-sm',
        base: 'text-base',
        lg: 'text-lg',
        xl: 'text-xl',
    };

    const weights = {
        normal: 'font-normal',
        medium: 'font-medium',
        semibold: 'font-semibold',
        bold: 'font-bold',
    };

    const variants = {
        default: 'text-zinc-700 dark:text-zinc-300',
        muted: 'text-zinc-500 dark:text-zinc-400',
        success: 'text-green-600 dark:text-green-400',
        error: 'text-red-600 dark:text-red-400',
        warning: 'text-amber-600 dark:text-amber-400',
    };

    return (
        <Component
            className={twMerge(sizes[size], weights[weight], variants[variant], className)}
            {...props}
        >
            {children}
        </Component>
    );
};

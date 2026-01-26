import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
    className,
    variant = 'primary',
    size = 'md',
    isLoading = false,
    leftIcon,
    rightIcon,
    children,
    disabled,
    ...props
}, ref) => {
    const variants = {
        primary: 'bg-primary/10 hover:bg-primary-container/80 text-primary shadow-sm border border-transparent',
        secondary: 'bg-surface text-on-surface/80 border border-outline-variant/30 hover:bg-surface-variant/50 shadow-sm',
        outline: 'bg-transparent border border-outline-variant/30 text-on-surface/80 hover:bg-surface-variant/30',
        ghost: 'bg-transparent text-on-surface-variant/80 hover:bg-surface-variant/30 hover:text-on-surface/80',
        danger: 'bg-error hover:bg-error/90 text-on-error shadow-sm border border-transparent',
    };

    const sizes = {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4 text-sm',
        lg: 'h-11 px-8 text-base',
        icon: 'h-9 w-9 p-0',
    };

    return (
        <button
            ref={ref}
            className={twMerge(
                'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 select-none',
                variants[variant],
                sizes[size],
                className
            )}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {!isLoading && leftIcon && <span className={clsx("mr-2", size === 'icon' && "mr-0")}>{leftIcon}</span>}
            {children}
            {!isLoading && rightIcon && <span className="ml-2">{rightIcon}</span>}
        </button>
    );
});

Button.displayName = 'Button';

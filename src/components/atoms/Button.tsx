import React, { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

import { HTMLMotionProps } from 'framer-motion';

export interface ButtonProps extends HTMLMotionProps<"button"> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'warning' | 'success' | 'link' | 'unstyled';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    children?: React.ReactNode;
    tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
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
    title,
    tooltipPosition = 'top',
    ...props
}, ref) => {
    const variants = {
        primary: 'bg-primary text-on-primary shadow-sm border border-transparent',
        secondary: 'bg-surface text-on-surface/80 border border-outline-variant/30 hover:bg-surface-variant/50 shadow-sm',
        outline: 'bg-transparent border border-outline-variant/30 text-on-surface/80 hover:bg-surface-variant/30',
        ghost: 'bg-transparent text-on-surface-variant/80 hover:bg-surface-variant/30 hover:text-on-surface/80',
        danger: 'bg-error text-on-error shadow-sm border border-transparent',
        warning: 'bg-warning text-on-warning shadow-sm border border-transparent',
        success: 'bg-success text-on-success shadow-sm border border-transparent',
        link: 'bg-transparent text-primary hover:underline shadow-none',
        unstyled: 'bg-transparent shadow-none p-0 h-auto',
    };

    const sizes = {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4 text-sm',
        lg: 'h-11 px-8 text-base',
        icon: 'h-9 w-9 p-0',
    };

    const noHoverEffectVariants = ['link', 'unstyled'];
    const solidVariants = ['primary', 'danger', 'warning', 'success'];

    const hoverProps = (!disabled && !isLoading && !noHoverEffectVariants.includes(variant))
        ? { scale: 1.02, filter: solidVariants.includes(variant) ? "brightness(1.1)" : "brightness(1)" }
        : undefined;

    const tapProps = (!disabled && !isLoading && !noHoverEffectVariants.includes(variant))
        ? { scale: 0.95 }
        : undefined;

    return (
        <motion.button
            ref={ref}
            whileHover={hoverProps}
            whileTap={tapProps}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className={twMerge(
                'inline-flex items-center justify-center rounded-2xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
                variants[variant],
                sizes[size],
                className
            )}
            disabled={disabled || isLoading}
            data-tooltip={title}
            data-position={tooltipPosition}
            {...props}
        >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {!isLoading && leftIcon && <span className={clsx("mr-2", size === 'icon' && "mr-0")}>{leftIcon}</span>}
            {children}
            {!isLoading && rightIcon && <span className="ml-2">{rightIcon}</span>}
        </motion.button>
    );
});

Button.displayName = 'Button';

import React, { InputHTMLAttributes, forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
    className,
    label,
    error,
    leftIcon,
    rightIcon,
    id,
    ...props
}, ref) => {
    const inputId = id || React.useId();

    return (
        <div className="w-full space-y-1.5">
            {label && (
                <label
                    htmlFor={inputId}
                    className="block text-sm font-medium text-on-surface-variant/80"
                >
                    {label}
                </label>
            )}
            <div className="relative">
                {leftIcon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/80">
                        {leftIcon}
                    </div>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    className={twMerge(
                        "w-full rounded-lg border border-outline-variant/30 bg-surface px-3 py-2 text-sm text-on-surface/80 placeholder:text-on-surface-variant/80/50",
                        "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        "transition-all duration-200",
                        leftIcon && "pl-10",
                        rightIcon && "pr-10",
                        error && "border-error focus:border-error focus:ring-error/20",
                        className
                    )}
                    {...props}
                />
                {rightIcon && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/80">
                        {rightIcon}
                    </div>
                )}
            </div>
            {error && (
                <p className="text-xs text-error animate-in slide-in-from-top-1 fade-in">
                    {error}
                </p>
            )}
        </div>
    );
});

Input.displayName = 'Input';

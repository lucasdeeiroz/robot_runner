import React, { TextareaHTMLAttributes, forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
    containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
    className,
    containerClassName,
    label,
    error,
    id,
    ...props
}, ref) => {
    const textareaId = id || React.useId();

    return (
        <div className={twMerge("w-full space-y-1.5", containerClassName)}>
            {label && (
                <label
                    htmlFor={textareaId}
                    className="block text-sm font-medium text-on-surface-variant/80"
                >
                    {label}
                </label>
            )}
            <textarea
                ref={ref}
                id={textareaId}
                className={twMerge(
                    "w-full rounded-2xl border border-outline-variant/30 bg-surface px-3 py-2 text-sm text-on-surface/80 placeholder:text-on-surface-variant/50",
                    "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    "transition-all duration-200 resize-none",
                    error && "border-error focus:border-error focus:ring-error/20",
                    className
                )}
                {...props}
            />
            {error && (
                <p className="text-xs text-error animate-in slide-in-from-top-1 fade-in">
                    {error}
                </p>
            )}
        </div>
    );
});

Textarea.displayName = 'Textarea';

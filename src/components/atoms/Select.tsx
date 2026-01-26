import React, { SelectHTMLAttributes, forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
    label: string;
    value: string | number;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    options: SelectOption[];
    error?: string;
    containerClassName?: string;
    leftIcon?: React.ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({
    className,
    label,
    options,
    error,
    id,
    containerClassName,
    leftIcon,
    ...props
}, ref) => {
    const selectId = id || React.useId();

    return (
        <div className={twMerge("w-full space-y-1.5", containerClassName)}>
            {label && (
                <label
                    htmlFor={selectId}
                    className="block text-sm font-medium text-on-surface-variant/80"
                >
                    {label}
                </label>
            )}
            <div className="relative">
                {leftIcon && (
                    <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/80">
                        {leftIcon}
                    </div>
                )}
                <select
                    ref={ref}
                    id={selectId}
                    className={twMerge(
                        "w-full appearance-none rounded-lg border border-outline-variant/30 bg-surface px-3 py-2 pr-10 text-sm text-on-surface/80",
                        "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/80",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        "transition-all duration-200",
                        leftIcon && "pl-9",
                        error && "border-error focus:border-error focus:ring-error/20",
                        className
                    )}
                    {...props}
                >
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/80">
                    <ChevronDown size={16} />
                </div>
            </div>
            {error && (
                <p className="text-xs text-error animate-in slide-in-from-top-1 fade-in">
                    {error}
                </p>
            )}
        </div>
    );
});

Select.displayName = 'Select';

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
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({
    className,
    label,
    options,
    error,
    id,
    containerClassName,
    ...props
}, ref) => {
    const selectId = id || React.useId();

    return (
        <div className={twMerge("w-full space-y-1.5", containerClassName)}>
            {label && (
                <label
                    htmlFor={selectId}
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                    {label}
                </label>
            )}
            <div className="relative">
                <select
                    ref={ref}
                    id={selectId}
                    className={twMerge(
                        "w-full appearance-none rounded-lg border border-zinc-200 bg-white px-3 py-2 pr-10 text-sm text-zinc-900",
                        "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500",
                        "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        "transition-all duration-200",
                        error && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
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
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
                    <ChevronDown size={16} />
                </div>
            </div>
            {error && (
                <p className="text-xs text-red-500 animate-in slide-in-from-top-1 fade-in">
                    {error}
                </p>
            )}
        </div>
    );
});

Select.displayName = 'Select';

import React from 'react';
import { twMerge } from 'tailwind-merge';

export interface SegmentedControlOption<T extends string | number> {
    label?: string;
    value: T;
    icon?: React.ReactNode;
}

interface SegmentedControlProps<T extends string | number> {
    options: SegmentedControlOption<T>[];
    value: T;
    onChange: (value: T) => void;
    className?: string;
    label?: string;
}

export function SegmentedControl<T extends string | number>({
    options,
    value,
    onChange,
    className,
    label
}: SegmentedControlProps<T>) {
    return (
        <div className={className}>
            {label && (
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    {label}
                </label>
            )}
            <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                {options.map((option) => {
                    const isSelected = option.value === value;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => onChange(option.value)}
                            className={twMerge(
                                "flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
                                isSelected
                                    ? "bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm"
                                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50"
                            )}
                            title={option.label}
                        >
                            {option.icon}
                            {option.label && <span>{option.label}</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

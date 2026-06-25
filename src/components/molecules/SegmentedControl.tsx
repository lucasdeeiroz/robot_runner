import { Button } from "@/components/atoms/Button";
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
                <label className="block text-sm font-medium text-on-surface-variant/80 mb-1.5">
                    {label}
                </label>
            )}
            <div className="flex bg-surface-variant/30 p-1 rounded-2xl">
                {options.map((option) => {
                    const isSelected = option.value === value;
                    return (
                            <Button
                                variant="unstyled"
                                key={option.value}
                                type="button"
                                onClick={() => onChange(option.value)}
                                className={twMerge(
                                    "flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-2xl text-sm font-medium transition-all duration-200",
                                    isSelected
                                        ? "bg-on-primary text-primary shadow-sm hover:bg-on-primary"
                                        : "text-on-surface-variant/80 hover:text-on-surface/80 hover:bg-outline-variant/50"
                                )}
                                title={option.label}
                            >
                            {option.icon}
                            {option.label && <span>{option.label}</span>}
                        </Button>
                    );
                })}
            </div>
        </div>
    );
}

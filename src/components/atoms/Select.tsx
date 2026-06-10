import React, { SelectHTMLAttributes, forwardRef, useState, useRef, useEffect } from 'react';
import { twMerge } from 'tailwind-merge';
import { ChevronDown, Check } from 'lucide-react';
import { Button } from "@/components/atoms/Button";

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
    value,
    onChange,
    disabled,
    ...props
}, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const selectId = id || React.useId();
    const dropdownRef = useRef<HTMLDivElement>(null);
    const selectRef = useRef<HTMLSelectElement>(null);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Synchronize ref
    const setRefs = (node: HTMLSelectElement | null) => {
        (selectRef as any).current = node;
        if (typeof ref === 'function') {
            ref(node);
        } else if (ref) {
            (ref as any).current = node;
        }
    };

    const currentValue = value !== undefined ? value : (selectRef.current?.value || "");
    const selectedOption = options.find(opt => String(opt.value) === String(currentValue)) || options[0];

    const handleSelect = (optionValue: string | number) => {
        if (disabled) return;

        if (selectRef.current) {
            selectRef.current.value = String(optionValue);
            // Dispatch a real change event to trigger React onChange
            const event = new Event('change', { bubbles: true });
            selectRef.current.dispatchEvent(event);
        }

        setIsOpen(false);
    };

    return (
        <div ref={dropdownRef} className={twMerge("w-full space-y-1.5 relative", containerClassName)}>
            {label && (
                <label
                    htmlFor={selectId}
                    className="block text-sm font-medium text-on-surface-variant/80"
                >
                    {label}
                </label>
            )}
            <div className="relative group">
                <Button
                    type="button"
                    disabled={disabled}
                    onClick={() => setIsOpen(!isOpen)}
                    className={twMerge(
                        "justify-start w-full text-left appearance-none rounded-2xl border border-outline-variant/20 bg-surface-variant/10 hover:bg-surface-variant/20 dark:bg-surface/10 dark:hover:bg-surface/20 px-4 py-2.5 pr-10 text-sm font-medium text-on-surface/90",
                        "focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        "transition-all duration-300 ease-in-out cursor-pointer flex items-center gap-2",
                        isOpen && "ring-4 ring-primary/10 border-primary",
                        leftIcon && "pl-10",
                        error && "border-error focus:border-error focus:ring-error/20",
                        className
                    )}
                >
                    {leftIcon && (
                        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/80">
                            {leftIcon}
                        </div>
                    )}
                    <span className="truncate">{selectedOption?.label || ""}</span>
                </Button>
                <div className={twMerge(
                    "pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/80 transition-transform duration-300",
                    isOpen && "rotate-180"
                )}>
                    <ChevronDown size={16} />
                </div>

                {/* Real hidden select element to maintain 100% native compatibility */}
                <select
                    ref={setRefs}
                    id={selectId}
                    value={value}
                    onChange={onChange}
                    disabled={disabled}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                    {...props}
                >
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>

                {/* Modern Custom Dropdown List with glassmorphic backdrop and soft animations */}
                {isOpen && (
                    <div className="absolute left-0 mt-2 min-w-full w-max max-w-xs md:max-w-md max-h-60 overflow-y-auto rounded-2xl border border-outline-variant/20 bg-surface/90 dark:bg-surface/95 backdrop-blur-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-200 origin-top scrollbar-thin scrollbar-thumb-outline-variant/30">
                        {options.map((option) => {
                            const isSelected = String(option.value) === String(currentValue);
                            return (
                                <Button
                                    variant="unstyled"
                                    key={option.value}
                                    type="button"
                                    onClick={() => handleSelect(option.value)}
                                    className={twMerge(
                                        "w-full text-left px-3.5 py-2.5 text-sm rounded-xl transition-all duration-200 flex items-center justify-between",
                                        isSelected
                                            ? "bg-primary/10 text-primary font-semibold"
                                            : "text-on-surface/80 hover:bg-surface-variant/40 hover:text-on-surface"
                                    )}
                                >
                                    <span className="truncate">{option.label}</span>
                                    {isSelected && <Check size={14} className="text-primary shrink-0 ml-2" />}
                                </Button>
                            );
                        })}
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

Select.displayName = 'Select';


import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { ChevronsUpDown, Check } from 'lucide-react';

interface ComboboxProps {
    label?: string;
    value: string;
    onChange: (value: string) => void;
    options: string[];
    placeholder?: string;
    triggerClassName?: string;
    className?: string;
    disabled?: boolean;
    required?: boolean;
}

export function Combobox({
    label,
    value,
    onChange,
    options,
    placeholder,
    className,
    triggerClassName,
    disabled = false,
    required = false
}: ComboboxProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState(value);
    const containerRef = useRef<HTMLDivElement>(null);

    // Filter options based on search term
    const filteredOptions = options.filter(option =>
        option.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Update search term when value prop changes (e.g. initial load or external update)
    useEffect(() => {
        setSearchTerm(value);
    }, [value]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                // When closing, if the search term matches an option exactly, ensure consistency?
                // Or just leave it as free text. The requirement allows creating new ones.
                // So whatever is typed is potentially valid.
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        onChange(e.target.value);
        setIsOpen(true);
    };

    const handleSelectOption = (option: string) => {
        setSearchTerm(option);
        onChange(option);
        setIsOpen(false);
    };

    return (
        <div className={clsx("relative", className)} ref={containerRef}>
            {label && (
                <label className="block text-xs font-medium text-on-surface-variant/80 mb-1">
                    {label} {required && <span className="text-error">*</span>}
                </label>
            )}
            <div className="relative">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={handleInputChange}
                    onFocus={() => setIsOpen(true)}
                    placeholder={placeholder}
                    disabled={disabled}
                    className={clsx(
                        "w-full bg-surface-variant/10 border border-outline-variant/30 rounded px-3 py-2 text-sm focus:border-primary focus:outline-none transition-colors pr-8",
                        disabled && "opacity-50 cursor-not-allowed",
                        triggerClassName
                    )}
                />
                <div
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant/50 cursor-pointer pointer-events-none"
                >
                    <ChevronsUpDown size={14} />
                </div>
            </div>

            {/* Dropdown Options */}
            {isOpen && filteredOptions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-surface border border-outline-variant/30 rounded-lg shadow-lg max-h-48 overflow-auto custom-scrollbar">
                    {filteredOptions.map((option) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => handleSelectOption(option)}
                            className={clsx(
                                "w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between group",
                                option === value
                                    ? "bg-primary/10 text-primary"
                                    : "text-on-surface/80 hover:bg-surface-variant/10"
                            )}
                        >
                            <span>{option}</span>
                            {option === value && <Check size={14} className="opacity-100" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

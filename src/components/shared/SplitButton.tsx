import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import { createPortal } from "react-dom";

interface SplitButtonAction {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    disabled?: boolean;
}

interface SplitButtonProps {
    primaryAction: SplitButtonAction;
    secondaryActions: SplitButtonAction[];
    className?: string;
    disabled?: boolean;
    variant?: 'primary' | 'danger' | 'secondary';
}

export function SplitButton({ primaryAction, secondaryActions, className, disabled, variant = 'primary' }: SplitButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node) &&
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            if (buttonRef.current) {
                const rect = buttonRef.current.getBoundingClientRect();
                setDropdownStyle({
                    top: rect.bottom + 4,
                    right: window.innerWidth - rect.right,
                    minWidth: 'max-content'
                });
            }
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen]);

    const baseStyles = "flex items-center justify-center transition-colors h-full";
    const variantStyles = {
        primary: "bg-primary text-white hover:bg-primary/90 disabled:bg-primary/50",
        danger: "bg-red-100 text-red-600 hover:bg-red-200 disabled:bg-red-50 disabled:text-red-300 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50",
        secondary: "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700"
    };

    // Border color logic for separator
    const separatorStyles = {
        primary: "border-l border-white/20",
        danger: "border-l border-red-200 dark:border-red-800/50",
        secondary: "border-l border-zinc-200 dark:border-zinc-700"
    };

    return (
        <div ref={containerRef} className={clsx("relative inline-flex rounded-md shadow-sm h-9", className)}>
            <button
                type="button"
                onClick={primaryAction.onClick}
                disabled={disabled || primaryAction.disabled}
                className={clsx(
                    baseStyles,
                    variantStyles[variant],
                    "px-3 rounded-l-md font-medium text-sm gap-2",
                    "disabled:cursor-not-allowed"
                )}
            >
                {primaryAction.icon}
                {primaryAction.label}
            </button>
            <button
                ref={buttonRef}
                type="button"
                className={clsx(
                    baseStyles,
                    variantStyles[variant],
                    "px-1.5 rounded-r-md",
                    separatorStyles[variant],
                    "disabled:cursor-not-allowed"
                )}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
            >
                <ChevronDown size={14} className={clsx("transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed z-50 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md shadow-lg py-1 min-w-[140px]"
                    style={dropdownStyle}
                >
                    {secondaryActions.map((action, idx) => (
                        <button
                            key={idx}
                            onClick={() => {
                                action.onClick();
                                setIsOpen(false);
                            }}
                            disabled={action.disabled}
                            className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 flex items-center gap-2 group transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                            {action.icon && <span className="text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300">{action.icon}</span>}
                            {action.label}
                        </button>
                    ))}
                </div>
                , document.body)}
        </div>
    );
}

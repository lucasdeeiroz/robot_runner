import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import { createPortal } from "react-dom";
import { Button } from "../atoms/Button";

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

    // Border color logic for separator

    // Border color logic for separator
    const separatorStyles = {
        primary: "border-l border-on-primary/20",
        danger: "border-l border-on-error-container/20",
        secondary: "border-l border-outline"
    };

    // Promotion Logic
    let effectivePrimary = primaryAction;
    let effectiveSecondaries = secondaryActions;

    // Only apply logic if the component itself is not globally disabled
    if (!disabled) {
        const allActions = [primaryAction, ...secondaryActions];
        const enabledActions = allActions.filter(a => !a.disabled);

        if (enabledActions.length > 0) {
            // Promote first enabled action to primary
            effectivePrimary = enabledActions[0];
            effectiveSecondaries = enabledActions.slice(1);
        } else {
            // All specific actions are disabled, keep original structure but effectivePrimary will be disabled via its prop
        }
    }

    const showDropdown = effectiveSecondaries.length > 0;

    return (
        <div ref={containerRef} className={clsx("relative inline-flex rounded-2xl shadow-sm h-9", className)}>
            <Button
                type="button"
                onClick={effectivePrimary.onClick}
                disabled={disabled || effectivePrimary.disabled}
                variant={variant}
                className={clsx(
                    "rounded-none h-9", // Override rounded to handle group
                    showDropdown ? "rounded-l-2xl" : "rounded-2xl",
                    "border-r-0"
                )}
                leftIcon={effectivePrimary.icon}
            >
                {effectivePrimary.label}
            </Button>
            {showDropdown && (
                <Button
                    ref={buttonRef}
                    type="button"
                    variant={variant}
                    className={clsx(
                        "rounded-none h-9 px-1.5",
                        "rounded-r-2xl",
                        separatorStyles[variant]
                    )}
                    onClick={() => !disabled && setIsOpen(!isOpen)}
                    disabled={disabled}
                >
                    <ChevronDown size={14} className={clsx("transition-transform", isOpen && "rotate-180")} />
                </Button>
            )}

            {isOpen && showDropdown && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed z-50 bg-surface border border-outline-variant/30 rounded-2xl shadow-lg py-1 min-w-[140px]"
                    style={dropdownStyle}
                >
                    {effectiveSecondaries.map((action, idx) => (
                        <button
                            key={idx}
                            onClick={() => {
                                action.onClick();
                                setIsOpen(false);
                            }}
                            disabled={action.disabled}
                            className="w-full text-left px-3 py-2 text-sm text-on-surface/80 hover:bg-surface-variant/50 flex items-center gap-2 group transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                            {action.icon && <span className="text-on-surface-variant/80 group-hover:text-on-surface/80">{action.icon}</span>}
                            {action.label}
                        </button>
                    ))}
                </div>
                , document.body)}
        </div>
    );
}

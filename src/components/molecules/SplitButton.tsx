import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import { createPortal } from "react-dom";

import { AnimatePresence, motion } from "framer-motion";

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
                    minWidth: Math.max(containerRef.current?.offsetWidth || 0, 140)
                });
            }
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen]);

    // Separator line color logic - lighter and more subtle
    const separatorStyles = {
        primary: "bg-on-primary/20",
        danger: "bg-on-error/20",
        secondary: "bg-outline-variant"
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
        }
    }

    const showDropdown = effectiveSecondaries.length > 0;

    return (
        <div ref={containerRef} className={clsx("relative inline-flex h-9", className)}>
            <div className={clsx(
                "flex items-center rounded-2xl shadow-sm transition-all duration-200",
                "group focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-1",
                variant === 'primary' && "bg-primary text-on-primary hover:shadow-md",
                variant === 'danger' && "bg-error text-on-error hover:shadow-md",
                variant === 'secondary' && "bg-surface-variant/50 text-on-surface hover:bg-surface-variant border border-outline-variant/30"
            )}>
                <button
                    type="button"
                    onClick={effectivePrimary.onClick}
                    disabled={disabled || effectivePrimary.disabled}
                    className={clsx(
                        "h-full px-4 text-sm font-medium flex items-center gap-2 rounded-l-2xl outline-none",
                        showDropdown ? "pr-2" : "rounded-r-2xl pr-4",
                        disabled && "opacity-50 cursor-not-allowed"
                    )}
                >
                    {effectivePrimary.icon && <span>{effectivePrimary.icon}</span>}
                    {effectivePrimary.label}
                </button>

                {showDropdown && (
                    <>
                        {/* Separator Line */}
                        <div className={clsx("w-[1px] h-5 self-center", separatorStyles[variant], disabled && "opacity-30")} />

                        <button
                            ref={buttonRef}
                            type="button"
                            onClick={() => !disabled && setIsOpen(!isOpen)}
                            disabled={disabled}
                            className={clsx(
                                "h-full pl-1.5 pr-2 rounded-r-2xl flex items-center justify-center outline-none",
                                disabled && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            <ChevronDown size={16} className={clsx("transition-transform duration-300", isOpen && "rotate-180")} />
                        </button>
                    </>
                )}
            </div>

            {showDropdown && createPortal(
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            ref={dropdownRef}
                            initial={{ opacity: 0, y: -8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.98 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="fixed z-50 bg-surface border border-outline-variant/30 rounded-2xl shadow-lg py-1.5 overflow-hidden"
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
                                    className="w-full text-left px-4 py-2 text-sm text-on-surface/90 hover:bg-primary/5 active:bg-primary/10 flex items-center gap-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {action.icon && <span className="text-on-surface-variant">{action.icon}</span>}
                                    {action.label}
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
                , document.body)}
        </div>
    );
}

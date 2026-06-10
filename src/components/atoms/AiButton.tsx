import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Sparkles, ChevronDown, PenLine } from 'lucide-react';
import { useSettings } from '@/lib/settings';
import { Button, ButtonProps } from "@/components/atoms/Button";
import { ExpressiveLoading } from './ExpressiveLoading';
import { Modal } from '../organisms/Modal';
import { Textarea } from './Textarea';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

import { useRemoteConfig } from '@/lib/RemoteConfigProvider';

interface AiButtonProps extends Omit<ButtonProps, 'leftIcon' | 'children' | 'onClick'> {
    id?: string;
    label?: string;
    expandable?: boolean;
    showTextAlways?: boolean;
    allowCustomPrompt?: boolean;
    alwaysOpenModal?: boolean;
    requireCustomPrompt?: boolean;
    onClick?: (e: React.MouseEvent<HTMLButtonElement>, customPrompt?: string) => void | Promise<void>;
}

export const AiButton: React.FC<AiButtonProps> = ({
    id,
    label,
    isLoading,
    expandable = true,
    showTextAlways = false,
    allowCustomPrompt = true,
    alwaysOpenModal = false,
    requireCustomPrompt = false,
    className,
    variant = 'primary',
    onClick,
    ...props
}) => {
    const { settings } = useSettings();
    const { t } = useTranslation();
    const [isHovered, setIsHovered] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const storageKey = useMemo(() => {
        return id ? `robot_runner_ai_prompt_${id}` : "robot_runner_ai_prompt";
    }, [id]);

    const [customPrompt, setCustomPrompt] = useState(() => {
        return localStorage.getItem(storageKey) || "";
    });

    useEffect(() => {
        const handleStorage = () => {
            setCustomPrompt(localStorage.getItem(storageKey) || "");
        };
        const customEventName = id ? `robot_runner_ai_prompt_changed_${id}` : "robot_runner_ai_prompt_changed";

        window.addEventListener("storage", handleStorage);
        window.addEventListener(customEventName, handleStorage);
        return () => {
            window.removeEventListener("storage", handleStorage);
            window.removeEventListener(customEventName, handleStorage);
        };
    }, [storageKey, id]);

    const saveCustomPrompt = (promptContent: string) => {
        localStorage.setItem(storageKey, promptContent);
        const customEventName = id ? `robot_runner_ai_prompt_changed_${id}` : "robot_runner_ai_prompt_changed";
        window.dispatchEvent(new Event(customEventName));
    };

    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const secondaryButtonRef = useRef<HTMLButtonElement>(null);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

    // Visibility Check
    const hasApiKey = useMemo(() => {
        const provider = settings.aiProvider || 'gemini';
        if (provider === 'gemini') return !!settings.geminiApiKey;
        if (provider === 'claude') return !!settings.claudeApiKey;
        if (provider === 'openai') return !!settings.openaiApiKey;
        // CLI providers handle their own authentication, so we treat them as always "having" a key for visibility purposes
        if (provider === 'claude-code' || provider === 'antigravity-cli') return true;
        return false;
    }, [settings.aiProvider, settings.geminiApiKey, settings.claudeApiKey, settings.openaiApiKey]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node) &&
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setIsDropdownOpen(false);
            }
        };

        if (isDropdownOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            if (secondaryButtonRef.current) {
                const rect = secondaryButtonRef.current.getBoundingClientRect();
                setDropdownStyle({
                    top: rect.bottom + 4,
                    right: window.innerWidth - rect.right,
                    minWidth: Math.max((containerRef.current?.offsetWidth || 0) + 40, 180)
                });
            }
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isDropdownOpen]);

    const remoteConfig = useRemoteConfig();
    const isAiEnabled = (remoteConfig as any)?.isFeatureEnabled?.('is_ai_analysis_enabled') ?? true;

    // If AI is disabled via remote config, we hide.
    if (!hasApiKey || !isAiEnabled) return null;

    const isTooltipNeeded = !showTextAlways && (!expandable || !isHovered);
    const isExpanded = showTextAlways || (expandable && isHovered) || isDropdownOpen;
    const showSplitLayout = isExpanded && allowCustomPrompt;

    const handlePrimaryClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (alwaysOpenModal && !isLoading) {
            setIsModalOpen(true);
        } else if (onClick) {
            onClick(e, customPrompt);
        }
    };

    const separatorStyles = {
        primary: "bg-on-primary/20",
        danger: "bg-on-error/20",
        secondary: "bg-outline-variant",
        ghost: "bg-outline-variant/30",
        outline: "bg-outline-variant/30",
        warning: "bg-on-warning-container/20",
        success: "bg-emerald-500/20"
    };

    const sizeHeights: Record<string, string> = {
        sm: 'h-8',
        md: 'h-9',
        lg: 'h-11',
        icon: 'h-9',
    };
    const heightClass = sizeHeights[props.size || 'md'] || 'h-9';

    return (
        <>
            <div
                ref={containerRef}
                className={twMerge(
                    "relative inline-flex items-stretch rounded-2xl group transition-all duration-300",
                    "focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-1 ",
                    variant === 'primary' && "bg-primary/10 hover:bg-secondary-container shadow-none border-transparent",
                    variant === 'secondary' && "bg-surface hover:bg-surface-variant/50 shadow-none border-transparent",
                    variant === 'danger' && "bg-error hover:bg-error/90 shadow-none border-transparent",
                    variant === 'warning' && "bg-warning-container/20 hover:bg-warning-container/40 shadow-none border-transparent",
                    variant === 'success' && "bg-emerald-500/10 hover:bg-emerald-500/20 shadow-none border-transparent",
                    variant === 'outline' && "bg-transparent hover:bg-surface-variant/30 text-on-surface/80 border border-outline-variant/30 shadow-none",
                    variant === 'ghost' && "bg-transparent hover:bg-surface-variant/30 text-on-surface-variant/80 border-transparent shadow-none",
                    heightClass,
                    className
                )}
                onMouseEnter={() => !isLoading && setIsHovered(true)}
                onMouseLeave={() => !isLoading && setIsHovered(false)}
            >
                <Button
                    variant={variant}
                    title={isTooltipNeeded ? (props.title || label) : props.title}
                    className={clsx(
                        "relative overflow-hidden transition-all duration-300 flex items-center justify-center text-[10px] shadow-none border-transparent",
                        showSplitLayout ? "rounded-l-2xl rounded-r-none pr-3" : "rounded-2xl rounded-r-2xl",
                        expandable && !showTextAlways ? (isExpanded ? "px-4" : "aspect-square px-0") : "",
                        "focus-visible:ring-0 min-w-0 !h-full !min-h-0",
                        !showSplitLayout && "shadow-none" // Avoid double shadow
                    )}
                    // Only force transparent if we show split layout (shared background)
                    style={showSplitLayout ? { backgroundColor: 'transparent', border: 'none' } : {}}
                    isLoading={false}
                    onClick={handlePrimaryClick}
                    {...props}
                >
                    <div className="flex items-center gap-0 overflow-hidden shadow-none border-transparent bg-transparent">
                        <div className="shrink-0 flex items-center justify-center">
                            {isLoading ? (
                                <ExpressiveLoading size="xsm" variant="circular" />
                            ) : (
                                <Sparkles
                                    size={16}
                                    className={clsx(
                                        "transition-transform duration-500",
                                        isExpanded && "rotate-12 scale-110"
                                    )}
                                />
                            )}
                        </div>

                        <AnimatePresence>
                            {isExpanded && (
                                <motion.span
                                    initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                                    animate={{ width: 'auto', opacity: 1, marginLeft: 8 }}
                                    exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                                    transition={{ duration: 0.2, ease: "easeInOut" }}
                                    className="whitespace-nowrap font-bold uppercase tracking-tight select-none overflow-hidden"
                                >
                                    {label}
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </div>
                </Button>

                <AnimatePresence>
                    {showSplitLayout && (
                        <motion.div
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 'auto', opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            className="flex items-stretch shrink-0"
                        >
                            {/* Separator */}
                            <div className={clsx("w-[1px] h-5 self-center mx-[1px]", separatorStyles[variant])} />

                            <Button
                                ref={secondaryButtonRef}
                                variant={variant}
                                className={clsx(
                                    "rounded-l-none rounded-r-2xl px-1.5 focus-visible:ring-0 !border-0 bg-transparent",
                                    "!h-full !min-h-0 shadow-none border-transparent"
                                )}
                                style={{ backgroundColor: 'transparent' }}
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                disabled={props.disabled || isLoading}
                            >
                                <ChevronDown
                                    size={14}
                                    className={clsx("transition-transform duration-300", isDropdownOpen && "rotate-180")}
                                />
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>


            {/* Dropdown Menu */}
            {isDropdownOpen && createPortal(
                <AnimatePresence>
                    {isDropdownOpen && (
                        <motion.div
                            ref={dropdownRef}
                            initial={{ opacity: 0, y: -8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.98 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="fixed z-[200000] bg-surface border border-outline-variant/30 rounded-2xl shadow-lg py-1.5 overflow-hidden"
                            style={dropdownStyle}
                        >
                            <Button
                                onClick={() => {
                                    setIsDropdownOpen(false);
                                    setIsModalOpen(true);
                                }}
                                className="w-full justify-start text-left px-2 py-2 bg-transparent hover:bg-primary/5 active:bg-primary/10 shadow-none rounded-none flex items-center gap-2.5 transition-colors"
                            >
                                <PenLine size={16} className="text-on-surface-variant flex-shrink-0" />
                                <div className="flex flex-col">
                                    <span className="font-medium text-on-surface-variant">{t('components.ai_button.customize_prompt')}</span>
                                    {customPrompt && (
                                        <span className="text-[10px] text-primary truncate max-w-[150px]">
                                            {t('components.ai_button.custom_rule_active')}
                                        </span>
                                    )}
                                </div>
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
                , document.body)}

            {/* Custom Prompt Modal */}
            <Modal
                title={t('components.ai_button.customize_prompt')}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                className="max-w-xl"
            >
                <div className="p-6">
                    <p className="text-sm text-on-surface-variant mb-4">
                        {t('components.ai_button.customize_description')}
                    </p>

                    <Textarea
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder={t('components.ai_button.customize_placeholder')}
                        className="w-full min-h-[140px] text-sm resize-none"
                    />

                    <div className="flex justify-between items-center mt-6">
                        <Button
                            variant="ghost"
                            className="text-on-surface-variant hover:text-error"
                            onClick={() => {
                                setCustomPrompt("");
                                saveCustomPrompt("");
                            }}
                            title={t('components.ai_button.reset_prompt')}
                        >
                            {t('components.ai_button.clear')}
                        </Button>
                        <div className="flex gap-3">
                            <Button variant="ghost" onClick={() => {
                                setIsModalOpen(false);
                                setCustomPrompt(localStorage.getItem(storageKey) || "");
                            }}>
                                {t('common.cancel')}
                            </Button>
                            <Button
                                variant="primary"
                                disabled={requireCustomPrompt && !customPrompt.trim()}
                                onClick={(e) => {
                                    setIsModalOpen(false);
                                    saveCustomPrompt(customPrompt);
                                    if (onClick) {
                                        onClick(e as any, customPrompt);
                                    }
                                }}
                            >
                                {customPrompt ? t('common.save_and_run') : t('common.run')}
                            </Button>
                        </div>
                    </div>
                </div>
            </Modal>
        </>
    );
};

import React, { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useSettings } from '@/lib/settings';
import { Button, ButtonProps } from './Button';
import { ExpressiveLoading } from './ExpressiveLoading';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

interface AiButtonProps extends Omit<ButtonProps, 'leftIcon' | 'children'> {
    label?: string;
    expandable?: boolean;
    showTextAlways?: boolean;
}

export const AiButton: React.FC<AiButtonProps> = ({
    label,
    isLoading,
    expandable = true,
    showTextAlways = false,
    className,
    variant = 'primary',
    ...props
}) => {
    const { settings } = useSettings();
    const [isHovered, setIsHovered] = useState(false);

    // Visibility Check: Only show if an API key for the selected provider is set
    const hasApiKey = useMemo(() => {
        const provider = settings.aiProvider || 'gemini';
        if (provider === 'gemini') return !!settings.geminiApiKey;
        if (provider === 'claude') return !!settings.claudeApiKey;
        if (provider === 'openai') return !!settings.openaiApiKey;
        return false;
    }, [settings.aiProvider, settings.geminiApiKey, settings.claudeApiKey, settings.openaiApiKey]);

    if (!hasApiKey) return null;

    const isTooltipNeeded = !showTextAlways && (!expandable || !isHovered);

    return (
        <Button
            variant={variant}
            title={isTooltipNeeded ? (props.title || label) : props.title}
            className={clsx(
                "group relative overflow-hidden transition-all duration-300 flex items-center justify-center text-[10px]",
                expandable && !showTextAlways ? (isHovered ? "px-4" : "w-9 px-0") : "",
                className
            )}
            isLoading={false}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            {...props}
        >
            <div className="flex items-center gap-0">
                <div className="shrink-0 flex items-center justify-center">
                    {isLoading ? (
                        <ExpressiveLoading size="xsm" variant="circular" />
                    ) : (
                        <Sparkles
                            size={16}
                            className={clsx(
                                "transition-transform duration-500",
                                isHovered && "rotate-12 scale-110"
                            )}
                        />
                    )}
                </div>

                <AnimatePresence>
                    {(showTextAlways || (expandable && isHovered)) && (
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
    );
};

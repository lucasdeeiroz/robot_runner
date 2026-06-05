import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Sparkles, Copy, Check, ShieldAlert, ChevronRight, ChevronDown, X, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { ExpressiveLoading } from '../atoms/ExpressiveLoading';
import { useTranslation } from 'react-i18next';

interface AiResponseProps {
    title?: string;
    responseTitle?: string;
    response?: string | null;
    rationale?: string | null;
    rationaleHeader?: string;
    error?: string | null;
    isLoading?: boolean;
    onCopy?: (text: string) => void;
    onClose?: () => void;
    onRetry?: () => void;
    className?: string;
    variant?: 'primary' | 'error';
}

export const AiResponse: React.FC<AiResponseProps> = React.memo(({
    title,
    responseTitle,
    response,
    rationale,
    rationaleHeader,
    error,
    isLoading,
    onCopy,
    onClose,
    onRetry,
    className,
    variant = 'primary'
}) => {
    const { t } = useTranslation();
    const [copiedResponse, setCopiedResponse] = React.useState(false);
    const [copiedRationale, setCopiedRationale] = React.useState(false);
    const [isCollapsed, setIsCollapsed] = React.useState(false);

    React.useEffect(() => {
        if (isLoading) {
            setIsCollapsed(false);
        }
    }, [isLoading]);

    const handleCopyResponse = () => {
        if (response) {
            if (onCopy) {
                onCopy(response);
            } else {
                navigator.clipboard.writeText(response);
            }
            setCopiedResponse(true);
            setTimeout(() => setCopiedResponse(false), 2000);
        }
    };

    const handleCopyRationale = () => {
        if (rationale) {
            navigator.clipboard.writeText(rationale);
            setCopiedRationale(true);
            setTimeout(() => setCopiedRationale(false), 2000);
        }
    };

    if (!isLoading && !response && !error && !rationale) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className={clsx(
                    "p-4 border rounded-2xl relative overflow-hidden group transition-all duration-500",
                    variant === 'error' || error ? "bg-error/5 border-error/20 shadow-lg shadow-error/5" : "bg-primary/5 border-primary/20 shadow-lg shadow-primary/5",
                    className
                )}
            >
                {/* Background Icon Watermark */}
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                    {error ? <ShieldAlert size={64} className="text-error" /> : <Sparkles size={64} className="text-primary" />}
                </div>

                <div className="relative z-10 space-y-4">
                    {/* Header */}
                    <div
                        className="flex items-center justify-between cursor-pointer group/header"
                        onClick={() => setIsCollapsed(!isCollapsed)}
                    >
                        <div className={clsx("flex items-center gap-2", error ? "text-error" : "text-primary")}>
                            <div className={clsx("p-1.5 rounded-lg", error ? "bg-error/10" : "bg-primary/10")}>
                                {error ? <ShieldAlert size={16} /> : <Sparkles size={16} />}
                            </div>
                            {title && (
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">
                                    {title}
                                </h4>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            {onRetry && !isLoading && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onRetry(); }}
                                    className="p-1 text-primary/40 hover:text-primary transition-colors hover:bg-primary/10 rounded"
                                    title={t('common.try_again')}
                                >
                                    <RotateCcw size={14} />
                                </button>
                            )}
                            <button className="p-1 text-primary/40 group-hover/header:text-primary transition-colors hover:bg-primary/10 rounded">
                                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                            </button>
                            {onClose && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                                    className="p-1 text-primary/40 hover:text-error transition-colors hover:bg-error/10 rounded"
                                    title={t('common.close')}
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    </div>

                    <AnimatePresence initial={false}>
                        {!isCollapsed && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                className="overflow-hidden"
                            >
                                <div className="space-y-4 pt-1">
                                    {isLoading ? (
                                        <div className="flex flex-col items-center justify-center py-8 text-primary/60">
                                            <ExpressiveLoading size="md" variant="circular" />
                                        </div>
                                    ) : error ? (
                                        <div className="font-mono text-[11px] text-error/80 break-all max-h-48 overflow-y-auto pr-2 custom-scrollbar leading-relaxed bg-error/5 p-3 rounded-xl border border-error/10">
                                            {error}
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {response && (
                                                <div className={clsx(
                                                    "bg-surface/60 p-4 rounded-xl border relative shadow-sm",
                                                    variant === 'error' ? "border-error/20" : "border-primary/20"
                                                )}>
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="text-[9px] font-black text-primary/60 uppercase tracking-widest block">
                                                            {responseTitle}
                                                        </span>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleCopyResponse(); }}
                                                            className="p-1.5 hover:bg-primary/10 rounded-lg text-primary transition-all opacity-40 hover:opacity-100"
                                                            title={t("mapper.action.copy_result")}
                                                        >
                                                            {copiedResponse ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                                                        </button>
                                                    </div>
                                                    <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-on-surface/90 max-h-64 overflow-y-auto custom-scrollbar pr-2 leading-relaxed">
                                                        <ReactMarkdown>{response}</ReactMarkdown>
                                                    </div>
                                                </div>
                                            )}

                                            {rationale && (
                                                <div className="px-4 py-3 bg-primary/5 rounded-xl border border-primary/10 relative shadow-sm">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="text-[9px] font-black text-primary/60 uppercase tracking-widest block">
                                                            {rationaleHeader}
                                                        </span>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleCopyRationale(); }}
                                                            className="p-1.5 hover:bg-primary/10 rounded-lg text-primary transition-all opacity-40 hover:opacity-100"
                                                            title={t("mapper.action.copy_analysis")}
                                                        >
                                                            {copiedRationale ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                                                        </button>
                                                    </div>
                                                    <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-on-surface/80 leading-relaxed max-h-96 overflow-y-auto custom-scrollbar pr-2">
                                                        <ReactMarkdown>{rationale}</ReactMarkdown>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </AnimatePresence>
    );
});

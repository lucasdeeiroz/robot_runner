import { useState, useRef, useEffect } from 'react';
import { ChevronDown, AlertCircle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTranslation } from 'react-i18next';

export type ToastType = 'success' | 'error' | 'info' | 'loading';

export interface ExpandableToastProps {
    type: ToastType;
    title: string;
    details?: string | null;
    onClose?: () => void;
}

export function ExpandableToast({ type, title, details, onClose }: ExpandableToastProps) {
    const [expanded, setExpanded] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();

    // Hack para forçar o Sonner a não esmagar a altura do nosso toast customizado no hover
    useEffect(() => {
        if (containerRef.current) {
            const li = containerRef.current.closest('[data-sonner-toast]') as HTMLElement;
            if (li) {
                // Ao forçar height: auto direto no estilo inline do <li>, evitamos que as 
                // regras globais do sonner atropelem a nossa altura dinâmica no hover.
                li.style.setProperty('height', 'auto', 'important');
                
                // Em algumas versões do sonner, redefinir a variável ajuda na transição de empilhamento
                li.style.setProperty('--initial-height', `${containerRef.current.offsetHeight}px`);
                li.style.setProperty('--toast-height', `${containerRef.current.offsetHeight}px`);
            }
        }
    }, [expanded, details]);

    const typeConfig = {
        success: {
            icon: <CheckCircle2 size={20} className="text-success shrink-0" />,
            containerClass: "bg-success-container/90 border-success/30 text-on-success-container",
            detailsClass: "bg-black/10 text-on-success-container/90",
        },
        error: {
            icon: <AlertCircle size={20} className="text-error shrink-0" />,
            containerClass: "bg-error-container/20 border-error/30 text-on-error-container",
            detailsClass: "bg-black/10 text-on-error-container/90",
        },
        info: {
            icon: <Info size={20} className="text-primary shrink-0" />,
            containerClass: "bg-primary-container/90 border-primary/30 text-on-primary-container",
            detailsClass: "bg-black/10 text-on-primary-container/90",
        },
        loading: {
            icon: <Loader2 size={20} className="text-primary shrink-0 animate-spin" />,
            containerClass: "bg-surface-variant/90 border-outline-variant/30 text-on-surface",
            detailsClass: "bg-black/10 text-on-surface/90",
        }
    };

    const config = typeConfig[type];

    return (
        <div 
            ref={containerRef}
            className={twMerge(
                "w-full rounded-xl border backdrop-blur-md shadow-lg overflow-hidden flex flex-col pointer-events-auto",
                config.containerClass
            )}
        >
            <div className="flex items-start p-4 gap-3 relative">
                {config.icon}

                <div className="flex-1 flex flex-col justify-center min-h-[20px]">
                    <span className="text-sm font-medium leading-snug pr-6">
                        {title}
                    </span>
                </div>

                {onClose && (
                    <button
                        onClick={onClose}
                        className="absolute right-2 top-2 p-1.5 rounded-full hover:bg-black/10 transition-colors"
                        title={t('common.close', 'Close')}
                    >
                        <X size={14} className="opacity-70" />
                    </button>
                )}
            </div>

            {details && (
                <div className="px-4 pb-2">
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="flex items-center gap-1 text-xs font-medium opacity-80 hover:opacity-100 transition-opacity pb-2"
                    >
                        <span>{expanded ? t('common.hide_details', 'Hide details') : t('common.show_details', 'Show details')}</span>
                        <ChevronDown
                            size={14}
                            className={clsx("transition-transform duration-300", expanded ? "rotate-180" : "")}
                        />
                    </button>

                    {expanded && (
                        <div className="mt-1 mb-2 overflow-hidden">
                            <pre className={twMerge(
                                "text-xs p-3 rounded-lg overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all",
                                config.detailsClass
                            )}>
                                {details}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

import React from 'react';
import { useTranslation } from 'react-i18next';
import { BrainCircuit, Copy, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from '../atoms/Button';
import { toast } from 'sonner';

interface HistoryAIAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    analysis: string;
    isAnalyzing: boolean;
    error: string | null;
}

const HistoryAIAnalysisModal: React.FC<HistoryAIAnalysisModalProps> = ({
    isOpen,
    onClose,
    analysis,
    isAnalyzing,
    error
}) => {
    const { t } = useTranslation();
    const [copied, setCopied] = React.useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(analysis);
        setCopied(true);
        toast.success(t('common.copy_success', "Copiado com sucesso!"));
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('tests_page.actions.ai_analysis_title', "Intelligent History Analysis")}
            className="max-w-3xl"
        >
            <div className="flex flex-col h-[600px] max-h-[80vh]">
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-outline-variant hover:scrollbar-thumb-outline transition-colors">
                    {isAnalyzing ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4 text-on-surface-variant">
                            <Loader2 className="w-12 h-12 animate-spin text-primary" />
                            <p className="text-lg animate-pulse">{t('tests_page.actions.analyzing', "Analyzing history...")}</p>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4 text-error">
                            <AlertCircle className="w-16 h-16 opacity-20" />
                            <p className="text-center font-medium bg-error/10 p-4 rounded-xl border border-error/20">
                                {error}
                            </p>
                        </div>
                    ) : (
                        <div className="prose prose-invert max-w-none">
                            <div className="flex items-center gap-2 mb-6 p-4 bg-primary/5 border border-primary/20 rounded-2xl">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <BrainCircuit size={24} className="text-primary" />
                                </div>
                                <div>
                                    <h4 className="text-on-surface font-bold">Robot Runner AI Insights</h4>
                                    <p className="text-xs text-on-surface-variant">Trends, Flakiness & Performance Analysis</p>
                                </div>
                            </div>
                            
                            <div className="whitespace-pre-wrap font-sans text-on-surface leading-relaxed text-sm bg-surface-variant/20 p-6 rounded-2xl border border-outline-variant/30">
                                {analysis}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between p-4 border-t border-outline-variant/30 bg-surface-variant/10">
                    <Button
                        variant="ghost"
                        onClick={handleCopy}
                        disabled={!analysis || isAnalyzing}
                        leftIcon={copied ? <Check size={18} className="text-success" /> : <Copy size={18} />}
                    >
                        {copied ? t('common.copied', "Copied") : t('common.copy', "Copy Report")}
                    </Button>
                    
                    <Button
                        variant="primary"
                        onClick={onClose}
                    >
                        {t('common.close', "Close")}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default HistoryAIAnalysisModal;

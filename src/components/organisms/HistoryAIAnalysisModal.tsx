import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { AiResponse } from '../molecules/AiResponse';
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
    const handleCopy = () => {
        navigator.clipboard.writeText(analysis);
        toast.success(t('common.copy_success', "Copiado com sucesso!"));
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('tests_page.actions.ai_analysis_title')}
            className="max-w-4xl"
        >
            <div className="flex flex-col h-[600px] max-h-[80vh]">
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-outline-variant hover:scrollbar-thumb-outline transition-colors">
                    <AiResponse
                        isLoading={isAnalyzing}
                        rationale={analysis}
                        rationaleHeader={t('tests_page.actions.ai_analysis_rationale_header')}
                        error={error}
                        onCopy={handleCopy}
                        className="w-full"
                    />
                </div>
            </div>
        </Modal>
    );
};

export default HistoryAIAnalysisModal;

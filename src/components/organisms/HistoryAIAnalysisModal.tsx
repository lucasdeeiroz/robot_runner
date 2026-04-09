import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { AiResponse } from '../molecules/AiResponse';
import { toast } from 'sonner';
import { AiButton } from '../atoms/AiButton';
import { useSettings } from '@/lib/settings';
import { getAiContext } from '@/lib/dashboard/historyAnalysisUtils';
import { analyzeTestHistory as analyzeGemini } from '@/lib/dashboard/gemini';
import { analyzeTestHistory as analyzeOpenAI } from '@/lib/dashboard/openai';
import { analyzeTestHistory as analyzeClaude } from '@/lib/dashboard/claude';
import { load } from '@tauri-apps/plugin-store';
import { BrainCircuit, Info, Sparkles, History as HistoryIcon } from 'lucide-react';

interface HistoryAIAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    historyData: any[];
    logsPath: string;
}

interface SavedAnalysis {
    result: string;
    date: string;
    limit: number;
}

const HistoryAIAnalysisModal: React.FC<HistoryAIAnalysisModalProps> = ({
    isOpen,
    onClose,
    historyData,
    logsPath
}) => {
    const { t, i18n } = useTranslation();
    const { settings } = useSettings();

    const [failuresLimit, setFailuresLimit] = useState(20);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState("");
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [lastAnalysis, setLastAnalysis] = useState<SavedAnalysis | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);

    // Load cached analysis when modal opens or logsPath changes
    useEffect(() => {
        if (isOpen && logsPath) {
            loadCachedAnalysis();
        }
    }, [isOpen, logsPath]);

    const loadCachedAnalysis = async () => {
        try {
            const store = await load('ai_cache.json', { autoSave: true, defaults: {} });
            const key = `history_analysis_${logsPath.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const saved = await store.get<SavedAnalysis>(key);
            if (saved) {
                setLastAnalysis(saved);
                setAnalysisResult(saved.result);
                setFailuresLimit(saved.limit || 20);
            } else {
                setLastAnalysis(null);
                setAnalysisResult("");
            }
        } catch (e) {
            console.error("Failed to load AI cache:", e);
        }
    };

    const saveAnalysisToCache = async (result: string, limit: number) => {
        try {
            const store = await load('ai_cache.json', { autoSave: true, defaults: {} });
            const key = `history_analysis_${logsPath.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const data: SavedAnalysis = {
                result,
                date: new Date().toISOString(),
                limit
            };
            await store.set(key, data);
            setLastAnalysis(data);
        } catch (e) {
            console.error("Failed to save AI cache:", e);
        }
    };

    const tokenEstimate = useMemo(() => {
        // (Limit * 3750 tokens avg per failure log) + 500 tokens for preamble/metadata
        return (failuresLimit * 3750) + 500;
    }, [failuresLimit]);

    const handleStartAnalysis = async (customPrompt?: string) => {
        if (historyData.length === 0) return;

        // Abort previous if any
        if (abortControllerRef.current) abortControllerRef.current.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setIsAnalyzing(true);
        setAnalysisError(null);

        try {
            const provider = settings.aiProvider;
            const apiKey = provider === 'gemini'
                ? settings.geminiApiKey
                : provider === 'claude'
                    ? settings.claudeApiKey
                    : settings.openaiApiKey;

            if (!apiKey) {
                throw new Error(t('dashboard.generator.key_required', { provider: provider.charAt(0).toUpperCase() + provider.slice(1) }));
            }

            const model = provider === 'gemini' ? settings.geminiModel : provider === 'claude' ? settings.claudeModel : settings.openaiModel;
            const lang = settings.language || i18n.language || 'en';

            // Collect Context via Rust backend
            const failuresToAnalyze = historyData
                .filter(log => log.status === 'FAIL')
                .slice(0, failuresLimit)
                .map(l => l.xml_path);

            if (failuresToAnalyze.length === 0) {
                throw new Error("No failures found to analyze in current history.");
            }

            const xmlPath = failuresToAnalyze[0];
            const dbPath = xmlPath ? `${xmlPath}_v4.db` : undefined;

            const contextResponse = await getAiContext('history_analysis', {
                log_paths: failuresToAnalyze,
                db_path: dbPath,
                failures_limit: failuresLimit // Pass limit to backend if needed for truncation
            });

            if (controller.signal.aborted) return;

            const deepContext = contextResponse.context;
            let result = "";

            if (provider === 'gemini') {
                result = await analyzeGemini(historyData, apiKey, model, lang, deepContext, controller.signal, customPrompt);
            } else if (provider === 'openai') {
                result = await analyzeOpenAI(historyData, apiKey, model, lang, deepContext, controller.signal, customPrompt);
            } else if (provider === 'claude') {
                result = await analyzeClaude(historyData, apiKey, model, lang, deepContext, controller.signal, customPrompt);
            }

            if (!controller.signal.aborted) {
                setAnalysisResult(result);
                saveAnalysisToCache(result, failuresLimit);
            }
        } catch (err: any) {
            if (err.name === 'AbortError') return;
            setAnalysisError(err.message || String(err));
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(analysisResult);
        toast.success(t('common.copied', "Copiado!"));
    };

    const handleClose = () => {
        if (abortControllerRef.current) abortControllerRef.current.abort();
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={t('run_tab.console.ai_history.title')}
            className="max-w-4xl"
        >
            <div className="flex flex-col h-[700px] max-h-[85vh]">
                {/* Configuration Area */}
                <div className="p-6 border-b border-outline-variant/30 bg-surface-variant/10">
                    <div className="flex flex-col md:flex-row gap-6 items-end">
                        <div className="flex-1 space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-on-surface-variant flex items-center gap-2">
                                    <BrainCircuit size={16} className="text-primary" />
                                    {t('run_tab.console.ai_history.failures_limit')}
                                </label>
                                <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                    {failuresLimit}
                                </span>
                            </div>
                            <input
                                type="range"
                                min="5"
                                max="30"
                                step="5"
                                value={failuresLimit}
                                onChange={(e) => setFailuresLimit(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-outline-variant rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            <div className="flex justify-between text-[10px] text-on-surface-variant/60 font-medium px-1">
                                <span>5</span>
                                <span>15</span>
                                <span>30</span>
                            </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                            <div className="flex items-center gap-2 text-xs text-on-surface-variant/70 bg-surface/50 px-3 py-1.5 rounded-xl border border-outline-variant/20">
                                <Sparkles size={14} className="text-secondary" />
                                <span>{t('run_tab.console.ai_history.token_estimate')}:</span>
                                <span className="font-bold text-on-surface">~{tokenEstimate.toLocaleString()} {t('run_tab.console.ai_history.tokens')}</span>
                            </div>

                            <AiButton
                                onClick={(_e, customPrompt) => handleStartAnalysis(customPrompt)}
                                isLoading={isAnalyzing}
                                expandable={false}
                                showTextAlways={true}
                                label={analysisResult ? t('run_tab.console.ai_history.regenerate') : t('run_tab.console.ai_history.start_analysis')}
                                variant="primary"
                                className="w-full md:w-auto h-10 px-6 shadow-none"
                            />
                        </div>
                    </div>

                    {lastAnalysis && !isAnalyzing && (
                        <div className="mt-4 flex items-center gap-2 text-[11px] text-on-surface-variant/60 bg-primary/5 px-3 py-1 rounded-lg w-fit">
                            <HistoryIcon size={12} />
                            {t('run_tab.console.ai_history.last_analysis_on', { date: new Date(lastAnalysis.date).toLocaleString() })}
                        </div>
                    )}
                </div>

                {/* Response Area */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-outline-variant hover:scrollbar-thumb-outline transition-colors">
                    {!analysisResult && !isAnalyzing && !analysisError ? (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                            <div className="p-4 rounded-full bg-surface-variant/20">
                                <Info size={32} className="text-on-surface-variant" />
                            </div>
                            <div className="max-w-xs">
                                <p className="text-sm font-medium">{t('run_tab.console.ai_history.no_analysis')}</p>
                                <p className="text-xs mt-1">{t('run_tab.console.ai_history.persistence_note')}</p>
                            </div>
                        </div>
                    ) : (
                        <AiResponse
                            isLoading={isAnalyzing}
                            rationale={analysisResult}
                            rationaleHeader={t('tests_page.actions.ai_analysis_rationale_header')}
                            error={analysisError}
                            onCopy={handleCopy}
                            className="w-full"
                        />
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default HistoryAIAnalysisModal;

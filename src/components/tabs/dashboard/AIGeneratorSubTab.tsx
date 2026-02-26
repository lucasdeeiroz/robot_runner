
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Wand2, Eraser, FileDown, FileText, Copy, Trash2,
    BrainCircuit, AlertCircle, CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Textarea } from '@/components/atoms/Textarea';
import { Select } from '@/components/atoms/Select';
import { Switch } from '@headlessui/react';
import { useSettings } from '@/lib/settings';
import { feedback } from '@/lib/feedback';
import { generateRefinedTestCases, AIGenerationType } from '@/lib/dashboard/gemini';
import { listScreenMaps } from '@/lib/dashboard/mapperPersistence';
import { exportToXlsx, exportToDocx } from '@/lib/dashboard/export';
import { addToHistory } from './HistoryPanel';
import clsx from 'clsx';

export function AIGeneratorSubTab() {
    const { t, i18n } = useTranslation();
    const { settings, activeProfileId } = useSettings();

    const [requirements, setRequirements] = useState('');
    const [generatedContent, setGeneratedContent] = useState('');
    const [genType, setGenType] = useState<AIGenerationType>('test_case');
    const [useMapping, setUseMapping] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    const hasApiKey = !!settings.geminiApiKey;

    const handleGenerate = async () => {
        if (!requirements.trim() || !hasApiKey) return;

        setIsGenerating(true);
        try {
            let maps = undefined;
            if (useMapping) {
                maps = await listScreenMaps(activeProfileId);
            }

            const aiResponse = await generateRefinedTestCases(
                requirements,
                settings.geminiApiKey as string,
                settings.geminiModel,
                i18n.language,
                maps,
                genType
            );

            setGeneratedContent(aiResponse);
            feedback.toast.success(t('dashboard.generator.success', { method: "Gemini AI" }));
        } catch (e: any) {
            console.error("AI generation failed:", e);
            feedback.toast.error("dashboard.actions.gemini_failed", { error: e.message });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleClearInput = () => setRequirements('');
    const handleClearOutput = () => setGeneratedContent('');

    const handleCopy = () => {
        if (!generatedContent) return;
        navigator.clipboard.writeText(generatedContent);
        feedback.toast.success(t('common.copied', "Copied!"));
    };

    const handleExportXlsx = async () => {
        if (!generatedContent.trim()) return;
        try {
            const blob = await exportToXlsx(generatedContent, i18n.language);
            if (blob) {
                addToHistory("XLSX", `ai_artifact_${new Date().getTime()}.xlsx`, blob);
            }
            feedback.toast.success(t('dashboard.export.success', "Successfully exported!"));
        } catch (e) {
            feedback.toast.error("dashboard.export.error", e);
        }
    };

    const handleExportDocx = async () => {
        if (!generatedContent.trim()) return;
        try {
            const blob = await exportToDocx(generatedContent, i18n.language);
            if (blob) {
                addToHistory("DOCX", `ai_artifact_${new Date().getTime()}.docx`, blob);
            }
            feedback.toast.success(t('dashboard.export.success', "Successfully exported!"));
        } catch (e) {
            feedback.toast.error("dashboard.export.error", e);
        }
    };

    const typeOptions = [
        { value: 'test_case', label: t('dashboard.generator.types.test_case', "Test Cases (BDD)") },
        { value: 'pbi', label: t('dashboard.generator.types.pbi', "Product Backlog Item (PBI)") },
        { value: 'improvement', label: t('dashboard.generator.types.improvement', "Functional Improvement") },
        { value: 'bug', label: t('dashboard.generator.types.bug', "Bug Report") },
    ];

    return (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Input Panel */}
            <div className="bg-surface-variant/10 rounded-2xl p-4 border border-outline-variant/30 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
                        <Wand2 size={16} />
                        {t('dashboard.generator.title', "AI Artifact Generator")}
                    </h3>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearInput}
                        className="text-on-surface-variant hover:text-error h-8 w-8 p-0"
                        title={t('common.clear')}
                    >
                        <Eraser size={16} />
                    </Button>
                </div>

                <div className="flex flex-col gap-4 flex-1 min-h-0">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-on-surface-variant/70 px-1">
                            {t('dashboard.generator.type_label', "Generation Type")}
                        </label>
                        <Select
                            value={genType}
                            onChange={(e) => setGenType(e.target.value as AIGenerationType)}
                            options={typeOptions}
                            className="w-full"
                        />
                    </div>

                    <Textarea
                        value={requirements}
                        onChange={(e) => setRequirements(e.target.value)}
                        placeholder={t('dashboard.generator.input_placeholder', "Paste your requirements here...")}
                        containerClassName="flex-1 flex flex-col min-h-0"
                        className="flex-1 font-mono custom-scrollbar resize-none text-sm p-4 bg-surface"
                    />

                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between bg-surface-variant/20 p-3 rounded-xl border border-outline-variant/20">
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-on-surface">{t('dashboard.generator.use_mapping', "Use App Mapping")}</span>
                                <span className="text-[10px] text-on-surface-variant/70">{t('dashboard.generator.use_mapping_hint', "Increase precision using screen elements")}</span>
                            </div>
                            <Switch
                                checked={useMapping}
                                onChange={setUseMapping}
                                className={clsx(
                                    useMapping ? 'bg-primary' : 'bg-surface-variant',
                                    'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out'
                                )}
                            >
                                <span className="sr-only">Use Mapping</span>
                                <span
                                    aria-hidden="true"
                                    className={clsx(
                                        useMapping ? 'translate-x-5' : 'translate-x-0',
                                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                                    )}
                                />
                            </Switch>
                        </div>

                        {!hasApiKey ? (
                            <div className="flex items-center gap-2 p-3 bg-error/10 border border-error/20 rounded-xl text-error text-xs">
                                <AlertCircle size={14} />
                                <span>{t('dashboard.generator.key_required', "Gemini API Key required in Settings.")}</span>
                            </div>
                        ) : (
                            <Button
                                variant="primary"
                                onClick={handleGenerate}
                                disabled={!requirements.trim() || isGenerating}
                                leftIcon={isGenerating ? undefined : <BrainCircuit size={16} />}
                                className="w-full justify-center shadow-lg shadow-primary/20 h-11 text-base font-semibold"
                            >
                                {isGenerating ? t('dashboard.generator.generating', "Generating...") : t('dashboard.generator.generate_button', "Generate with AI")}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Editor/Output Panel */}
            <div className="bg-surface-variant/10 rounded-2xl p-4 border border-outline-variant/30 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
                        <CheckCircle2 size={16} className={generatedContent ? "text-primary" : "text-on-surface-variant/30"} />
                        {t('dashboard.editor.title', "Generated Content")}
                    </h3>
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCopy}
                            disabled={!generatedContent}
                            className="text-on-surface-variant h-8 w-8 p-0"
                            title={t('common.copy')}
                        >
                            <Copy size={16} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleClearOutput}
                            disabled={!generatedContent}
                            className="text-on-surface-variant hover:text-error h-8 w-8 p-0"
                            title={t('common.clear')}
                        >
                            <Trash2 size={16} />
                        </Button>
                    </div>
                </div>

                <Textarea
                    value={generatedContent}
                    onChange={(e) => setGeneratedContent(e.target.value)}
                    placeholder={t('dashboard.generator.empty_state', "Generated content will appear here...")}
                    containerClassName="flex-1 flex flex-col min-h-0"
                    className="flex-1 font-mono custom-scrollbar resize-none whitespace-pre-wrap text-sm p-4 bg-surface"
                />

                <div className="grid grid-cols-2 gap-3 mt-4">
                    <Button
                        variant="outline"
                        onClick={handleExportXlsx}
                        disabled={!generatedContent}
                        leftIcon={<FileDown size={16} className="text-green-600" />}
                        className="justify-center h-10"
                    >
                        {t('dashboard.actions.export_xlsx', "Excel (.xlsx)")}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleExportDocx}
                        disabled={!generatedContent}
                        leftIcon={<FileText size={16} className="text-blue-600" />}
                        className="justify-center h-10"
                    >
                        {t('dashboard.actions.export_docx', "Word (.docx)")}
                    </Button>
                </div>
            </div>
        </div>
    );
}

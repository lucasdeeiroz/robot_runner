
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Wand2, Eraser, FileDown, FileText, Copy, Trash2, AlertCircle, CheckCircle2, Settings
} from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Textarea } from '@/components/atoms/Textarea';
import { Select } from '@/components/atoms/Select';
import { Switch } from '@headlessui/react';
import { useSettings } from '@/lib/settings';
import { feedback } from '@/lib/feedback';
import { AiButton } from "@/components/atoms/AiButton";
import { generateRefinedTestCases as generateWithGemini, AIGenerationType } from '@/lib/dashboard/gemini';
import { generateRefinedTestCases as generateWithClaude } from '@/lib/dashboard/claude';
import { generateRefinedTestCases as generateWithOpenAI } from '@/lib/dashboard/openai';
import { generateRefinedTestCases as generateWithClaudeCode } from '@/lib/dashboard/claudeCode';
import { getAiContext } from '@/lib/dashboard/historyAnalysisUtils';
import { exportToXlsx, exportToDocx } from '@/lib/dashboard/export';
import { addToHistory } from './HistoryPanel';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import clsx from 'clsx';

interface AIGeneratorSubTabProps {
    onNavigate?: (page: string) => void;
}

export function AIGeneratorSubTab({ onNavigate }: AIGeneratorSubTabProps) {
    const { t, i18n } = useTranslation();
    const { settings, activeProfileId } = useSettings();

    const [requirements, setRequirements] = useState('');
    const [generatedContent, setGeneratedContent] = useState('');
    const [genType, setGenType] = useState<AIGenerationType>('test_case');
    const [useMapping, setUseMapping] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    const provider = settings.aiProvider || 'gemini';
    const apiKey = provider === 'gemini' ? settings.geminiApiKey : provider === 'claude' ? settings.claudeApiKey : provider === 'openai' ? settings.openaiApiKey : 'CLI_MODE';
    const model = provider === 'gemini' ? settings.geminiModel : provider === 'claude' ? settings.claudeModel : provider === 'openai' ? settings.openaiModel : provider === 'claude-code' ? 'claude-code' : 'antigravity-cli';
    const hasApiKey = (provider === 'claude-code' || provider === 'antigravity-cli') ? true : !!apiKey;

    const handleGenerate = async (customPrompt?: string) => {
        if (!requirements.trim() || !hasApiKey) return;

        setIsGenerating(true);
        try {
            let mapsContext: string | undefined = undefined;
            if (useMapping) {
                const contextResponse = await getAiContext('artifact_generation', {
                    profile_id: activeProfileId || undefined,
                    custom_mappings_dir: settings.paths?.mappings
                });
                mapsContext = contextResponse.context;
            }

            let aiResponse = "";
            const currentLang = i18n.language === 'pt' ? 'Portuguese' : i18n.language === 'es' ? 'Spanish' : 'English';

            if (provider === 'gemini') {
                aiResponse = await generateWithGemini(requirements, apiKey as string, model, currentLang, mapsContext as any, genType, undefined, customPrompt);
            } else if (provider === 'claude') {
                aiResponse = await generateWithClaude(requirements, apiKey as string, model, currentLang, mapsContext as any, genType, undefined, customPrompt);
            } else if (provider === 'openai') {
                aiResponse = await generateWithOpenAI(requirements, apiKey as string, model, currentLang, mapsContext as any, genType, undefined, customPrompt);
            } else if (provider === 'claude-code') {
                aiResponse = await generateWithClaudeCode(requirements, settings.paths.automationRoot || '', currentLang, mapsContext as any, genType, customPrompt, settings.claudeCodeToken);
            } else if (provider === 'antigravity-cli') {
                const { generateRefinedTestCases } = await import('@/lib/dashboard/antigravityCode');
                aiResponse = await generateRefinedTestCases(requirements, settings.paths.automationRoot || '', currentLang, mapsContext as any, genType, customPrompt, settings.antigravityApiKey);
            }

            setGeneratedContent(aiResponse);
            feedback.toast.success(t('dashboard.generator.success', { method: `${provider.charAt(0).toUpperCase() + provider.slice(1)} AI` }));
        } catch (e: any) {
            console.error("AI generation failed:", e);
            const errorMessage = e?.message || (typeof e === 'string' ? e : JSON.stringify(e)) || "Unknown Error";
            feedback.toast.error(t("dashboard.actions.ai_failed", { error: errorMessage }));
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

    const handleExportRobot = async () => {
        if (!generatedContent.trim()) return;

        try {
            const filePath = await save({
                filters: [{
                    name: 'Robot Framework Script',
                    extensions: ['robot']
                }],
                defaultPath: `script_${new Date().getTime()}.robot`
            });

            if (filePath) {
                await writeTextFile(filePath, generatedContent);
                feedback.toast.success(t('dashboard.export.success', "Successfully exported!"));
            }
        } catch (e) {
            console.error("Native export failed:", e);
            feedback.toast.error("dashboard.export.error", e);
        }
    };

    const typeOptions = [
        { value: 'test_case', label: t('dashboard.generator.types.test_case', "Test Cases (BDD)") },
        { value: 'robot_script', label: t('dashboard.generator.types.robot_script', "Robot Framework Script") },
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
                                <span className="sr-only">{t('dashboard.generator.use_mapping', "Use App Mapping")}</span>
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
                            <div className="flex items-center justify-between gap-2 p-3 bg-error/10 border border-error/20 rounded-xl text-error text-xs">
                                <div className='flex items-center gap-2'>
                                    <AlertCircle size={14} />
                                    <span>{t('dashboard.generator.key_required', { provider: provider.charAt(0).toUpperCase() + provider.slice(1) })}</span>
                                </div>
                                <Button
                                    onClick={() => onNavigate?.('settings')}
                                    variant="ghost"
                                    size="sm"
                                    className="text-on-surface-variant/60 hover:text-primary"
                                    leftIcon={<Settings size={14} />}
                                >
                                    {t('common.go_to_settings', "Go to Settings")}
                                </Button>
                            </div>
                        ) : (
                            <AiButton
                                id="test_generator"
                                onClick={(_e, customPrompt) => handleGenerate(customPrompt)}
                                isLoading={isGenerating}
                                disabled={!requirements.trim() || isGenerating}
                                label={t('dashboard.generator.generate_button', "Generate with AI")}
                                showTextAlways
                                allowCustomPrompt={false}
                                className="w-full justify-center h-11 text-base shadow-none border-none bg-transparent hover:bg-transparent"
                            />
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
                        disabled={!generatedContent || genType === 'robot_script'}
                        leftIcon={<FileDown size={16} className="text-green-600" />}
                        className="justify-center h-10"
                    >
                        {t('dashboard.actions.export_xlsx', "Excel (.xlsx)")}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleExportDocx}
                        disabled={!generatedContent || genType === 'robot_script'}
                        leftIcon={<FileText size={16} className="text-blue-600" />}
                        className="justify-center h-10"
                    >
                        {t('dashboard.actions.export_docx', "Word (.docx)")}
                    </Button>
                    {genType === 'robot_script' && (
                        <Button
                            variant="primary"
                            onClick={handleExportRobot}
                            disabled={!generatedContent}
                            leftIcon={<FileText size={16} />}
                            className="justify-center h-10 lg:col-span-1 md:col-span-2"
                        >
                            {t('dashboard.actions.export_robot', "Robot Script (.robot)")}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}


import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/organisms/PageHeader';
import { LayoutDashboard } from 'lucide-react';
import { ScenarioInput } from '@/components/tabs/dashboard/ScenarioInput';
import { ScenarioEditor } from '@/components/tabs/dashboard/ScenarioEditor';
import { ImageEditor } from '@/components/tabs/dashboard/ImageEditor';
import { HistoryPanel } from '@/components/tabs/dashboard/HistoryPanel';
import { generateTestCases } from '@/lib/dashboard/generator';
import clsx from 'clsx';
import { TabItem } from '@/components/molecules/Tabs';
import { TabBar } from '@/components/organisms/TabBar';
import { useSettings } from '@/lib/settings';
import { generateRefinedTestCases } from '@/lib/dashboard/gemini';
import { feedback } from '@/lib/feedback';

export function DashboardPage() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('scenarios');
    const [generatedContent, setGeneratedContent] = useState('');
    const { settings } = useSettings();
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerate = async (text: string, language: string) => {
        if (!text.trim()) return;

        // 1. Try Gemini if API Key is present
        if (settings.geminiApiKey) {
            setIsGenerating(true);
            try {
                const aiResponse = await generateRefinedTestCases(text, settings.geminiApiKey, settings.geminiModel, language);
                setGeneratedContent(aiResponse);
                feedback.toast.success("dashboard.actions.generated_success", { method: "Gemini AI" });
                return;
            } catch (e: any) {
                console.error("Gemini generation failed, falling back to local:", e);
                feedback.toast.error("dashboard.actions.gemini_failed", { error: e.message });
                // Fallthrough to local generator
            } finally {
                setIsGenerating(false);
            }
        } else {
            feedback.toast.info("dashboard.actions.using_local_generator", { message: "Configure Gemini API Key in Settings for AI-powered generation." });
        }

        // 2. Fallback to Local Regex Generator
        const scenarios = generateTestCases(text, language);
        setGeneratedContent(scenarios);
    };

    const tabs: TabItem[] = [
        { id: 'scenarios', label: t('dashboard.tabs.scenarios', "Scenario Generator") },
        { id: 'images', label: t('dashboard.tabs.images', "Image Editor") },
        { id: 'history', label: t('dashboard.tabs.history', "History") }
    ];

    return (
        <div className="h-full flex flex-col space-y-4">
            <PageHeader
                title={t('sidebar.dashboard', "QA Dashboard")}
                description={t('dashboard.description', "Auxiliary tools for QA: Scenario generation, image editing and documentation.")}
                icon={LayoutDashboard}
            />

            <TabBar
                tabs={tabs}
                activeId={activeTab}
                onChange={setActiveTab}
                variant="pills"
                className="z-20 relative"
                layoutId="dashboard-page-tabs"
            />

            <div className="flex-1 min-h-0 bg-surface p-4 rounded-2xl border border-outline-variant/30 overflow-hidden relative z-10 flex flex-col">
                {/* SCENARIOS TAB */}
                <div className={clsx("h-full grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0", activeTab === 'scenarios' ? "block" : "hidden")}>
                    <div className="bg-surface-variant/10 rounded-2xl p-4 border border-outline-variant/30 flex flex-col h-full min-h-0">
                        <ScenarioInput
                            onGenerate={handleGenerate}
                            onClear={() => setGeneratedContent('')}
                            isLoading={isGenerating}
                        />
                    </div>
                    <div className="bg-surface-variant/10 rounded-2xl p-4 border border-outline-variant/30 flex flex-col h-full min-h-0">
                        <ScenarioEditor
                            content={generatedContent}
                            onUpdate={setGeneratedContent}
                            onClear={() => setGeneratedContent('')}
                        />
                    </div>
                </div>

                {/* IMAGES TAB */}
                <div className={clsx("h-full", activeTab === 'images' ? "block" : "hidden")}>
                    <ImageEditor />
                </div>

                {/* HISTORY TAB */}
                <div className={clsx("h-full", activeTab === 'history' ? "block" : "hidden")}>
                    <HistoryPanel />
                </div>
            </div>
        </div>

    );
}

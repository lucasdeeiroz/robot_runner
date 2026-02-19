
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/organisms/PageHeader';
import { LayoutDashboard } from 'lucide-react';
import { ScenarioInput } from '@/components/tabs/dashboard/ScenarioInput';
import { ScenarioEditor } from '@/components/tabs/dashboard/ScenarioEditor';
import { ImageEditor } from '@/components/tabs/dashboard/ImageEditor';
import { HistoryPanel } from '@/components/tabs/dashboard/HistoryPanel';
import { MapperSubTab } from '@/components/tabs/dashboard/MapperSubTab';
import { generateTestCases } from '@/lib/dashboard/generator';
import clsx from 'clsx';
import { TabItem } from '@/components/molecules/Tabs';
import { TabBar } from '@/components/organisms/TabBar';
import { useSettings } from '@/lib/settings';
import { generateRefinedTestCases } from '@/lib/dashboard/gemini';
import { feedback } from '@/lib/feedback';
import { useDevices } from '@/lib/deviceStore';
import { DeviceSelector } from '@/components/molecules/DeviceSelector';
import { useTestSessions } from '@/lib/testSessionStore';
import { Device } from '@/lib/types';

interface DashboardPageProps {
    onNavigate?: (page: string) => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('scenarios');
    const [generatedContent, setGeneratedContent] = useState('');
    const { settings } = useSettings();
    const [isGenerating, setIsGenerating] = useState(false);

    // Device Management (Global)
    const { devices, selectedDevices, loading: loadingDevices, loadDevices: refreshDevices, setSelectedDevices } = useDevices();
    const { sessions, addToolboxSession } = useTestSessions();
    const busyDeviceIds = sessions.filter(s => s.status === 'running' && s.type === 'test').map(s => s.deviceUdid);

    const handleDeviceToggle = (udid: string) => {
        // Enforce Single Selection for Dashboard
        if (selectedDevices.includes(udid)) {
            setSelectedDevices([]);
        } else {
            setSelectedDevices([udid]);
        }
    };

    const selectedDeviceId = selectedDevices[0] || null;

    const handleOpenToolbox = (device: Device) => {
        const name = device.model;
        addToolboxSession(device.udid, name, device.model, device.android_version || undefined);
        if (onNavigate) {
            onNavigate('tests');
        }
    };

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
        { id: 'history', label: t('dashboard.tabs.history', "History") },
        { id: 'mapper', label: t('dashboard.tabs.mapper', "Mapper") }
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
                menus={
                    <DeviceSelector
                        devices={devices}
                        selectedDevices={selectedDevices}
                        toggleDevice={handleDeviceToggle}
                        loadingDevices={loadingDevices}
                        loadDevices={refreshDevices}
                        handleOpenToolbox={handleOpenToolbox}
                        busyDeviceIds={busyDeviceIds}
                    />
                }
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

                {/* MAPPER TAB */}
                <div className={clsx("h-full", activeTab === 'mapper' ? "block" : "hidden")}>
                    <MapperSubTab
                        isActive={activeTab === 'mapper'}
                        selectedDeviceId={selectedDeviceId}
                    />
                </div>
            </div>
        </div>

    );
}

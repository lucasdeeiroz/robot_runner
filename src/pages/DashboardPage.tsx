
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/organisms/PageHeader';
import { LayoutDashboard } from 'lucide-react';
import { AIGeneratorSubTab } from '@/components/tabs/dashboard/AIGeneratorSubTab';
import { ImageEditor } from '@/components/tabs/dashboard/ImageEditor';
import { HistoryPanel } from '@/components/tabs/dashboard/HistoryPanel';
import { MapperSubTab } from '@/components/tabs/dashboard/MapperSubTab';
import clsx from 'clsx';
import { TabItem } from '@/components/molecules/Tabs';
import { TabBar } from '@/components/organisms/TabBar';
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


    const tabs: TabItem[] = [
        { id: 'scenarios', label: t('dashboard.tabs.scenarios', "Scenario Generator") },
        { id: 'images', label: t('dashboard.tabs.images', "Image Editor") },
        { id: 'history', label: t('dashboard.tabs.history', "History") },
        { id: 'mapper', label: t('dashboard.tabs.mapper', "Mapper") }
    ];

    return (
        <div className="h-full flex flex-col gap-4">
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
                        onDropdownOpen={() => {
                            if (selectedDevices.length > 1) {
                                setSelectedDevices([selectedDevices[0]]);
                            }
                        }}
                    />
                }
            />

            <div className="flex-1 min-h-0 bg-surface p-4 border border-outline-variant/30 rounded-2xl relative z-10 flex flex-col">
                {/* SCENARIOS TAB */}
                <div className={clsx("flex-1 min-h-0", activeTab === 'scenarios' ? "flex flex-col" : "hidden")}>
                    <AIGeneratorSubTab />
                </div>

                {/* IMAGES TAB */}
                <div className={clsx("flex-1 min-h-0", activeTab === 'images' ? "flex flex-col" : "hidden")}>
                    <ImageEditor />
                </div>

                {/* HISTORY TAB */}
                <div className={clsx("flex-1 min-h-0", activeTab === 'history' ? "flex flex-col" : "hidden")}>
                    <HistoryPanel />
                </div>

                {/* MAPPER TAB */}
                <div className={clsx("flex-1 min-h-0", activeTab === 'mapper' ? "flex flex-col" : "hidden")}>
                    <MapperSubTab
                        isActive={activeTab === 'mapper'}
                        selectedDeviceId={selectedDeviceId}
                    />
                </div>
            </div>
        </div>

    );
}

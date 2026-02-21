import { useState, useEffect, useRef } from "react";
import { Play, Wifi, ScanEye, PlayCircle } from "lucide-react";
import { PageHeader } from "@/components/organisms/PageHeader";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { TestsSubTab } from "@/components/tabs/run/TestsSubTab";
import { ConnectSubTab } from "@/components/tabs/run/ConnectSubTab";
import { InspectorSubTab } from "@/components/tabs/run/InspectorSubTab";
import { useTestSessions } from "@/lib/testSessionStore";
import { useDevices } from '@/lib/deviceStore'; // Import Global Store

import { useSettings } from "@/lib/settings";
import { Device } from "@/lib/types";

// Atoms & Molecules
import { TabItem } from "@/components/molecules/Tabs";
import { TabBar } from "@/components/organisms/TabBar";
import { DeviceSelector } from "@/components/molecules/DeviceSelector";

type TabType = 'tests' | 'connect' | 'inspector';

interface RunPageProps {
    onNavigate?: (page: string) => void;
    initialTab?: TabType;
}

export function RunPage({ onNavigate, initialTab }: RunPageProps) {
    const { t } = useTranslation();
    const { systemCheckStatus, settings } = useSettings();
    const containerRef = useRef<HTMLDivElement>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setIsNarrow(entry.contentRect.width < 660);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const isLauncherDisabled = (systemCheckStatus?.missingTesting?.length ?? 0) > 0 || settings.usageMode === 'explorer';
    const isInspectorDisabled = false;

    const [activeTab, setActiveTab] = useState<TabType>(() => {
        if (initialTab && !(initialTab === 'tests' && isLauncherDisabled) && !(initialTab === 'inspector' && isInspectorDisabled)) return initialTab;
        if (isLauncherDisabled) return 'connect';
        return 'tests';
    });

    // Safety check if status updates later
    useEffect(() => {
        if (activeTab === 'tests' && isLauncherDisabled) {
            setActiveTab('connect');
        } else if (activeTab === 'inspector' && isInspectorDisabled) {
            setActiveTab('connect');
        }
    }, [systemCheckStatus, settings.usageMode, activeTab]);

    // React to initialTab changes if they come later (e.g. redirect)
    useEffect(() => {
        if (initialTab) {
            if (initialTab === 'tests' && isLauncherDisabled) {
                setActiveTab('connect');
            } else if (initialTab === 'inspector' && isInspectorDisabled) {
                setActiveTab('connect');
            } else {
                setActiveTab(initialTab);
            }
        }
    }, [initialTab, isLauncherDisabled, isInspectorDisabled]);

    // Define Tabs
    const tabs: TabItem[] = [
        ...(settings.usageMode === 'explorer' ? [] : [{ id: 'tests', label: !isNarrow ? t('run_tab.launcher') : '', icon: Play }]),
        { id: 'connect', label: !isNarrow ? t('run_tab.connect') : '', icon: Wifi },
        { id: 'inspector', label: !isNarrow ? t('run_tab.inspector') : '', icon: ScanEye },
    ];

    // Global Device State
    const { devices, selectedDevices, loading: loadingDevices, loadDevices, setSelectedDevices } = useDevices();

    const { sessions, addToolboxSession } = useTestSessions();
    // Only 'test' type sessions mark device as busy
    const busyDeviceIds = sessions.filter(s => s.status === 'running' && s.type === 'test').map(s => s.deviceUdid);

    // Enforce single selection when switching away from 'tests' tab
    useEffect(() => {
        if (activeTab !== 'tests' && selectedDevices.length > 1) {
            setSelectedDevices([selectedDevices[0]]);
        }
    }, [activeTab, selectedDevices, setSelectedDevices]);

    const toggleDevice = (udid: string) => {
        if (activeTab === 'tests') {
            // Multi-select allowed
            const newSelection = selectedDevices.includes(udid)
                ? selectedDevices.filter(id => id !== udid)
                : [...selectedDevices, udid];
            setSelectedDevices(newSelection);
        } else {
            // Single-select required
            setSelectedDevices([udid]);
        }
    };

    const handleOpenToolbox = (device: Device) => {

        const name = device.model; // Clean name without version
        addToolboxSession(device.udid, name, device.model, device.android_version || undefined);
        if (onNavigate) {
            onNavigate('tests');
        }
    };

    return (
        <div ref={containerRef} className="h-full flex flex-col space-y-4">
            <PageHeader
                title={t('sidebar.run')}
                description={t('sidebar.description_run')}
                icon={PlayCircle}
                iconSize="xl"
            />

            {/* Header / Device Selection Bar */}
            <TabBar
                layoutId="run-page-tabs"
                tabs={tabs}
                activeId={activeTab}
                onChange={(id) => {
                    if (id === 'tests' && isLauncherDisabled) return;
                    if (id === 'inspector' && isInspectorDisabled) return;
                    setActiveTab(id as TabType);
                }}
                variant="pills"
                className="z-20 relative"
                menus={
                    <DeviceSelector
                        devices={devices}
                        selectedDevices={selectedDevices}
                        toggleDevice={toggleDevice}
                        loadingDevices={loadingDevices}
                        loadDevices={loadDevices}
                        handleOpenToolbox={handleOpenToolbox}
                        busyDeviceIds={busyDeviceIds}
                    />
                }
            />

            {/* Main Content Area */}
            <div className="h-full flex-1 min-h-0 bg-surface p-4 relative z-10 rounded-2xl border border-outline-variant/30 flex flex-col">
                {settings.usageMode !== 'explorer' && (
                    <div className={clsx("h-full flex-1 min-h-0", activeTab === 'tests' ? "flex flex-col" : "hidden")}>
                        <TestsSubTab selectedDevices={selectedDevices} devices={devices} onNavigate={onNavigate} />
                    </div>
                )}

                <div className={clsx("h-full flex-1 min-h-0", activeTab === 'connect' ? "flex flex-col" : "hidden")}>
                    <ConnectSubTab onDeviceConnected={loadDevices} selectedDevice={selectedDevices[0]} />
                </div>

                <div className={clsx("h-full flex-1 min-h-0", activeTab === 'inspector' ? "flex flex-col" : "hidden")}>
                    <InspectorSubTab
                        selectedDevice={selectedDevices[0] || ""}
                        isActive={activeTab === 'inspector'}
                        isTestRunning={selectedDevices[0] ? busyDeviceIds.includes(selectedDevices[0]) : false}
                    />
                </div>
            </div>
        </div >
    );
}

import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, Wifi, Smartphone, RefreshCw, Wrench, ScanEye, PlayCircle } from "lucide-react";
import { PageHeader } from "@/components/organisms/PageHeader";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { TestsSubTab } from "../components/tabs/TestsSubTab";
import { ConnectSubTab } from "../components/tabs/ConnectSubTab";
import { InspectorSubTab } from "../components/tabs/InspectorSubTab";
import { useTestSessions } from "@/lib/testSessionStore";

import { useSettings } from "@/lib/settings";
import { Device } from "@/lib/types";
import { feedback } from "@/lib/feedback";

// Atoms & Molecules
import { Button } from "@/components/atoms/Button";
import { Badge } from "@/components/atoms/Badge";
import { Tabs, TabItem } from "@/components/molecules/Tabs";
import { AndroidVersionPill } from "@/components/atoms/AndroidVersionPill";

type TabType = 'tests' | 'connect' | 'inspector';

interface RunPageProps {
    onNavigate?: (page: string) => void;
    initialTab?: TabType;
}

export function RunPage({ onNavigate, initialTab }: RunPageProps) {
    const { t } = useTranslation();
    const { systemCheckStatus } = useSettings();
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

    const [activeTab, setActiveTab] = useState<TabType>(() => {
        if (initialTab && !(initialTab === 'tests' && systemCheckStatus?.missingAppium?.length > 0 || systemCheckStatus?.missingTesting?.length > 0)) return initialTab;
        if (systemCheckStatus?.missingTesting?.length > 0) return 'connect';
        return 'tests';
    });

    // Safety check if status updates later
    useEffect(() => {
        if (activeTab === 'tests' && (systemCheckStatus?.missingAppium?.length > 0 || systemCheckStatus?.missingTesting?.length > 0)) {
            setActiveTab('connect');
        }
    }, [systemCheckStatus, activeTab]);

    // React to initialTab changes if they come later (e.g. redirect)
    useEffect(() => {
        if (initialTab) {
            if (initialTab === 'tests' && (systemCheckStatus?.missingAppium?.length > 0 || systemCheckStatus?.missingTesting?.length > 0)) {
                setActiveTab('connect');
            } else {
                setActiveTab(initialTab);
            }
        }
    }, [initialTab]);

    const isLauncherDisabled = systemCheckStatus?.missingTesting?.length > 0;

    // Define Tabs
    const tabs: TabItem[] = [
        { id: 'tests', label: !isNarrow ? t('run_tab.launcher') : '', icon: Play },
        { id: 'connect', label: !isNarrow ? t('run_tab.connect') : '', icon: Wifi },
        { id: 'inspector', label: !isNarrow ? t('run_tab.inspector') : '', icon: ScanEye },
    ];

    // State for devices (Restored)
    const [devices, setDevices] = useState<Device[]>([]);
    const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
    const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);
    const [loadingDevices, setLoadingDevices] = useState(false);

    const { sessions, addToolboxSession } = useTestSessions();
    // Only 'test' type sessions mark device as busy
    const busyDeviceIds = sessions.filter(s => s.status === 'running' && s.type === 'test').map(s => s.deviceUdid);


    useEffect(() => {
        loadDevices();
    }, []);

    // Enforce single selection when switching away from 'tests' tab
    useEffect(() => {
        if (activeTab !== 'tests' && selectedDevices.length > 1) {
            setSelectedDevices([selectedDevices[0]]);
        }
    }, [activeTab]);

    const loadDevices = async () => {
        setLoadingDevices(true);
        try {
            const list = await invoke<Device[]>('get_connected_devices');
            setDevices(list);

            if (selectedDevices.length === 0 && list.length > 0) {
                setSelectedDevices([list[0].udid]);
            } else {
                const valid = selectedDevices.filter(id => list.find(d => d.udid === id));
                if (valid.length === 0 && list.length > 0) {
                    setSelectedDevices([list[0].udid]);
                } else if (valid.length !== selectedDevices.length) {
                    setSelectedDevices(valid);
                }
            }

        } catch (e) {
            feedback.toast.error("devices.load_error", e);
        } finally {
            setLoadingDevices(false);
        }
    };

    const toggleDevice = (udid: string) => {
        if (activeTab === 'tests') {
            // Multi-select allowed
            setSelectedDevices(prev =>
                prev.includes(udid)
                    ? prev.filter(id => id !== udid)
                    : [...prev, udid]
            );
        } else {
            // Single-select required
            setSelectedDevices([udid]);
            setIsDeviceDropdownOpen(false); // Close dropdown for better UX
        }
    };

    const handleOpenToolbox = (device: Device) => {
        // const ver = device.android_version ? `Android ${device.android_version}` : device.udid;
        // const name = `${device.model} (${ver})`;
        const name = device.model; // Clean name without version
        addToolboxSession(device.udid, name, device.model, device.android_version || undefined);
        if (onNavigate) {
            onNavigate('tests');
        }
    };

    return (
        <div ref={containerRef} className="h-full flex flex-col space-y-4" onClick={() => isDeviceDropdownOpen && setIsDeviceDropdownOpen(false)}>
            <PageHeader
                title={t('sidebar.run')}
                description={t('sidebar.description_run')}
                icon={PlayCircle}
                iconSize="xl"
            />

            {/* Header / Device Selection Bar */}
            <div className="flex items-center justify-between shrink-0 z-20 relative">

                {/* Atomic Tabs */}
                <Tabs
                    tabs={tabs}
                    activeId={activeTab}
                    onChange={(id) => {
                        if (id === 'tests' && isLauncherDisabled) return;
                        setActiveTab(id as TabType);
                    }}
                    variant="pills"
                    className="w-auto"
                />

                <div className="flex items-center gap-3 relative">
                    {/* Device Selector */}
                    <div
                        className="flex items-center gap-2 bg-white dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm dark:shadow-none px-3 py-1 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors select-none"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsDeviceDropdownOpen(!isDeviceDropdownOpen);
                        }}
                    >
                        <Smartphone size={18} className={clsx("shrink-0", selectedDevices.length > 0 ? "text-primary" : "text-zinc-400")} />
                        <div className="w-48 text-sm font-medium text-zinc-900 dark:text-zinc-200 truncate">
                            {selectedDevices.length === 0
                                ? t('run_tab.device.no_device')
                                : selectedDevices.length === 1
                                    ? devices.find(d => d.udid === selectedDevices[0])?.model || selectedDevices[0]
                                    : t('run_tab.device.selected_count', { count: selectedDevices.length })
                            }
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); loadDevices(); }}
                            title={t('run_tab.device.refresh')}
                            isLoading={loadingDevices}
                        >
                            {!loadingDevices && <RefreshCw size={14} />}
                        </Button>
                        {/* Dropdown Panel */}
                        {isDeviceDropdownOpen && (
                            <div
                                className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl p-2 z-50 flex flex-col gap-1"
                                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
                            >
                                <div className="text-xs font-semibold text-zinc-500 px-2 py-1 uppercase tracking-wider">{t('run_tab.device.select')}</div>
                                {devices.map(d => (
                                    <div
                                        key={d.udid}
                                        className="flex items-center justify-between px-2 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md group"
                                    >
                                        <div
                                            className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                                            onClick={() => toggleDevice(d.udid)}
                                        >
                                            <div className={clsx(
                                                "w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0",
                                                selectedDevices.includes(d.udid)
                                                    ? "bg-primary border-primary text-white"
                                                    : "border-zinc-300 dark:border-zinc-600"
                                            )}>
                                                {selectedDevices.includes(d.udid) && <div className="w-2 h-2 bg-white rounded-full" />}
                                            </div>
                                            <div className="flex flex-col overflow-hidden">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{d.model}</span>
                                                    {busyDeviceIds.includes(d.udid) && (
                                                        <Badge variant="warning" size="sm" className="text-[10px] font-bold uppercase tracking-wide">
                                                            {t('run_tab.device.busy')}
                                                        </Badge>
                                                    )}
                                                    {d.android_version && (
                                                        <AndroidVersionPill version={d.android_version} />
                                                    )}
                                                </div>
                                                <span className="text-xs text-zinc-500 truncate" title={d.udid}>{d.udid}</span>
                                            </div>
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={(e) => { e.stopPropagation(); handleOpenToolbox(d); setIsDeviceDropdownOpen(false); }}
                                            className="text-zinc-400 hover:text-primary hover:bg-primary/10 dark:hover:bg-primary/20"
                                            title={t('run_tab.device.open_toolbox')}
                                        >
                                            <Wrench size={16} />
                                        </Button>
                                    </div>
                                ))}
                                {devices.length === 0 && (
                                    <div className="text-sm text-zinc-400 px-2 py-2 text-center">No devices found</div>
                                )}
                            </div>
                        )}
                    </div>

                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 min-h-0 bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 overflow-hidden relative z-10">
                <div className={clsx("h-full", activeTab === 'tests' ? "block" : "hidden")}>
                    <TestsSubTab selectedDevices={selectedDevices} devices={devices} onNavigate={onNavigate} />
                </div>

                <div className={clsx("h-full", activeTab === 'connect' ? "block" : "hidden")}>
                    <ConnectSubTab onDeviceConnected={loadDevices} selectedDevice={selectedDevices[0]} />
                </div>

                <div className={clsx("h-full", activeTab === 'inspector' ? "block" : "hidden")}>
                    <InspectorSubTab selectedDevice={selectedDevices[0] || ""} isActive={activeTab === 'inspector'} />
                </div>
            </div>
        </div>
    );
}

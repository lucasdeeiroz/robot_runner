import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, Wifi, Smartphone, RefreshCw, Wrench, ScanEye } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { TestsSubTab } from "../components/run/TestsSubTab";
import { ConnectSubTab } from "../components/run/ConnectSubTab";
import { InspectorSubTab } from "../components/run/InspectorSubTab";
import { useTestSessions } from "@/lib/testSessionStore";

import { useSettings } from "@/lib/settings";
import { Device } from "@/lib/types";

type TabType = 'tests' | 'connect' | 'inspector';

interface RunTabProps {
    onNavigate?: (page: string) => void;
    initialTab?: TabType;
}

export function RunTab({ onNavigate, initialTab }: RunTabProps) {
    const { t } = useTranslation();
    const { systemCheckStatus } = useSettings();

    // Initialize activeTab with initialTab if provided, else default to 'tests'
    // But if 'tests' is disabled (missing tools), default to 'connect'?
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

    // ...

    // State for devices (Restored)
    const [devices, setDevices] = useState<Device[]>([]);
    const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
    const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);
    const [loadingDevices, setLoadingDevices] = useState(false);

    const { sessions, addToolboxSession } = useTestSessions();
    // Only 'test' type sessions mark device as busy
    const busyDeviceIds = sessions.filter(s => s.status === 'running' && s.type === 'test').map(s => s.deviceUdid);

    const isLauncherDisabled = systemCheckStatus?.missingTesting?.length > 0;

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
            console.error("Failed to load devices:", e);
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
        const ver = device.android_version ? `Android ${device.android_version}` : device.udid;
        const name = `${device.model} (${ver})`;
        addToolboxSession(device.udid, name);
        if (onNavigate) {
            onNavigate('tests');
        }
    };

    return (
        <div className="h-full flex flex-col space-y-4" onClick={() => isDeviceDropdownOpen && setIsDeviceDropdownOpen(false)}>
            {/* Header / Device Selection Bar */}
            <div className="flex items-center justify-between bg-white dark:bg-zinc-900/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm dark:shadow-none shrink-0 z-20 relative">
                <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                    <TabButton
                        active={activeTab === 'tests'}
                        onClick={() => !isLauncherDisabled && setActiveTab('tests')}
                        icon={<Play size={16} />}
                        label={t('run_tab.launcher')}
                        disabled={isLauncherDisabled}
                    />
                    <TabButton
                        active={activeTab === 'connect'}
                        onClick={() => setActiveTab('connect')}
                        icon={<Wifi size={16} />}
                        label={t('run_tab.connect')}
                    />
                    <TabButton
                        active={activeTab === 'inspector'}
                        onClick={() => setActiveTab('inspector')}
                        icon={<ScanEye size={16} />}
                        label={t('run_tab.inspector')}
                    />
                </div>

                <div className="flex items-center gap-3 relative">
                    {/* Device Selector */}
                    <div
                        className="flex items-center gap-2 bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors select-none"
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
                                                        <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">
                                                            {t('run_tab.device.busy')}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-xs text-zinc-500 truncate" title={d.udid}>{d.udid}</span>
                                            </div>
                                        </div>

                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleOpenToolbox(d); setIsDeviceDropdownOpen(false); }}
                                            className="p-1.5 text-zinc-400 hover:text-primary hover:bg-primary/10 dark:hover:bg-primary/20 rounded transition-colors"
                                            title="Open Toolbox"
                                        >
                                            <Wrench size={16} />
                                        </button>
                                    </div>
                                ))}
                                {devices.length === 0 && (
                                    <div className="text-sm text-zinc-400 px-2 py-2 text-center">No devices found</div>
                                )}
                            </div>
                        )}
                    </div>

                    <button
                        onClick={(e) => { e.stopPropagation(); loadDevices(); }}
                        className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors text-zinc-500"
                        title={t('run_tab.device.refresh')}
                    >
                        <RefreshCw size={14} className={loadingDevices ? "animate-spin" : ""} />
                    </button>
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
                    <InspectorSubTab selectedDevice={selectedDevices[0] || ""} />
                </div>
            </div>
        </div>
    );
}

function TabButton({ active, onClick, icon, label, disabled }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, disabled?: boolean }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
                active
                    ? "bg-white dark:bg-zinc-700 text-primary shadow-sm"
                    : disabled
                        ? "text-zinc-300 dark:text-zinc-600 cursor-not-allowed"
                        : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white/50 dark:hover:bg-zinc-700/50"
            )}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}

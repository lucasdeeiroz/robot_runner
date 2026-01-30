import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence } from "framer-motion";
import { StaggerContainer, StaggerItem } from "@/components/motion/MotionPrimitives";
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
import { TabItem } from "@/components/molecules/Tabs";
import { TabBar } from "@/components/organisms/TabBar";
import { AndroidVersionPill } from "@/components/atoms/AndroidVersionPill";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";

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
            <TabBar
                layoutId="run-page-tabs"
                tabs={tabs}
                activeId={activeTab}
                onChange={(id) => {
                    if (id === 'tests' && isLauncherDisabled) return;
                    setActiveTab(id as TabType);
                }}
                variant="pills"
                className="z-20 relative"
                menus={
                    <div className="flex items-center gap-3 relative">
                        {/* Device Selector */}
                        <div
                            className="flex items-center gap-2 bg-surface rounded-2xl border border-outline-variant/30 shadow-sm px-3 py-1 cursor-pointer hover:bg-surface-variant/30 transition-colors select-none"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsDeviceDropdownOpen(!isDeviceDropdownOpen);
                            }}
                        >
                            <Smartphone size={18} className={clsx("shrink-0", selectedDevices.length > 0 ? "text-primary" : "text-on-surface/80")} />
                            <div className="w-48 text-sm font-medium text-on-surface/80 truncate">
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
                            >
                                {!loadingDevices ? <RefreshCw size={14} /> : <ExpressiveLoading size="sm" variant="circular" />}
                            </Button>
                            {/* Dropdown Panel */}
                            <AnimatePresence>
                                {isDeviceDropdownOpen && (
                                    <StaggerContainer
                                        className="absolute top-full right-0 mt-2 w-72 bg-surface backdrop-blur-md border border-outline-variant/30 rounded-2xl shadow-xl p-2 z-50 flex flex-col gap-1"
                                        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
                                    >
                                        <div className="text-xs font-semibold px-2 py-1 uppercase tracking-wider">{t('run_tab.device.select')}</div>
                                        {devices.map(d => (
                                            <StaggerItem
                                                key={d.udid}
                                                className="flex items-center justify-between px-2 py-2 hover:bg-surface-variant/30 rounded-2xl group"
                                            >
                                                <div
                                                    className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                                                    onClick={() => toggleDevice(d.udid)}
                                                >
                                                    <div className={clsx(
                                                        "w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0",
                                                        selectedDevices.includes(d.udid)
                                                            ? "bg-primary border-primary text-on-primary"
                                                            : "border-outline-variant/30"
                                                    )}>
                                                        {selectedDevices.includes(d.udid) && <div className="w-2 h-2 bg-on-primary rounded-2xl" />}
                                                    </div>
                                                    <div className="flex flex-col overflow-hidden">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-medium text-on-surface/80 truncate">{d.model}</span>
                                                            {busyDeviceIds.includes(d.udid) && (
                                                                <Badge variant="warning" size="sm" className="text-[10px] font-bold uppercase tracking-wide">
                                                                    {t('run_tab.device.busy')}
                                                                </Badge>
                                                            )}
                                                            {d.android_version && (
                                                                <AndroidVersionPill version={d.android_version} />
                                                            )}
                                                        </div>
                                                        <span className="text-xs text-on-surface-variant/80 truncate" title={d.udid}>{d.udid}</span>
                                                    </div>
                                                </div>

                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={(e) => { e.stopPropagation(); handleOpenToolbox(d); setIsDeviceDropdownOpen(false); }}
                                                    className="text-on-surface/80 hover:text-primary hover:bg-primary/10"
                                                    title={t('run_tab.device.open_toolbox')}
                                                >
                                                    <Wrench size={16} />
                                                </Button>
                                            </StaggerItem>
                                        ))}
                                        {devices.length === 0 && (
                                            <div className="text-sm text-on-surface/80 px-2 py-2 text-center">{t('run_tab.device.no_devices_found')}</div>
                                        )}
                                    </StaggerContainer>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                }
            />

            {/* Main Content Area */}
            <div className="flex-1 min-h-0 bg-surface p-4 overflow-hidden relative z-10 rounded-2xl border border-outline-variant/30">
                <div className={clsx("h-full", activeTab === 'tests' ? "block" : "hidden")}>
                    <TestsSubTab selectedDevices={selectedDevices} devices={devices} onNavigate={onNavigate} />
                </div>

                <div className={clsx("h-full", activeTab === 'connect' ? "block" : "hidden")}>
                    <ConnectSubTab onDeviceConnected={loadDevices} selectedDevice={selectedDevices[0]} />
                </div>

                <div className={clsx("h-full", activeTab === 'inspector' ? "block" : "hidden")}>
                    <InspectorSubTab
                        selectedDevice={selectedDevices[0] || ""}
                        isActive={activeTab === 'inspector'}
                        isTestRunning={selectedDevices[0] ? busyDeviceIds.includes(selectedDevices[0]) : false}
                    />
                </div>
            </div>
        </div>
    );
}

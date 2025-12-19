import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, Wifi, ScanEye, Terminal, Smartphone, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { TestsSubTab } from "../components/run/TestsSubTab";
import { ConnectSubTab } from "../components/run/ConnectSubTab";
import { InspectorSubTab } from "../components/run/InspectorSubTab";
import { CommandsSubTab } from "../components/run/CommandsSubTab";

export interface Device {
    udid: string;
    model: string;
    is_emulator: boolean;
}

type TabType = 'tests' | 'connect' | 'inspector' | 'commands';

export function RunTab() {
    const [activeTab, setActiveTab] = useState<TabType>('tests');
    const [devices, setDevices] = useState<Device[]>([]);
    const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
    const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);
    const [loadingDevices, setLoadingDevices] = useState(false);

    useEffect(() => {
        loadDevices();
        // Close dropdown on click outside logic could be added here, but simple toggle is fine for now
    }, []);

    const loadDevices = async () => {
        setLoadingDevices(true);
        try {
            const list = await invoke<Device[]>('get_connected_devices');
            setDevices(list);

            // Auto-select logic:
            // If nothing selected, select first.
            // If previously selected devices are gone, filter them out.
            if (selectedDevices.length === 0 && list.length > 0) {
                setSelectedDevices([list[0].udid]);
            } else {
                // Keep only those that still exist
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
        setSelectedDevices(prev =>
            prev.includes(udid)
                ? prev.filter(id => id !== udid)
                : [...prev, udid]
        );
    };

    return (
        <div className="h-full flex flex-col space-y-4" onClick={() => isDeviceDropdownOpen && setIsDeviceDropdownOpen(false)}>
            {/* Header / Device Selection Bar */}
            <div className="flex items-center justify-between bg-white dark:bg-zinc-900/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm dark:shadow-none shrink-0 z-20 relative">
                <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                    <TabButton
                        active={activeTab === 'tests'}
                        onClick={() => setActiveTab('tests')}
                        icon={<Play size={16} />}
                        label="Tests"
                    />
                    <TabButton
                        active={activeTab === 'connect'}
                        onClick={() => setActiveTab('connect')}
                        icon={<Wifi size={16} />}
                        label="Connect"
                    />
                    <TabButton
                        active={activeTab === 'inspector'}
                        onClick={() => setActiveTab('inspector')}
                        icon={<ScanEye size={16} />}
                        label="Inspector"
                    />
                    <TabButton
                        active={activeTab === 'commands'}
                        onClick={() => setActiveTab('commands')}
                        icon={<Terminal size={16} />}
                        label="Commands"
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
                        <Smartphone size={18} className={clsx("shrink-0", selectedDevices.length > 0 ? "text-blue-500" : "text-zinc-400")} />
                        <div className="w-48 text-sm font-medium text-zinc-900 dark:text-zinc-200 truncate">
                            {selectedDevices.length === 0
                                ? "No Device Selected"
                                : selectedDevices.length === 1
                                    ? devices.find(d => d.udid === selectedDevices[0])?.model || selectedDevices[0]
                                    : `${selectedDevices.length} Devices Selected`
                            }
                        </div>
                        {/* Dropdown Panel */}
                        {isDeviceDropdownOpen && (
                            <div
                                className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl p-2 z-50 flex flex-col gap-1"
                                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
                            >
                                <div className="text-xs font-semibold text-zinc-500 px-2 py-1 uppercase tracking-wider">Select Devices</div>
                                {devices.map(d => (
                                    <div
                                        key={d.udid}
                                        onClick={() => toggleDevice(d.udid)}
                                        className="flex items-center gap-3 px-2 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md cursor-pointer"
                                    >
                                        <div className={clsx(
                                            "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                                            selectedDevices.includes(d.udid)
                                                ? "bg-blue-500 border-blue-500 text-white"
                                                : "border-zinc-300 dark:border-zinc-600"
                                        )}>
                                            {selectedDevices.includes(d.udid) && <RefreshCw size={10} className="hidden" /> /* Just a placeholder check */}
                                            {selectedDevices.includes(d.udid) && <div className="w-2 h-2 bg-white rounded-full" />}
                                        </div>
                                        <div className="flex flex-col overflow-hidden">
                                            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{d.model}</span>
                                            <span className="text-xs text-zinc-500 truncate" title={d.udid}>{d.udid}</span>
                                        </div>
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
                        title="Refresh Devices"
                    >
                        <RefreshCw size={14} className={loadingDevices ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 min-h-0 bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 overflow-hidden relative z-10">
                {activeTab === 'tests' && (
                    <TestsSubTab selectedDevices={selectedDevices} />
                )}

                {activeTab === 'connect' && (
                    <ConnectSubTab onDeviceConnected={loadDevices} />
                )}

                {activeTab === 'inspector' && (
                    <InspectorSubTab selectedDevice={selectedDevices[0] || ""} />
                )}

                {activeTab === 'commands' && (
                    <CommandsSubTab selectedDevice={selectedDevices[0] || ""} />
                )}
            </div>
        </div>
    );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
                active
                    ? "bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white/50 dark:hover:bg-zinc-700/50"
            )}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}

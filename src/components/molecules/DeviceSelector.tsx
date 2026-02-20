import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/atoms/Button';
import { Smartphone, RefreshCw, Wrench } from 'lucide-react';
import clsx from 'clsx';
import { AnimatePresence } from 'framer-motion';
import { StaggerContainer, StaggerItem } from '@/components/motion/MotionPrimitives';
import { Device } from '@/lib/types';
import { Badge } from '@/components/atoms/Badge';
import { AndroidVersionPill } from '@/components/atoms/AndroidVersionPill';


interface DeviceSelectorProps {
    devices: Device[];
    selectedDevices: string[];
    toggleDevice: (udid: string) => void;
    loadingDevices: boolean;
    loadDevices: () => void;
    handleOpenToolbox: (device: Device) => void;
    busyDeviceIds: string[];
    onDropdownOpen?: () => void;
    compact?: boolean;
}

export function DeviceSelector({
    devices,
    selectedDevices,
    toggleDevice,
    loadingDevices,
    loadDevices,
    handleOpenToolbox,
    busyDeviceIds,
    onDropdownOpen,
    compact = false
}: DeviceSelectorProps) {
    const { t } = useTranslation();
    const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);

    const showFull = !compact || isDeviceDropdownOpen;

    return (
        <div
            className="flex items-center gap-3 relative"
            onClick={() => isDeviceDropdownOpen && setIsDeviceDropdownOpen(false)}
        >
            <div
                className={clsx(
                    "flex items-center gap-2 bg-surface rounded-2xl border border-outline-variant/30 shadow-sm cursor-pointer hover:bg-surface-variant/30 transition-all select-none overflow-hidden",
                    showFull ? "px-3 py-1" : "p-1.5"
                )}
                onClick={(e) => {
                    e.stopPropagation();
                    if (!isDeviceDropdownOpen && onDropdownOpen) {
                        onDropdownOpen();
                    }
                    setIsDeviceDropdownOpen(!isDeviceDropdownOpen);
                }}
                title={!showFull ? t('run_tab.device.select') : undefined}
            >
                <Smartphone size={18} className={clsx("shrink-0", selectedDevices.length > 0 ? "text-primary" : "text-on-surface/80")} />

                {showFull && (
                    <>
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
                            {!loadingDevices ? <RefreshCw size={14} /> : <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-primary"></div>}
                        </Button>
                    </>
                )}
            </div>

            {/* Dropdown Panel */}
            <AnimatePresence>
                {isDeviceDropdownOpen && (
                    <StaggerContainer
                        className="absolute top-full right-0 mt-2 w-72 bg-surface backdrop-blur-md border border-outline-variant/30 rounded-2xl shadow-xl p-2 z-50 flex flex-col gap-1"
                        onClick={(e: React.MouseEvent) => e.stopPropagation()} // Prevent closing when clicking inside
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
    );
}

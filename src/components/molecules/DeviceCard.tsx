
import { Smartphone, Battery, Cpu, HardDrive, Wrench, Monitor, MoreVertical, Camera, RotateCw, Layout, MousePointer2, RefreshCcw, Move } from 'lucide-react';
import { Device } from '@/lib/types';
import { Button } from '@/components/atoms/Button';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { AndroidVersionPill } from '@/components/atoms/AndroidVersionPill';
import { DropdownMenu } from './DropdownMenu';

interface DeviceCardProps {
    device: Device;
    onMirror: (device: Device) => void;
    onToolbox: (device: Device) => void;
    onAction: (device: Device, action: string) => void;
}

export function DeviceCard({ device, onMirror, onToolbox, onAction }: DeviceCardProps) {
    const { t } = useTranslation();
    const isOnline = device.state === 'device';
    const batteryLevel = device.battery_level ?? 0;

    const formatMem = (kb: number) => {
        if (!kb) return '0 GB';
        const gb = kb / (1024 * 1024);
        return `${gb.toFixed(1)} GB`;
    };

    const getBatteryColor = (level: number) => {
        if (level > 60) return 'text-success';
        if (level > 20) return 'text-warning';
        return 'text-error';
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="group bg-surface/40 hover:bg-surface/75 border border-outline-variant/10 hover:border-primary/25 rounded-[32px] p-5 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5 flex gap-5 overflow-hidden relative"
        >
            {/* Background Accent */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-primary/10 transition-colors pointer-events-none" />

            {/* Left Side: Main Info & Stats */}
            <div className="flex-1 flex flex-col gap-5 relative z-10">
                {/* Header Info */}
                <div className="flex items-center gap-4">
                    <div className={clsx(
                        "w-16 h-16 rounded-[24px] flex items-center justify-center transition-all duration-500",
                        isOnline ? "bg-primary/10 text-primary shadow-inner shadow-primary/5 group-hover:scale-105 group-hover:rotate-3" : "bg-on-surface/5 text-on-surface-variant/40"
                    )}>
                        <Smartphone size={32} strokeWidth={1.5} />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="font-bold text-xl text-on-surface tracking-tight truncate leading-tight" title={device.model}>
                                {device.model || 'Unknown Device'}
                            </h3>
                            {/* UDID - Floating top right of content area */}
                            <div className="flex flex-col items-end opacity-0 group-hover:opacity-40 transition-all duration-500 translate-x-2 group-hover:translate-x-0 hidden sm:flex">
                                <span className="text-[11px] font-mono uppercase tracking-tighter">UDID</span>
                                <span className="text-[14px] font-mono bg-surface-variant/30 px-2 py-0.5 rounded-lg border border-outline-variant/10">
                                    {device.udid}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <div className={clsx(
                                "w-2.5 h-2.5 rounded-full",
                                isOnline ? "bg-success animate-pulse shadow-sm shadow-success/50" : "bg-on-surface-variant/40"
                            )} />
                            <span className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">
                                {isOnline ? t('common.online') : t('common.offline')}
                            </span>
                            {device.android_version && (
                                <AndroidVersionPill version={device.android_version} className="bg-surface-variant/50 ml-1 scale-90" />
                            )}
                        </div>
                    </div>
                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-surface-variant/10 rounded-2xl p-3 border border-outline-variant/10 flex items-center gap-3 hover:bg-surface-variant/20 transition-colors">
                        <div className={clsx("p-2 rounded-xl bg-surface/80 shadow-sm", getBatteryColor(batteryLevel))}>
                            <Battery size={18} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-on-surface-variant/50 uppercase font-bold tracking-wider leading-none mb-1">{t('home.device_card.battery')}</span>
                            <span className="text-sm font-bold text-on-surface/80">{batteryLevel}%</span>
                        </div>
                    </div>
                    <div className="bg-surface-variant/10 rounded-2xl p-3 border border-outline-variant/10 flex items-center gap-3 hover:bg-surface-variant/20 transition-colors">
                        <div className="p-2 rounded-xl bg-surface/80 text-primary shadow-sm">
                            <Cpu size={18} />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-[10px] text-on-surface-variant/50 uppercase font-bold tracking-wider leading-none mb-1">{t('home.device_card.ram')}</span>
                            <span className="text-sm font-bold text-on-surface/80 truncate">
                                {device.ram_used && device.ram_total ? (
                                    `${formatMem(device.ram_used)} / ${formatMem(device.ram_total)}`
                                ) : (
                                    device.state || t('common.offline')
                                )}
                            </span>
                        </div>
                    </div>
                    <div className="bg-surface-variant/10 rounded-2xl p-3 border border-outline-variant/10 flex items-center gap-3 hover:bg-surface-variant/20 transition-colors">
                        <div className="p-2 rounded-xl bg-surface/80 text-primary shadow-sm">
                            <HardDrive size={18} />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-[10px] text-on-surface-variant/50 uppercase font-bold tracking-wider leading-none mb-1">{t('home.device_card.storage')}</span>
                            <span className="text-sm font-bold text-on-surface/80 truncate">
                                {device.storage_used && device.storage_total ? (
                                    `${formatMem(device.storage_used)} / ${formatMem(device.storage_total)}`
                                ) : (
                                    device.state || t('common.offline')
                                )}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Side: Actions Column */}
            <div className="flex flex-col gap-2 justify-between items-center relative z-20 py-1">
                <DropdownMenu
                    align="right"
                    trigger={
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 rounded-xl border border-outline-variant/10 text-on-surface-variant/60 hover:bg-surface-variant/50 hover:text-primary transition-all active:scale-95"
                        >
                            <MoreVertical size={20} />
                        </Button>
                    }
                    items={[
                        {
                            label: t('home.device_menu.screenshot'),
                            icon: <Camera size={16} />,
                            onClick: () => onAction(device, 'screenshot')
                        },
                        {
                            label: t('home.device_menu.toggle_bounds'),
                            icon: <Layout size={16} />,
                            onClick: () => onAction(device, 'toggle_bounds')
                        },
                        {
                            label: t('home.device_menu.toggle_touches'),
                            icon: <MousePointer2 size={16} />,
                            onClick: () => onAction(device, 'toggle_touches')
                        },
                        {
                            label: t('home.device_menu.toggle_pointer'),
                            icon: <Move size={16} />,
                            onClick: () => onAction(device, 'toggle_pointer')
                        },
                        {
                            label: t('home.device_menu.refresh_info'),
                            icon: <RefreshCcw size={16} />,
                            onClick: () => onAction(device, 'refresh')
                        },
                        {
                            label: t('home.device_menu.reboot'),
                            icon: <RotateCw size={16} />,
                            variant: 'danger',
                            onClick: () => onAction(device, 'reboot')
                        }
                    ]}
                />

                <div className="flex flex-col gap-3">
                    <Button
                        onClick={() => onMirror(device)}
                        disabled={!isOnline}
                        variant="primary"
                        size="icon"
                        data-tooltip={t('home.actions.mirror')}
                        data-position="left"
                        className="h-10 w-10 rounded-xl shadow-lg shadow-primary/10 hover:shadow-primary/20 active:scale-90 transition-all"
                    >
                        <Monitor size={20} />
                    </Button>
                    <Button
                        onClick={() => onToolbox(device)}
                        disabled={!isOnline}
                        variant="secondary"
                        size="icon"
                        data-tooltip={t('home.actions.toolbox')}
                        data-position="left"
                        className="h-10 w-10 rounded-xl border-outline-variant/30 hover:bg-surface-variant/80 active:scale-90 transition-all"
                    >
                        <Wrench size={20} />
                    </Button>
                </div>
            </div>
        </motion.div>
    );
}

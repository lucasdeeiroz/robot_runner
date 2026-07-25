import React from 'react';
import { useTranslation } from 'react-i18next';
import { Rocket, AlertCircle, RefreshCcw, Play } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { CompanionStatus, CompanionDeviceInfo } from '@/hooks/useCompanion';
import clsx from 'clsx';

interface CompanionBadgeProps {
    status: CompanionStatus;
    variant?: 'default' | 'ghost';
    deviceInfo?: CompanionDeviceInfo | null;
    extraInfo?: React.ReactNode;
    showBattery?: boolean;
    onConnect?: () => void;
    onLaunch?: () => void;
    className?: string;
}

export function CompanionBadge({
    status,
    variant = 'default',
    deviceInfo,
    extraInfo,
    showBattery = false,
    onConnect,
    onLaunch,
    className
}: CompanionBadgeProps) {
    const { t } = useTranslation();

    if (variant === 'ghost') {
        const handleAction = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (onLaunch) {
                onLaunch();
            } else if (onConnect) {
                onConnect();
            }
        };
        const isClickable = Boolean(onLaunch || onConnect);

        if (status === 'connected') {
            return (
                <button
                    type="button"
                    onClick={handleAction}
                    disabled={!isClickable}
                    title={t('companion.connected_action', 'Companion Active — Click to launch & connect')}
                    className={clsx(
                        "inline-flex items-center justify-center p-0.5 rounded transition-transform select-none focus:outline-hidden",
                        isClickable ? "cursor-pointer hover:scale-110 active:scale-95" : "cursor-default",
                        className
                    )}
                >
                    <Rocket
                        size={14}
                        className="shrink-0 text-primary animate-pulse"
                    />
                </button>
            );
        }
        if (status === 'connecting') {
            return (
                <span
                    title={t('companion.connecting', 'Connecting...')}
                    className={clsx("inline-flex items-center select-none", className)}
                >
                    <RefreshCcw
                        size={14}
                        className="shrink-0 text-primary animate-spin"
                    />
                </span>
            );
        }
        if (status === 'disconnected') {
            return (
                <button
                    type="button"
                    onClick={handleAction}
                    disabled={!isClickable}
                    title={t('companion.launch_connect', 'Launch & Connect Companion')}
                    className={clsx(
                        "inline-flex items-center justify-center p-0.5 rounded transition-transform select-none focus:outline-hidden",
                        isClickable ? "cursor-pointer hover:scale-110 active:scale-95" : "cursor-default",
                        className
                    )}
                >
                    <Rocket
                        size={14}
                        className="shrink-0 text-primary/40 hover:text-primary transition-colors"
                    />
                </button>
            );
        }
        return (
            <button
                type="button"
                onClick={handleAction}
                disabled={!isClickable}
                title={t('companion.not_installed_action', 'Companion Not Installed — Click to setup')}
                className={clsx(
                    "inline-flex items-center justify-center p-0.5 rounded transition-transform select-none focus:outline-hidden",
                    isClickable ? "cursor-pointer hover:scale-110 active:scale-95" : "cursor-default",
                    className
                )}
            >
                <Rocket
                    size={14}
                    className="shrink-0 text-on-surface-variant/30 hover:text-on-surface-variant/60 transition-colors"
                />
            </button>
        );
    }

    if (status === 'connected') {
        return (
            <div className={clsx("inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-success/10 border border-success/30 text-success text-xs font-medium backdrop-blur-md shadow-sm select-none", className)}>
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                </span>
                <Rocket size={14} />
                <span>{t('companion.connected', 'Companion Active')}</span>
                {extraInfo !== undefined && (
                    <span className="text-[10px] text-success/80 font-mono font-semibold ml-1">
                        ({extraInfo})
                    </span>
                )}
                {extraInfo === undefined && showBattery && deviceInfo?.battery?.level !== undefined && (
                    <span className="text-[10px] text-success/80 font-semibold ml-1">
                        ({deviceInfo.battery.level}%)
                    </span>
                )}
            </div>
        );
    }

    if (status === 'connecting') {
        return (
            <div className={clsx("inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/30 text-primary text-xs font-medium select-none", className)}>
                <RefreshCcw size={14} className="animate-spin" />
                <span>{t('companion.connecting', 'Connecting...')}</span>
            </div>
        );
    }

    if (status === 'not_installed') {
        return (
            <div className={clsx("inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-surface-variant/30 border border-outline-variant/30 text-on-surface-variant text-xs select-none", className)}>
                <AlertCircle size={13} className="text-warning" />
                <span>{t('companion.not_installed', 'Companion Not Installed')}</span>
            </div>
        );
    }

    return (
        <div className={clsx("inline-flex items-center gap-2 px-2 py-1 rounded-xl bg-surface-variant/20 border border-outline-variant/30 text-on-surface-variant text-xs select-none", className)}>
            <Rocket size={13} />
            {onConnect ? (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onConnect}
                    className="!py-0.5 !px-2 !h-auto text-xs font-medium text-primary hover:text-primary-hover"
                >
                    {t('companion.connect', 'Connect Companion')}
                </Button>
            ) : (
                <span>{t('companion.disconnected', 'Companion Offline')}</span>
            )}
            {onLaunch && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onLaunch}
                    title={t('companion.launch', 'Launch Companion App')}
                    className="!py-0.5 !px-1.5 !h-auto text-xs text-on-surface-variant hover:text-on-surface"
                >
                    <Play size={12} />
                </Button>
            )}
        </div>
    );
}

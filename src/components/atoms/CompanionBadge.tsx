import { useTranslation } from 'react-i18next';
import { Smartphone, AlertCircle, RefreshCcw, Play } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { CompanionStatus, CompanionDeviceInfo } from '@/hooks/useCompanion';
import clsx from 'clsx';

interface CompanionBadgeProps {
    status: CompanionStatus;
    deviceInfo: CompanionDeviceInfo | null;
    onConnect: () => void;
    onLaunch: () => void;
    className?: string;
}

export function CompanionBadge({ status, deviceInfo, onConnect, onLaunch, className }: CompanionBadgeProps) {
    const { t } = useTranslation();

    if (status === 'connected') {
        return (
            <div className={clsx("inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-success/10 border border-success/30 text-success text-xs font-medium backdrop-blur-md shadow-sm", className)}>
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                </span>
                <Smartphone size={14} />
                <span>{t('companion.connected', 'Companion Active')}</span>
                {deviceInfo?.battery?.level !== undefined && (
                    <span className="text-[10px] text-success/80 font-semibold ml-1">
                        ({deviceInfo.battery.level}%)
                    </span>
                )}
            </div>
        );
    }

    if (status === 'connecting') {
        return (
            <div className={clsx("inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/30 text-primary text-xs font-medium", className)}>
                <RefreshCcw size={14} className="animate-spin" />
                <span>{t('companion.connecting', 'Connecting...')}</span>
            </div>
        );
    }

    if (status === 'not_installed') {
        return (
            <div className={clsx("inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-surface-variant/30 border border-outline-variant/30 text-on-surface-variant text-xs", className)}>
                <AlertCircle size={13} className="text-warning" />
                <span>{t('companion.not_installed', 'Companion Not Installed')}</span>
            </div>
        );
    }

    return (
        <div className={clsx("inline-flex items-center gap-2 px-2 py-1 rounded-xl bg-surface-variant/20 border border-outline-variant/30 text-on-surface-variant text-xs", className)}>
            <Smartphone size={13} />
            <Button
                variant="ghost"
                size="sm"
                onClick={onConnect}
                className="!py-0.5 !px-2 !h-auto text-xs font-medium text-primary hover:text-primary-hover"
            >
                {t('companion.connect', 'Connect Companion')}
            </Button>
            <Button
                variant="ghost"
                size="sm"
                onClick={onLaunch}
                title={t('companion.launch', 'Launch Companion App')}
                className="!py-0.5 !px-1.5 !h-auto text-xs text-on-surface-variant hover:text-on-surface"
            >
                <Play size={12} />
            </Button>
        </div>
    );
}

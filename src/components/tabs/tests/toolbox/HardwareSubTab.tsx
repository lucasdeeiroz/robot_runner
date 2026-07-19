import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { feedback } from '@/lib/feedback';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Switch } from '@/components/atoms/Switch';
import { Battery, BatteryWarning, Wifi, Send, Plane, Signal } from 'lucide-react';
import { Section } from '@/components/organisms/Section';

interface HardwareSubTabProps {
    selectedDevice: string | null;
    isTestRunning: boolean;
    allowActionsDuringTest: boolean;
}

export function HardwareSubTab({ selectedDevice, isTestRunning, allowActionsDuringTest }: HardwareSubTabProps) {
    const { t } = useTranslation();
    const disabled = !selectedDevice || (isTestRunning && !allowActionsDuringTest);

    const [batteryLevel, setBatteryLevel] = useState<number>(100);
    const [wifiEnabled, setWifiEnabled] = useState(true);
    const [dataEnabled, setDataEnabled] = useState(true);
    const [airplaneMode, setAirplaneMode] = useState(false);

    const [intentAction, setIntentAction] = useState('');
    const [intentExtras, setIntentExtras] = useState('');

    const setBattery = async (level: number) => {
        if (disabled) return;
        try {
            await invoke('adb_hardware_battery_set', { device: selectedDevice, level });
            feedback.toast.success(t('toolbox.hardware.battery.set_success', { level }));
        } catch (e) {
            feedback.toast.error(t('toolbox.hardware.battery.set_error', "Failed to set battery"), e);
        }
    };

    const unplugBattery = async () => {
        if (disabled) return;
        try {
            await invoke('adb_hardware_battery_unplug', { device: selectedDevice });
            feedback.toast.success(t('toolbox.hardware.battery.unplug_success', 'Battery unplugged'));
        } catch (e) {
            feedback.toast.error(t('toolbox.hardware.battery.unplug_error', "Failed to unplug battery"), e);
        }
    };

    const resetBattery = async () => {
        if (disabled) return;
        try {
            await invoke('adb_hardware_battery_reset', { device: selectedDevice });
            feedback.toast.success(t('toolbox.hardware.battery.reset_success', 'Battery status reset'));
        } catch (e) {
            feedback.toast.error(t('toolbox.hardware.battery.reset_error', "Failed to reset battery"), e);
        }
    };

    const toggleWifi = async (enable: boolean) => {
        if (disabled) return;
        try {
            await invoke('adb_hardware_network_wifi', { device: selectedDevice, enable });
            setWifiEnabled(enable);
            feedback.toast.success(t('toolbox.hardware.connectivity.wifi_success', 'WiFi toggled', { enable }));
        } catch (e) {
            feedback.toast.error(t('toolbox.hardware.connectivity.wifi_error', "Failed to toggle WiFi"), e);
        }
    };

    const toggleData = async (enable: boolean) => {
        if (disabled) return;
        try {
            await invoke('adb_hardware_network_data', { device: selectedDevice, enable });
            setDataEnabled(enable);
            feedback.toast.success(t('toolbox.hardware.connectivity.data_success', 'Mobile Data toggled', { enable }));
        } catch (e) {
            feedback.toast.error(t('toolbox.hardware.connectivity.data_error', "Failed to toggle Mobile Data"), e);
        }
    };

    const toggleAirplaneMode = async (enable: boolean) => {
        if (disabled) return;
        try {
            await invoke('adb_hardware_airplane_mode', { device: selectedDevice, enable });
            setAirplaneMode(enable);
            feedback.toast.success(t('toolbox.hardware.connectivity.airplane_success', 'Airplane mode toggled', { enable }));
        } catch (e) {
            feedback.toast.error(t('toolbox.hardware.connectivity.airplane_error', "Failed to toggle Airplane mode"), e);
        }
    };

    const sendBroadcast = async () => {
        if (disabled || !intentAction) return;
        try {
            const extrasList = intentExtras.split(' ').filter(x => x.trim().length > 0);
            await invoke('adb_hardware_send_broadcast', { device: selectedDevice, action: intentAction, extras: extrasList });
            feedback.toast.success(t('toolbox.hardware.broadcast.success', 'Broadcast sent'));
        } catch (e) {
            feedback.toast.error(t('toolbox.hardware.broadcast.error', "Failed to send broadcast"), e);
        }
    };

    if (!selectedDevice) {
        return (
            <div className="h-full flex items-center justify-center p-8 text-on-surface-variant/50">
                {t('toolbox.hardware.no_device', 'Select a device to use hardware controls')}
            </div>
        );
    }

    return (
        <div className="h-full w-full min-h-0 flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-4 grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-2 gap-6 items-start">
                {disabled && (
                    <div className="col-span-full p-3 bg-warning-container/20 text-on-warning-container text-sm rounded-xl border border-warning/30 flex items-center gap-2">
                        <BatteryWarning size={18} className="text-warning" />
                        {t('toolbox.hardware.disabled_during_test', 'Hardware controls are disabled while a test is running.')}
                    </div>
                )}

                {/* Network & Connectivity */}
                <Section
                    title={t('toolbox.hardware.device_controls.title', 'Device Controls')}
                    icon={Wifi}
                >
                    <div className="grid grid-cols-1 gap-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Wifi size={16} className="text-on-surface-variant" />
                                <span className="text-sm font-medium">{t('toolbox.hardware.device_controls.wifi', 'WiFi')}</span>
                            </div>
                            <Switch checked={wifiEnabled} onCheckedChange={toggleWifi} disabled={disabled} />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Signal size={16} className="text-on-surface-variant" />
                                <span className="text-sm font-medium">{t('toolbox.hardware.device_controls.mobile_data', 'Mobile Data')}</span>
                            </div>
                            <Switch checked={dataEnabled} onCheckedChange={toggleData} disabled={disabled} />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Plane size={16} className="text-on-surface-variant" />
                                <span className="text-sm font-medium">{t('toolbox.hardware.device_controls.airplane_mode', 'Airplane Mode')}</span>
                            </div>
                            <Switch checked={airplaneMode} onCheckedChange={toggleAirplaneMode} disabled={disabled} />
                        </div>
                        <div className='flex items-center justify-between'>
                            <div className='flex items-center gap-2'>
                                <Battery size={16} className="text-on-surface-variant" />
                                <span className="text-sm font-medium">{t('toolbox.hardware.device_controls.battery', 'Battery')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button size='sm' variant="secondary" onClick={resetBattery} disabled={disabled} title={t('toolbox.hardware.device_controls.reset_desc', 'Reset to physical state')} data-tooltip="adb shell dumpsys battery reset" data-position="bottom">{t('toolbox.hardware.device_controls.reset', 'Reset')}</Button>
                                <Button size='sm' variant="secondary" onClick={unplugBattery} disabled={disabled} title={t('toolbox.hardware.device_controls.unplug_desc', 'Simulate unplugged state')} data-tooltip="adb shell dumpsys battery unplug" data-position="bottom">{t('toolbox.hardware.device_controls.unplug', 'Unplug')}</Button>
                                <Input
                                    type="number"
                                    min={0} max={100}
                                    value={batteryLevel}
                                    onChange={(e) => setBatteryLevel(Number(e.target.value))}
                                    disabled={disabled}
                                    className="w-24"
                                />
                                <Button variant="primary" size='icon' onClick={() => setBattery(batteryLevel)} disabled={disabled} title={t('common.set', 'Set')} data-tooltip="adb shell dumpsys battery set level <value>" data-position="bottom">
                                    <Send size={16} className="cursor-pointer m-2" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </Section>

                {/* Broadcasts & Intents */}
                <Section
                    title={t('toolbox.hardware.broadcast.title', 'System Broadcasts')}
                    icon={Send}
                    actions={
                        <Button
                            variant="primary"
                            onClick={sendBroadcast}
                            disabled={disabled || !intentAction.trim()}
                            leftIcon={<Send size={16} />}
                            data-tooltip="adb shell am broadcast -a <action> <extras>"
                            data-position="left"
                        >
                            {t('toolbox.hardware.broadcast.send', 'Send Broadcast')}
                        </Button>
                    }
                >
                    <div className="flex flex-col gap-3">
                        <Input
                            placeholder="e.g. android.intent.action.BOOT_COMPLETED"
                            value={intentAction}
                            onChange={(e) => setIntentAction(e.target.value)}
                            disabled={disabled}
                            label={t('toolbox.hardware.broadcast.intent_action', 'Intent Action')}
                        />
                        <Input
                            placeholder="e.g. --es key value --ez boolean true"
                            value={intentExtras}
                            onChange={(e) => setIntentExtras(e.target.value)}
                            disabled={disabled}
                            label={t('toolbox.hardware.broadcast.extras', 'Extras (Optional)')}
                        />
                    </div>
                </Section>
            </div>
        </div>
    );
}

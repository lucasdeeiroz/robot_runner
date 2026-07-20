import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { feedback } from '@/lib/feedback';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Switch } from '@/components/atoms/Switch';
import { Select } from '@/components/atoms/Select';
import { Battery, BatteryWarning, Wifi, Send, Plane, Signal, Moon, BellOff, VolumeX, Smartphone, Monitor, Keyboard, Link2, Shield, Globe2, Home, ArrowLeft, Square, Power, Volume2, Volume1, Camera, Locate, Bell, HardDrive } from 'lucide-react';
import clsx from 'clsx';
import { Section } from '@/components/organisms/Section';
import { useSettings } from '@/lib/settings';
interface HardwareSubTabProps {
    selectedDevice: string | null;
    isTestRunning: boolean;
    allowActionsDuringTest: boolean;
}

export function HardwareSubTab({ selectedDevice, isTestRunning, allowActionsDuringTest }: HardwareSubTabProps) {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const disabled = !selectedDevice || (isTestRunning && !allowActionsDuringTest);

    const appPackages = settings.tools.appPackage.split(',').map(s => s.trim()).filter(Boolean);
    const [targetPackage, setTargetPackage] = useState(appPackages[0] || '');

    const [textInput, setTextInput] = useState('');
    const [deepLinkUri, setDeepLinkUri] = useState('');
    const [localeInput, setLocaleInput] = useState('en-US');

    const [batteryLevel, setBatteryLevel] = useState<number>(100);
    const [wifiEnabled, setWifiEnabled] = useState(true);
    const [dataEnabled, setDataEnabled] = useState(true);
    const [airplaneMode, setAirplaneMode] = useState(false);
    const [dndEnabled, setDndEnabled] = useState(false);
    const [darkMode, setDarkMode] = useState(false);
    const [autoRotate, setAutoRotate] = useState(true);
    const [rotation, setRotation] = useState("0");
    const [keepAwake, setKeepAwake] = useState(false);
    const [volumeMuted, setVolumeMuted] = useState(false);

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

    const toggleDnd = async (enable: boolean) => {
        if (disabled) return;
        try {
            await invoke('adb_hardware_dnd', { device: selectedDevice, enable });
            setDndEnabled(enable);
            feedback.toast.success(t('toolbox.hardware.device_controls.dnd_success', 'Do Not Disturb toggled', { enable }));
        } catch (e) {
            feedback.toast.error(t('toolbox.hardware.device_controls.dnd_error', "Failed to toggle DND"), e);
        }
    };

    const toggleDarkMode = async (enable: boolean) => {
        if (disabled) return;
        try {
            await invoke('adb_hardware_dark_mode', { device: selectedDevice, enable });
            setDarkMode(enable);
            feedback.toast.success(t('toolbox.hardware.device_controls.dark_mode_success', 'Dark Mode toggled', { enable }));
        } catch (e) {
            feedback.toast.error(t('toolbox.hardware.device_controls.dark_mode_error', "Failed to toggle Dark Mode"), e);
        }
    };

    const handleRotationChange = async (auto: boolean, rot: string) => {
        if (disabled) return;
        try {
            await invoke('adb_hardware_screen_rotation', { device: selectedDevice, autoRotate: auto, rotation: parseInt(rot) });
            setAutoRotate(auto);
            setRotation(rot);
            feedback.toast.success(t('toolbox.hardware.device_controls.rotation_success', 'Screen rotation updated'));
        } catch (e) {
            feedback.toast.error(t('toolbox.hardware.device_controls.rotation_error', "Failed to update screen rotation"), e);
        }
    };

    const toggleKeepAwake = async (enable: boolean) => {
        if (disabled) return;
        try {
            await invoke('adb_hardware_keep_awake', { device: selectedDevice, enable });
            setKeepAwake(enable);
            feedback.toast.success(t('toolbox.hardware.device_controls.keep_awake_success', 'Keep Awake toggled', { enable }));
        } catch (e) {
            feedback.toast.error(t('toolbox.hardware.device_controls.keep_awake_error', "Failed to toggle Keep Awake"), e);
        }
    };

    const toggleVolumeMute = async (mute: boolean) => {
        if (disabled) return;
        try {
            await invoke('adb_hardware_volume_mute', { device: selectedDevice, mute });
            setVolumeMuted(mute);
            feedback.toast.success(t('toolbox.hardware.device_controls.volume_success', 'Volume mute toggled', { mute }));
        } catch (e) {
            feedback.toast.error(t('toolbox.hardware.device_controls.volume_error', "Failed to toggle Volume Mute"), e);
        }
    };

    const sendText = async () => {
        if (disabled || !textInput) return;
        try {
            await invoke('adb_input_text', { device: selectedDevice, text: textInput });
            feedback.toast.success(t('toolbox.hardware.input.text_success', 'Text sent'));
        } catch (e) {
            feedback.toast.error(t('toolbox.hardware.input.text_error', "Failed to send text"), e);
        }
    };

    const sendKeyEvent = async (keycode: string) => {
        if (disabled) return;
        try {
            await invoke('adb_input_keyevent', { device: selectedDevice, keycode });
            feedback.toast.success(t('toolbox.hardware.input.key_success', 'Key event sent'));
        } catch (e) {
            feedback.toast.error(t('toolbox.hardware.input.key_error', "Failed to send key event"), e);
        }
    };

    const sendDeepLink = async () => {
        if (disabled || !deepLinkUri) return;
        try {
            await invoke('adb_hardware_deep_link', { device: selectedDevice, uri: deepLinkUri, package: targetPackage });
            feedback.toast.success(t('toolbox.hardware.deeplink.success', 'Deep Link sent'));
        } catch (e) {
            feedback.toast.error(t('toolbox.hardware.deeplink.error', "Failed to send Deep Link"), e);
        }
    };

    const togglePermission = async (permission: string, grant: boolean) => {
        if (disabled || !targetPackage) return;
        try {
            await invoke('adb_hardware_permission', { device: selectedDevice, package: targetPackage, permission, grant });
            feedback.toast.success(t('toolbox.hardware.permission.success', 'Permission updated'));
        } catch (e) {
            feedback.toast.error(t('toolbox.hardware.permission.error', "Failed to update permission"), e);
        }
    };

    const applyLocale = async () => {
        if (disabled || !localeInput) return;
        try {
            await invoke('adb_hardware_locale', { device: selectedDevice, locale: localeInput });
            feedback.toast.success(t('toolbox.hardware.locale.success', 'Locale updated (Restart app to apply)'));
        } catch (e) {
            feedback.toast.error(t('toolbox.hardware.locale.error', "Failed to update locale"), e);
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

    const [leftPaneWidth, setLeftPaneWidth] = useState<number>(50);
    const [isDragging, setIsDragging] = useState<boolean>(false);

    const containerRef = useRef<HTMLDivElement>(null);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        setIsDragging(true);
        e.preventDefault(); // prevent text selection while dragging
    }, []);

    useEffect(() => {
        if (!isDragging) return;

        const handlePointerMove = (e: PointerEvent) => {
            if (!containerRef.current) return;
            const containerRect = containerRef.current.getBoundingClientRect();
            let newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
            // Clamping the width between 25% and 75%
            newWidth = Math.max(25, Math.min(newWidth, 75));
            setLeftPaneWidth(newWidth);
        };

        const handlePointerUp = () => {
            setIsDragging(false);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [isDragging]);

    if (!selectedDevice) {
        return (
            <div className="h-full flex items-center justify-center p-8 text-on-surface-variant/50">
                {t('toolbox.hardware.no_device', 'Select a device to use hardware controls')}
            </div>
        );
    }

    return (
        <div className="h-full w-full min-h-0 flex-1 overflow-y-auto custom-scrollbar">
            <div
                ref={containerRef}
                className={clsx(
                    "p-4 flex flex-col xl:flex-row w-full h-full min-h-0 items-start",
                    isDragging && "select-none cursor-col-resize"
                )}
                style={{ '--left-width': `${leftPaneWidth}%` } as React.CSSProperties}
            >
                {disabled && (
                    <div className="absolute top-4 left-4 right-4 z-20 p-3 bg-warning-container/20 text-on-warning-container text-sm rounded-xl border border-warning/30 flex items-center gap-2">
                        <BatteryWarning size={18} className="text-warning" />
                        {t('toolbox.hardware.disabled_during_test', 'Hardware controls are disabled while a test is running.')}
                    </div>
                )}

                {/* Left Pane */}
                <div className="flex flex-col min-h-0 w-full xl:w-[var(--left-width)] shrink-0 overflow-y-auto overflow-x-hidden custom-scrollbar pr-0 xl:pr-4 gap-6">

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
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Moon size={16} className="text-on-surface-variant" />
                                    <span className="text-sm font-medium">{t('toolbox.hardware.device_controls.dark_mode', 'Dark Mode')}</span>
                                </div>
                                <Switch checked={darkMode} onCheckedChange={toggleDarkMode} disabled={disabled} />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Monitor size={16} className="text-on-surface-variant" />
                                    <span className="text-sm font-medium">{t('toolbox.hardware.device_controls.keep_awake', 'Keep Awake (Stay On)')}</span>
                                </div>
                                <Switch checked={keepAwake} onCheckedChange={toggleKeepAwake} disabled={disabled} />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <BellOff size={16} className="text-on-surface-variant" />
                                    <span className="text-sm font-medium">{t('toolbox.hardware.device_controls.dnd', 'Do Not Disturb')}</span>
                                </div>
                                <Switch checked={dndEnabled} onCheckedChange={toggleDnd} disabled={disabled} />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <VolumeX size={16} className="text-on-surface-variant" />
                                    <span className="text-sm font-medium">{t('toolbox.hardware.device_controls.mute', 'Mute Media Volume')}</span>
                                </div>
                                <Switch checked={volumeMuted} onCheckedChange={toggleVolumeMute} disabled={disabled} />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <Smartphone size={16} className="text-on-surface-variant" />
                                        <span className="text-sm font-medium">{t('toolbox.hardware.device_controls.rotation', 'Screen Rotation')}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-on-surface-variant">Auto</span>
                                        <Switch checked={autoRotate} onCheckedChange={(val) => handleRotationChange(val, rotation)} disabled={disabled} />
                                    </div>
                                    <Select
                                        value={rotation}
                                        onChange={(e) => handleRotationChange(autoRotate, e.target.value)}
                                        disabled={disabled || autoRotate}
                                        className="w-32 py-1.5 text-xs"
                                        options={[
                                            { label: t('toolbox.hardware.device_controls.portrait', 'Portrait'), value: '0' },
                                            { label: t('toolbox.hardware.device_controls.landscape', 'Landscape'), value: '1' },
                                            { label: t('toolbox.hardware.device_controls.rev_portrait', 'Rev. Portrait'), value: '2' },
                                            { label: t('toolbox.hardware.device_controls.rev_landscape', 'Rev. Landscape'), value: '3' }
                                        ]}
                                    />
                                </div>
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
                    {/* Input & Navigation */}
                    <Section
                        title={t('toolbox.hardware.input.title', 'Input & Navigation')}
                        icon={Keyboard}
                    >
                        <div className="flex flex-col gap-4">
                            <div className="flex gap-2">
                                <Input
                                    placeholder={t('toolbox.hardware.input.text_placeholder', 'Enter text to inject...')}
                                    value={textInput}
                                    onChange={(e) => setTextInput(e.target.value)}
                                    disabled={disabled}
                                    className="flex-1"
                                />
                                <Button variant="primary" onClick={sendText} disabled={disabled || !textInput} leftIcon={<Send size={16} />}>
                                    {t('toolbox.hardware.input.send_text', 'Send Text')}
                                </Button>
                            </div>
                            <div className="grid grid-cols-6 gap-2">
                                <Button variant="secondary" size="icon" onClick={() => sendKeyEvent('3')} disabled={disabled} title={t('toolbox.hardware.input.home', 'Home')}><Home size={16} /></Button>
                                <Button variant="secondary" size="icon" onClick={() => sendKeyEvent('4')} disabled={disabled} title={t('toolbox.hardware.input.back', 'Back')}><ArrowLeft size={16} /></Button>
                                <Button variant="secondary" size="icon" onClick={() => sendKeyEvent('187')} disabled={disabled} title={t('toolbox.hardware.input.recents', 'Recents')}><Square size={16} /></Button>
                                <Button variant="secondary" size="icon" onClick={() => sendKeyEvent('26')} disabled={disabled} title={t('toolbox.hardware.input.power', 'Power')}><Power size={16} /></Button>
                                <Button variant="secondary" size="icon" onClick={() => sendKeyEvent('24')} disabled={disabled} title={t('toolbox.hardware.input.volume_up', 'Volume Up')}><Volume2 size={16} /></Button>
                                <Button variant="secondary" size="icon" onClick={() => sendKeyEvent('25')} disabled={disabled} title={t('toolbox.hardware.input.volume_down', 'Volume Down')}><Volume1 size={16} /></Button>
                            </div>
                        </div>
                    </Section>

                    {/* Locale Override */}
                    <Section
                        title={t('toolbox.hardware.locale.title', 'Locale Override')}
                        icon={Globe2}
                    >
                        <div className="flex gap-2">
                            <Select
                                value={localeInput}
                                onChange={(e) => setLocaleInput(e.target.value)}
                                disabled={disabled}
                                className="flex-1"
                                options={[
                                    { label: 'English (US)', value: 'en-US' },
                                    { label: 'Portuguese (BR)', value: 'pt-BR' },
                                    { label: 'Spanish (ES)', value: 'es-ES' },
                                    { label: 'French (FR)', value: 'fr-FR' },
                                    { label: 'German (DE)', value: 'de-DE' }
                                ]}
                                dropdownPosition="top"
                            />
                            <Button variant="primary" onClick={applyLocale} disabled={disabled}>
                                {t('toolbox.hardware.locale.apply', 'Apply')}
                            </Button>
                        </div>
                    </Section>
                </div>

                {/* Splitter Divider */}
                <div
                    className="hidden xl:flex w-1 bg-outline-variant/30 hover:bg-primary/60 cursor-col-resize shrink-0 transition-colors z-10 shadow-[0_0_0_2px_transparent] hover:shadow-[0_0_0_2px_rgba(var(--color-primary),0.2)] self-stretch"
                    onPointerDown={handlePointerDown}
                />

                {/* Right Pane */}
                <div className="flex flex-col min-h-0 flex-1 pl-0 xl:pl-4 pt-6 xl:pt-0 gap-6 w-full">
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

                    {/* Deep Link Tester */}
                    <Section
                        title={t('toolbox.hardware.deeplink.title', 'Deep Link Tester')}
                        icon={Link2}
                    >
                        <div className="flex flex-col gap-3">
                            <Select
                                value={targetPackage}
                                onChange={(e) => setTargetPackage(e.target.value)}
                                disabled={disabled || appPackages.length === 0}
                                options={appPackages.map(pkg => ({ label: pkg, value: pkg }))}
                            />
                            <Input
                                placeholder="app://feature/123"
                                value={deepLinkUri}
                                onChange={(e) => setDeepLinkUri(e.target.value)}
                                disabled={disabled}
                                label={t('toolbox.hardware.deeplink.uri', 'Target URI')}
                            />
                            <Button variant="primary" onClick={sendDeepLink} disabled={disabled || !deepLinkUri}>
                                {t('toolbox.hardware.deeplink.send', 'Launch Deep Link')}
                            </Button>

                            {/* Permissions Toggles */}
                            <Section
                                title={t('toolbox.hardware.permission.title', 'Permissions')}
                                icon={Shield}
                            >
                                <div className="flex flex-col gap-4">
                                    <Select
                                        value={targetPackage}
                                        onChange={(e) => setTargetPackage(e.target.value)}
                                        disabled={disabled || appPackages.length === 0}
                                        options={appPackages.map(pkg => ({ label: pkg, value: pkg }))}
                                        dropdownPosition="top"
                                    />
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex items-center gap-2"><Camera size={16} /> {t('toolbox.hardware.permission.camera', 'Camera')}</div>
                                        <div className="flex gap-2 justify-end">
                                            <Button variant="secondary" onClick={() => togglePermission('android.permission.CAMERA', true)} disabled={disabled}>{t('toolbox.hardware.permission.grant', 'Grant')}</Button>
                                            <Button variant="outline" onClick={() => togglePermission('android.permission.CAMERA', false)} disabled={disabled}>{t('toolbox.hardware.permission.revoke', 'Revoke')}</Button>
                                        </div>
                                        <div className="flex items-center gap-2"><Locate size={16} /> {t('toolbox.hardware.permission.location', 'Location')}</div>
                                        <div className="flex gap-2 justify-end">
                                            <Button variant="secondary" onClick={() => togglePermission('android.permission.ACCESS_FINE_LOCATION', true)} disabled={disabled}>{t('toolbox.hardware.permission.grant', 'Grant')}</Button>
                                            <Button variant="outline" onClick={() => togglePermission('android.permission.ACCESS_FINE_LOCATION', false)} disabled={disabled}>{t('toolbox.hardware.permission.revoke', 'Revoke')}</Button>
                                        </div>
                                        <div className="flex items-center gap-2"><Bell size={16} /> {t('toolbox.hardware.permission.notifications', 'Notifications')}</div>
                                        <div className="flex gap-2 justify-end">
                                            <Button variant="secondary" onClick={() => togglePermission('android.permission.POST_NOTIFICATIONS', true)} disabled={disabled}>{t('toolbox.hardware.permission.grant', 'Grant')}</Button>
                                            <Button variant="outline" onClick={() => togglePermission('android.permission.POST_NOTIFICATIONS', false)} disabled={disabled}>{t('toolbox.hardware.permission.revoke', 'Revoke')}</Button>
                                        </div>
                                        <div className="flex items-center gap-2"><HardDrive size={16} /> {t('toolbox.hardware.permission.storage', 'Storage')}</div>
                                        <div className="flex gap-2 justify-end">
                                            <Button variant="secondary" onClick={() => togglePermission('android.permission.READ_EXTERNAL_STORAGE', true)} disabled={disabled}>{t('toolbox.hardware.permission.grant', 'Grant')}</Button>
                                            <Button variant="outline" onClick={() => togglePermission('android.permission.READ_EXTERNAL_STORAGE', false)} disabled={disabled}>{t('toolbox.hardware.permission.revoke', 'Revoke')}</Button>
                                        </div>
                                    </div>
                                </div>
                            </Section>
                        </div>
                    </Section>
                </div>
            </div>
        </div>
    );
}

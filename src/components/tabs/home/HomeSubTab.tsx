
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone, RefreshCw, History, Activity, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDevices } from '@/lib/deviceStore';
import { DeviceCard } from '@/components/molecules/DeviceCard';
import { HistoryCharts } from '@/components/organisms/HistoryCharts';
import { invoke } from '@tauri-apps/api/core';
import { TestLog, getCachedHistory, setCachedHistory } from '@/lib/historyCache';
import { useSettings } from '@/lib/settings';
import { feedback } from '@/lib/feedback';
import { logEvent } from '@/lib/analytics';
import { Button } from '@/components/atoms/Button';
import { ExpressiveLoading } from '@/components/atoms/ExpressiveLoading';
import { useTestSessions } from '@/lib/testSessionStore';
import { Device } from '@/lib/types';
import { useFileSave } from '@/hooks/useFileSave';
import { Shield, Power, Gauge, AlertTriangle, ArrowUpCircle } from 'lucide-react';
import { useRemoteConfig } from '@/lib/RemoteConfigProvider';
import semver from 'semver';
import pkg from '../../../../package.json';
import { Alert } from '@/components/atoms/Alert';

interface HomeSubTabProps {
    onNavigate: (page: string) => void;
}

export function HomeSubTab({ onNavigate }: HomeSubTabProps) {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const { devices, loading: loadingDevices, loadDevices } = useDevices();
    const [history, setHistory] = useState<TestLog[]>(getCachedHistory());
    const [loadingHistory, setLoadingHistory] = useState(false);
    const { addToolboxSession, setActiveSessionId } = useTestSessions();
    const [adbRunning, setAdbRunning] = useState(false);
    const [appiumRunning, setAppiumRunning] = useState(false);
    const [restartingAdb, setRestartingAdb] = useState(false);
    const [restartingAppium, setRestartingAppium] = useState(false);

    const screenshotSaver = useFileSave({
        fileType: 'Image',
        extensions: ['png'],
        defaultNamePrefix: 'screenshot',
        settingPathKey: 'screenshots'
    });

    // Monitor Server Status
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const adb = await invoke<boolean>('is_adb_server_running');
                setAdbRunning(adb);

                const appiumStatus = await invoke<{ running: boolean }>('get_appium_status', {
                    host: settings.appiumHost,
                    port: settings.appiumPort,
                    basePath: settings.appiumBasePath
                });
                setAppiumRunning(appiumStatus.running);
            } catch (e) {
                console.error('Failed to check server status', e);
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 3000);
        return () => clearInterval(interval);
    }, [settings.appiumHost, settings.appiumPort, settings.appiumBasePath]);

    // Auto-refresh devices every 5 seconds when this screen is active
    useEffect(() => {
        loadDevices();
        const interval = setInterval(() => {
            loadDevices();
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    // Load history once
    useEffect(() => {
        const fetchHistory = async () => {
            if (loadingHistory) return;
            setLoadingHistory(true);
            try {
                const logs = await invoke<TestLog[]>('get_test_history', {
                    customPath: settings.paths.logs || null,
                    refresh: false
                });
                setHistory(logs);
                setCachedHistory(logs);
            } catch (e) {
                console.error("Failed to load history for Home dashboard:", e);
            } finally {
                setLoadingHistory(false);
            }
        };
        fetchHistory();
    }, [settings.paths.logs]);

    const handleMirror = async (device: Device) => {
        try {
            await invoke('open_scrcpy', {
                device: device.udid,
                args: settings.tools.scrcpyArgs || null
            });
            feedback.toast.success('feedback.mirror_launched');
            logEvent('scrcpy_launched', { success: true });
        } catch (e: any) {
            feedback.toast.error("toolbox.scrcpy.open_error", e);
            logEvent('scrcpy_launch_error', { error_message: e?.message || String(e) });
        }
    };

    const handleToolbox = (device: Device) => {
        addToolboxSession(device.udid, device.model, device.model, device.android_version || undefined);
        setActiveSessionId(device.udid);
        onNavigate('tests');
    };

    const handleDeviceAction = async (device: Device, action: string) => {
        logEvent('device_action', { action_type: action });
        switch (action) {
            case 'screenshot':
                await screenshotSaver.saveFile(async (path) => {
                    await invoke('save_screenshot', { device: device.udid, path });
                }, 'feedback.screenshot_saved');
                break;
            case 'reboot':
                try {
                    await invoke('run_adb_command', { device: device.udid, args: ['reboot'] });
                    feedback.toast.success('home.device_menu.reboot_success');
                } catch (e) {
                    feedback.toast.error('home.device_menu.reboot_error', e);
                }
                break;
            case 'toggle_bounds':
                try {
                    const current = await invoke<string>('run_adb_command', {
                        device: device.udid,
                        args: ['shell', 'getprop', 'debug.layout']
                    });
                    const newValue = current.trim() === '1' || current.trim() === 'true' ? '0' : '1';
                    await invoke('run_adb_command', {
                        device: device.udid,
                        args: ['shell', 'setprop', 'debug.layout', newValue]
                    });
                    // For layout bounds, we need to trigger a redraw
                    await invoke('run_adb_command', {
                        device: device.udid,
                        args: ['shell', 'service', 'call', 'activity', '1599295570'] // Force refresh
                    });
                    feedback.toast.success('home.device_menu.bounds_toggled');
                } catch (e) {
                    feedback.toast.error('home.device_menu.action_error', e);
                }
                break;
            case 'toggle_touches':
                try {
                    const current = await invoke<string>('run_adb_command', {
                        device: device.udid,
                        args: ['shell', 'settings', 'get', 'system', 'show_touches']
                    });
                    const newValue = current.trim() === '1' ? '0' : '1';
                    await invoke('run_adb_command', {
                        device: device.udid,
                        args: ['shell', 'settings', 'put', 'system', 'show_touches', newValue]
                    });
                    feedback.toast.success('home.device_menu.touches_toggled');
                } catch (e) {
                    feedback.toast.error('home.device_menu.action_error', e);
                }
                break;
            case 'toggle_pointer':
                try {
                    const current = await invoke<string>('run_adb_command', {
                        device: device.udid,
                        args: ['shell', 'settings', 'get', 'system', 'pointer_location']
                    });
                    const newValue = current.trim() === '1' ? '0' : '1';
                    await invoke('run_adb_command', {
                        device: device.udid,
                        args: ['shell', 'settings', 'put', 'system', 'pointer_location', newValue]
                    });
                    feedback.toast.success('home.device_menu.pointer_toggled');
                } catch (e) {
                    feedback.toast.error('home.device_menu.action_error', e);
                }
                break;
            case 'refresh':
                loadDevices();
                break;
        }
    };

    const handleRestartADB = async () => {
        try {
            setRestartingAdb(true);
            await invoke('restart_adb_server');
            feedback.toast.success('settings.adb.restart_success');
            const adb = await invoke<boolean>('is_adb_server_running');
            setAdbRunning(adb);
            loadDevices();
        } catch (e) {
            feedback.toast.error('settings.adb.restart_error', e);
        } finally {
            setRestartingAdb(false);
        }
    };

    const handleStartAppium = async () => {
        try {
            setRestartingAppium(true);
            if (appiumRunning) {
                await invoke('stop_appium_server', {
                    host: settings.appiumHost,
                    port: settings.appiumPort
                });
            } else {
                await invoke('start_appium_server', {
                    host: settings.appiumHost,
                    port: settings.appiumPort,
                    basePath: settings.appiumBasePath,
                    args: settings.tools.appiumArgs
                });
            }
        } catch (e) {
            feedback.toast.error('home.actions.action_error', e);
        } finally {
            setRestartingAppium(false);
        }
    };

    const handleKillAllTests = async () => {
        try {
            await invoke('stop_test', { runId: 'all' });
            feedback.toast.success('home.actions.all_tests_stopped');
        } catch (e) {
            feedback.toast.error('home.actions.stop_error', e);
        }
    };

    const { getBool, getString } = useRemoteConfig();
    const isMaintenance = getBool('maintenance_mode');
    const minVersion = getString('min_app_version');
    const isUpdateRequired = !!(pkg.version && minVersion && semver.lt(pkg.version, minVersion));
    const showHomeStats = getBool('show_home_stats');

    return (
        <div className="flex flex-col gap-10 pb-12 pt-4">
            <AnimatePresence>
                {isMaintenance && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <Alert
                            variant="warning"
                            title={t('home.maintenance.title')}
                            icon={<AlertTriangle size={16} />}
                            className="rounded-[2rem] border-warning/20 bg-warning/5"
                        >
                            {t('home.maintenance.description', { version: minVersion })}
                        </Alert>
                    </motion.div>
                )}

                {isUpdateRequired && !isMaintenance && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <Alert
                            variant="info"
                            onClick={() => onNavigate('about')}
                            title={t('home.update.title')}
                            icon={<ArrowUpCircle size={16} />}
                            className="rounded-[2rem] border-primary/20 bg-primary/5"
                        >
                            {t('home.update.description', { version: minVersion })}
                        </Alert>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Quick Server Actions Bar */}
            <div className="flex items-center gap-4 bg-surface-variant/10 border border-outline-variant/20 rounded-3xl p-2 px-4 shadow-sm">
                <div className="flex items-center gap-2 px-2 border-r border-outline-variant/30 mr-2">
                    <Shield size={16} className="text-primary/60" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">{t('home.server_hub.title')}</span>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRestartADB}
                        disabled={restartingAdb}
                        className={`h-9 px-3 rounded-xl gap-2 transition-all ${adbRunning ? 'text-primary' : 'text-on-surface-variant/40'
                            } ${restartingAdb ? 'opacity-50' : 'hover:bg-primary/10'}`}
                        leftIcon={<RefreshCw size={14} className={restartingAdb ? 'animate-spin' : ''} />}
                    >
                        <span className="text-xs font-semibold">{t('home.server_hub.restart_adb')}</span>
                        {adbRunning && <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleStartAppium}
                        disabled={restartingAppium}
                        className={`h-9 px-3 rounded-xl gap-2 transition-all ${appiumRunning ? 'text-success' : 'text-on-surface-variant/40'
                            } ${restartingAppium ? 'opacity-50' : 'hover:bg-success/10'}`}
                        leftIcon={<Gauge size={14} className={restartingAppium ? 'animate-spin' : ''} />}
                    >
                        <span className="text-xs font-semibold">{t('home.server_hub.restart_appium')}</span>
                        {appiumRunning && <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />}
                    </Button>
                </div>

                <div className="ml-auto flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleKillAllTests}
                        className="h-9 px-3 rounded-xl gap-2 hover:bg-error/10 text-error/80"
                        leftIcon={<Power size={14} />}
                    >
                        <span className="text-xs font-semibold">{t('home.server_hub.kill_all')}</span>
                    </Button>
                </div>
            </div>
            {/* Devices Section */}
            <section className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                        <h3 className="text-base font-semibold text-on-surface/70">{t('home.sections.devices')}</h3>
                        <p className="text-[11px] text-on-surface-variant/40">{t('home.sections.devices_desc')}</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadDevices()}
                        className="rounded-2xl h-10 px-4 gap-2 hover:bg-surface-variant/30 text-on-surface-variant/80"
                    >
                        {loadingDevices ? (
                            <RefreshCw size={16} className="animate-spin text-primary" />
                        ) : (
                            <RefreshCw size={16} />
                        )}
                        <span className="font-semibold text-xs uppercase tracking-widest">{t('common.refresh')}</span>
                    </Button>
                </div>

                {devices.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-surface/30 border-2 border-dashed border-outline-variant/30 rounded-[2.5rem] p-12 flex flex-col items-center justify-center text-center gap-4"
                    >
                        <div className="w-20 h-20 rounded-full bg-on-surface/5 flex items-center justify-center text-on-surface-variant/20">
                            <Smartphone size={40} />
                        </div>
                        <div className="max-w-xs">
                            <h3 className="text-lg font-bold text-on-surface/70">{t('home.no_devices')}</h3>
                            <p className="text-sm text-on-surface-variant/50 mt-1">{t('home.no_devices_desc')}</p>
                        </div>
                        <Button
                            variant="secondary"
                            onClick={() => loadDevices()}
                            className="mt-2 rounded-2xl px-6"
                        >
                            {t('common.try_again')}
                        </Button>
                    </motion.div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-1 xl:grid-cols-2 gap-6">
                        <AnimatePresence mode="popLayout">
                            {devices.map((device) => (
                                <DeviceCard
                                    key={device.udid}
                                    device={device}
                                    onMirror={handleMirror}
                                    onToolbox={handleToolbox}
                                    onAction={handleDeviceAction}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </section>

            {/* Stats/History Section */}
            <AnimatePresence>
                {showHomeStats && (
                    <motion.section
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="flex flex-col gap-6"
                    >
                        <div className="flex flex-col">
                            <h3 className="text-base font-semibold text-on-surface/70">{t('home.sections.activity')}</h3>
                            <p className="text-[11px] text-on-surface-variant/40">{t('home.sections.activity_desc')}</p>
                        </div>

                        <div className="bg-surface/30 border border-outline-variant/20 rounded-[2.5rem] p-8 shadow-sm">
                            {loadingHistory ? (
                                <div className="h-64 flex flex-col items-center justify-center gap-4">
                                    <ExpressiveLoading variant="circular" size="md" />
                                    <p className="text-sm font-medium text-on-surface-variant/60 animate-pulse">{t('home.loading_stats')}</p>
                                </div>
                            ) : history.length > 0 ? (
                                <div className="flex flex-col gap-8">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        {/* Stats Summary */}
                                        <div className="bg-primary/5 rounded-3xl p-6 border border-primary/10 flex flex-col justify-between overflow-hidden relative group">
                                            <Zap size={80} className="absolute -right-4 -bottom-4 text-primary/5 group-hover:scale-110 transition-transform" />
                                            <span className="text-xs font-semibold text-primary/70 uppercase tracking-widest">{t('home.stats.total_runs')}</span>
                                            <div className="mt-4 flex items-baseline gap-2">
                                                <span className="text-4xl font-bold text-on-surface/80">{history.length}</span>
                                                <span className="text-[10px] font-semibold text-on-surface-variant/40 uppercase">{t('home.stats.executions')}</span>
                                            </div>
                                        </div>
                                        <div className="bg-success/5 rounded-3xl p-6 border border-success/10 flex flex-col justify-between overflow-hidden relative group">
                                            <div className="absolute -right-4 -bottom-4 text-success/5 group-hover:scale-110 transition-transform">
                                                <Activity size={80} />
                                            </div>
                                            <span className="text-xs font-semibold text-success/70 uppercase tracking-widest">{t('home.stats.success_rate')}</span>
                                            <div className="mt-4 flex items-baseline gap-2">
                                                <span className="text-4xl font-bold text-on-surface/80">
                                                    {Math.round((history.filter(h => h.status === 'PASS').length / history.length) * 100)}%
                                                </span>
                                                <span className="text-[10px] font-semibold text-on-surface-variant/40 uppercase">AVG</span>
                                            </div>
                                        </div>
                                        <div className="bg-secondary/5 rounded-3xl p-6 border border-secondary/10 flex flex-col justify-between overflow-hidden relative group">
                                            <History size={80} className="absolute -right-4 -bottom-4 text-secondary/5 group-hover:scale-110 transition-transform" />
                                            <span className="text-xs font-semibold text-secondary/70 uppercase tracking-widest">{t('home.stats.last_run')}</span>
                                            <div className="mt-4 flex flex-col">
                                                <span className="text-lg font-bold text-on-surface/80 truncate" title={history[0].suite_name}>
                                                    {history[0].suite_name}
                                                </span>
                                                <span className="text-[10px] font-medium text-on-surface-variant/40 mt-1">
                                                    {new Date(history[0].timestamp).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border-t border-outline-variant/20 pt-8">
                                        <HistoryCharts logs={history} groupBy="status" countMethod="suites" />
                                    </div>
                                </div>
                            ) : (
                                <div className="h-64 flex flex-col items-center justify-center text-center gap-4 opacity-40">
                                    <History size={48} />
                                    <p className="text-sm font-medium">{t('home.no_history')}</p>
                                </div>
                            )}
                        </div>
                    </motion.section>
                )}
            </AnimatePresence>
        </div>
    );
}

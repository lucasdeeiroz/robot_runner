import { useSettings } from "@/lib/settings";
import { Moon, Sun, Key, Globe, Server, Monitor, FolderOpen, Wrench, Play, Square, Terminal } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

export function SettingsPage() {
    const { settings, updateSetting, loading } = useSettings();
    const { t, i18n } = useTranslation();
    const [systemVersions, setSystemVersions] = useState<SystemVersions | null>(null);

    // Sync settings language with i18n
    useEffect(() => {
        if (settings.language && settings.language !== i18n.language) {
            const langMap: Record<string, string> = {
                'en_US': 'en',
                'pt_BR': 'pt',
                'es_ES': 'es'
            };
            i18n.changeLanguage(langMap[settings.language] || 'en');
        }
    }, [settings.language, i18n]);

    // Appium State
    const [appiumStatus, setAppiumStatus] = useState<{ running: boolean, pid?: number }>({ running: false });
    const [appiumLogs, setAppiumLogs] = useState<string[]>([]);
    const [showAppiumLogs, setShowAppiumLogs] = useState(false);
    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        invoke<SystemVersions>('get_system_versions')
            .then(setSystemVersions)
            .catch(err => console.error("Failed to fetch versions:", err));

        // Initial status check
        checkAppiumStatus();

        // Poll status every 2 seconds
        const interval = setInterval(checkAppiumStatus, 2000);

        // Listen for logs
        const unlistenPromise = listen<string>('appium-output', (event) => {
            setAppiumLogs(prev => {
                const newLogs = [...prev, event.payload];
                if (newLogs.length > 500) return newLogs.slice(-500); // Limit logs
                return newLogs;
            });
        });

        return () => {
            clearInterval(interval);
            unlistenPromise.then(unlisten => unlisten());
        };
    }, []);

    // Auto-scroll logs
    useEffect(() => {
        if (showAppiumLogs && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [appiumLogs, showAppiumLogs]);

    const checkAppiumStatus = async () => {
        try {
            const status = await invoke<{ running: boolean, pid?: number }>('get_appium_status');
            setAppiumStatus(status);
        } catch (e) {
            console.error(e);
        }
    };

    const toggleAppium = async () => {
        try {
            if (appiumStatus.running) {
                await invoke('stop_appium_server');
            } else {
                await invoke('start_appium_server', {
                    host: settings.appiumHost,
                    port: settings.appiumPort,
                    args: settings.tools.appiumArgs
                });
                setShowAppiumLogs(true);
            }
            checkAppiumStatus();
        } catch (e) {
            console.error('Failed to toggle appium:', e);
            alert(`Failed to toggle appium: ${e}`);
        }
    };

    const handleSelectFolder = async (key: keyof typeof settings.paths) => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                defaultPath: settings.paths[key] || undefined
            });
            if (selected) {
                updateSetting('paths', { ...settings.paths, [key]: selected as string });
            }
        } catch (err) {
            console.error("Failed to select folder", err);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-zinc-500">Loading settings...</div>;
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-12">
            <div>
                <h1 className="text-3xl font-bold mb-2">{t('settings.title')}</h1>
                <p className="text-zinc-400">{t('settings.description')}</p>
            </div>

            <div className="grid gap-6">
                {/* Appium Server Config & Control */}
                <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold flex items-center gap-2">
                            <Server size={20} className="text-green-400" /> {t('settings.appium.title')}
                        </h2>
                        <div className="flex items-center gap-2">
                            <div className={clsx("flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold",
                                appiumStatus.running ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-zinc-800 text-zinc-400 border border-zinc-700")}>
                                <div className={clsx("w-2 h-2 rounded-full", appiumStatus.running ? "bg-green-500" : "bg-zinc-500")} />
                                {appiumStatus.running ? t('settings.appium.running', { pid: appiumStatus.pid }) : t('settings.appium.stopped')}
                            </div>

                            <button
                                onClick={() => setShowAppiumLogs(!showAppiumLogs)}
                                className={clsx("p-2 rounded-md transition-colors", showAppiumLogs ? "bg-blue-500/20 text-blue-400" : "hover:bg-zinc-800 text-zinc-400")}
                                title={t('settings.appium.logs')}
                            >
                                <Terminal size={18} />
                            </button>

                            <button
                                onClick={toggleAppium}
                                className={clsx("flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all text-sm text-white shadow-lg",
                                    appiumStatus.running
                                        ? "bg-red-500 hover:bg-red-600 shadow-red-900/20"
                                        : "bg-green-600 hover:bg-green-700 shadow-green-900/20"
                                )}
                            >
                                {appiumStatus.running ? <><Square size={16} fill="currentColor" /> {t('settings.appium.stop')}</> : <><Play size={16} fill="currentColor" /> {t('settings.appium.start')}</>}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm text-zinc-400 mb-1">{t('settings.appium.host')}</label>
                            <input
                                type="text"
                                value={settings.appiumHost}
                                onChange={(e) => updateSetting('appiumHost', e.target.value)}
                                disabled={appiumStatus.running}
                                className="w-full bg-black/40 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-300 focus:border-blue-500 outline-none disabled:opacity-50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-zinc-400 mb-1">{t('settings.appium.port')}</label>
                            <input
                                type="number"
                                value={settings.appiumPort}
                                onChange={(e) => updateSetting('appiumPort', Number(e.target.value))}
                                disabled={appiumStatus.running}
                                className="w-full bg-black/40 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-300 focus:border-blue-500 outline-none disabled:opacity-50"
                            />
                        </div>
                    </div>

                    {/* Logs Output */}
                    {showAppiumLogs && (
                        <div className="mt-4 bg-black border border-zinc-800 rounded-lg p-3 font-mono text-xs h-64 overflow-auto">
                            {appiumLogs.length === 0 && <span className="text-zinc-600 italic">{t('settings.appium.waiting')}</span>}
                            {appiumLogs.map((log, i) => (
                                <div key={i} className="text-zinc-300 whitespace-pre-wrap border-b border-zinc-900/50 pb-0.5 mb-0.5">{log}</div>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    )}
                </section>

                {/* Path Configuration */}
                <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <FolderOpen size={20} className="text-orange-400" /> {t('settings.paths')}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(Object.keys(settings.paths) as Array<keyof typeof settings.paths>).map((key) => (
                            <div key={key}>
                                <label className="block text-sm text-zinc-400 mb-1 capitalize">{t('settings.dir_label', { key })}</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={settings.paths[key]}
                                        readOnly
                                        className="flex-1 bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-300 font-mono text-sm"
                                        placeholder={t('settings.not_set')}
                                    />
                                    <button
                                        onClick={() => handleSelectFolder(key)}
                                        className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors"
                                        title={t('settings.folder_select')}
                                    >
                                        <FolderOpen size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Tool Options */}
                <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <Wrench size={20} className="text-gray-400" /> {t('settings.tools')}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-zinc-400 mb-1">{t('settings.tool_config.appium_args')}</label>
                            <input
                                type="text"
                                value={settings.tools.appiumArgs}
                                onChange={(e) => updateSetting('tools', { ...settings.tools, appiumArgs: e.target.value })}
                                placeholder="--allow-insecure chromedriver_autodownload"
                                className="w-full bg-black/40 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-300 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-zinc-400 mb-1">{t('settings.tool_config.scrcpy_args')}</label>
                            <input
                                type="text"
                                value={settings.tools.scrcpyArgs}
                                onChange={(e) => updateSetting('tools', { ...settings.tools, scrcpyArgs: e.target.value })}
                                placeholder="--max-size 1024 --bit-rate 2M"
                                className="w-full bg-black/40 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-300 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-zinc-400 mb-1">{t('settings.tool_config.robot_args')}</label>
                            <input
                                type="text"
                                value={settings.tools.robotArgs}
                                onChange={(e) => updateSetting('tools', { ...settings.tools, robotArgs: e.target.value })}
                                placeholder="--loglevel DEBUG"
                                className="w-full bg-black/40 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-300 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-zinc-400 mb-1">{t('settings.tool_config.app_package')}</label>
                            <input
                                type="text"
                                value={settings.tools.appPackage}
                                onChange={(e) => updateSetting('tools', { ...settings.tools, appPackage: e.target.value })}
                                placeholder="com.example.app"
                                className="w-full bg-black/40 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-300 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div className="col-span-1 md:col-span-2">
                            <label className="block text-sm text-zinc-400 mb-1">{t('settings.tool_config.ngrok_token')}</label>
                            <input
                                type="password"
                                value={settings.tools.ngrokToken}
                                onChange={(e) => updateSetting('tools', { ...settings.tools, ngrokToken: e.target.value })}
                                placeholder="28... (Ngrok Authtoken)"
                                className="w-full bg-black/40 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-300 focus:border-blue-500 outline-none font-mono"
                            />
                        </div>
                    </div>
                </section>

                {/* Appearance & General */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <Moon size={20} className="text-purple-400" /> {t('settings.appearance.title')}
                        </h2>
                        <div className="flex items-center justify-between">
                            <span className="text-zinc-300">{t('settings.appearance.theme')}</span>
                            <div className="flex bg-zinc-800 p-1 rounded-lg">
                                <button
                                    onClick={() => updateSetting('theme', 'light')}
                                    className={`p-2 rounded-md transition-colors ${settings.theme === 'light' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                                >
                                    <Sun size={18} />
                                </button>
                                <button
                                    onClick={() => updateSetting('theme', 'dark')}
                                    className={`p-2 rounded-md transition-colors ${settings.theme === 'dark' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                                >
                                    <Moon size={18} />
                                </button>
                            </div>
                        </div>
                    </section>

                    <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <Globe size={20} className="text-blue-400" /> {t('settings.general')}
                        </h2>
                        <div>
                            <label className="block text-sm text-zinc-400 mb-1">{t('settings.language')}</label>
                            <select
                                value={settings.language}
                                onChange={(e) => updateSetting('language', e.target.value)}
                                className="w-full bg-black/40 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-300 focus:border-blue-500 outline-none"
                            >
                                <option value="en_US">English (US)</option>
                                <option value="pt_BR">Português (Brasil)</option>
                                <option value="es_ES">Español</option>
                            </select>
                        </div>
                    </section>
                </div>

                {/* AI Integration */}
                <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <Key size={20} className="text-yellow-400" /> {t('settings.ai.title')}
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-zinc-400 mb-1">{t('settings.ai.key')}</label>
                            <input
                                type="password"
                                value={settings.geminiApiKey}
                                onChange={(e) => updateSetting('geminiApiKey', e.target.value)}
                                placeholder={t('settings.ai.placeholder')}
                                className="w-full bg-black/40 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-300 focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>
                </section>

                {/* System Versions */}
                <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <Monitor size={20} className="text-pink-400" /> {t('settings.system.title')}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {systemVersions ? (
                            Object.entries(systemVersions).map(([key, value]) => (
                                <div key={key} className="bg-black/20 p-3 rounded-lg border border-zinc-800/50">
                                    <span className="block text-xs uppercase text-zinc-500 font-bold mb-1">{key}</span>
                                    <span className="text-sm font-mono text-zinc-300 truncate block" title={value}>{value}</span>
                                </div>
                            ))
                        ) : (
                            <div className="text-zinc-500 italic col-span-full">{t('settings.system.checking')}</div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}

interface SystemVersions {
    adb: string;
    node: string;
    python: string;
    scrcpy: string;
    appium: string;
    robot: string;
    uiautomator2: string;
}

import { useSettings } from "@/lib/settings";
import { Moon, Sun, Key, Globe, Server, Monitor, FolderOpen, Wrench, Play, Square, Terminal, Users, Plus, Edit2, Trash2 } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

export function SettingsPage() {
    const { settings, updateSetting, loading, profiles, activeProfileId, createProfile, switchProfile, renameProfile, deleteProfile, systemVersions, checkSystemVersions } = useSettings();
    const { t, i18n } = useTranslation();

    // Profile Management Details
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [newProfileName, setNewProfileName] = useState("");
    const [isRenaming, setIsRenaming] = useState(false);

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
        // Cached System Versions
        checkSystemVersions();

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

    // ... rest of the component


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

    const handleProfileSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProfileName.trim()) return;

        if (isRenaming) {
            renameProfile(activeProfileId, newProfileName);
        } else {
            createProfile(newProfileName);
        }
        setShowProfileModal(false);
        setNewProfileName("");
        setIsRenaming(false);
    };

    if (loading) {
        return <div className="p-8 text-center text-zinc-500">Loading settings...</div>;
    }

    // ... imports remain the same

    // To save space in this Replace call, I will rewrite the render return primarily.
    // Since ReplaceFileContent replaces a block, I'll target the main return statement.

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-12">
            <div className="flex items-center justify-between">
            </div>

            {/* Profile Manager Section */}
            <section className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold flex items-center gap-2 text-gray-900 dark:text-white tracking-tight">
                        <Users size={20} className="text-purple-500" />
                        {t('settings.profiles.title')}
                    </h2>
                    <div className="flex items-center gap-2">
                        <select
                            value={activeProfileId}
                            onChange={(e) => switchProfile(e.target.value)}
                            className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-sm min-w-[150px] outline-none focus:ring-2 focus:ring-blue-500/20 text-gray-900 dark:text-zinc-100"
                        >
                            {profiles.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.id === 'default' && p.name === 'Default' ? t('settings.profiles.default') : p.name}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={() => { setIsRenaming(false); setNewProfileName(""); setShowProfileModal(true); }}
                            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all active:scale-95 text-zinc-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
                            title={t('settings.profiles.create')}
                        >
                            <Plus size={18} />
                        </button>
                        <button
                            onClick={() => { setIsRenaming(true); setNewProfileName(profiles.find(p => p.id === activeProfileId)?.name || ""); setShowProfileModal(true); }}
                            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all active:scale-95 text-zinc-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
                            title={t('settings.profiles.rename')}
                        >
                            <Edit2 size={18} />
                        </button>
                        {profiles.length > 1 && (
                            <button
                                onClick={() => {
                                    if (confirm(t('settings.profiles.confirm_delete'))) deleteProfile(activeProfileId);
                                }}
                                className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 rounded-xl transition-all active:scale-95"
                                title={t('settings.profiles.delete')}
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>
                </div>
            </section>

            {/* Modal for Create/Rename */}
            {showProfileModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <form onSubmit={handleProfileSubmit} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 w-full max-w-sm shadow-2xl">
                        <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white tracking-tight">
                            {isRenaming ? t('settings.profiles.rename') : t('settings.profiles.create')}
                        </h3>
                        <input
                            autoFocus
                            type="text"
                            value={newProfileName}
                            onChange={(e) => setNewProfileName(e.target.value)}
                            placeholder={t('settings.profiles.name_placeholder')}
                            className="w-full bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 mb-4 outline-none focus:ring-2 focus:ring-blue-500/20 text-gray-900 dark:text-zinc-100"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowProfileModal(false)}
                                className="px-4 py-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={!newProfileName.trim()}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50 transition-all active:scale-95"
                            >
                                {t('common.save')}
                            </button>
                        </div>
                    </form>
                </div>
            )}


            <div className="grid gap-6">
                {/* Appium Server Config & Control */}
                <section className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold flex items-center gap-2 text-gray-900 dark:text-white tracking-tight">
                            <Server size={20} className="text-green-500" /> {t('settings.appium.title')}
                        </h2>
                        <div className="flex items-center gap-2">
                            <div className={clsx("flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border",
                                appiumStatus.running
                                    ? "bg-green-50 text-green-600 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20"
                                    : "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700")}>
                                <div className={clsx("w-2 h-2 rounded-full", appiumStatus.running ? "bg-green-500" : "bg-zinc-400")} />
                                {appiumStatus.running ? t('settings.appium.running', { pid: appiumStatus.pid }) : t('settings.appium.stopped')}
                            </div>

                            <button
                                onClick={() => setShowAppiumLogs(!showAppiumLogs)}
                                className={clsx("p-2 rounded-xl transition-all active:scale-95", showAppiumLogs ? "bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400" : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400")}
                                title={t('settings.appium.logs')}
                            >
                                <Terminal size={18} />
                            </button>

                            <button
                                onClick={toggleAppium}
                                className={clsx("flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all text-sm text-white shadow-lg active:scale-95",
                                    appiumStatus.running
                                        ? "bg-red-500 hover:bg-red-600 shadow-red-500/20"
                                        : "bg-green-600 hover:bg-green-700 shadow-green-500/20"
                                )}
                            >
                                {appiumStatus.running ? <><Square size={16} fill="currentColor" /> {t('settings.appium.stop')}</> : <><Play size={16} fill="currentColor" /> {t('settings.appium.start')}</>}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1">{t('settings.appium.host')}</label>
                            <input
                                type="text"
                                value={settings.appiumHost}
                                onChange={(e) => updateSetting('appiumHost', e.target.value)}
                                disabled={appiumStatus.running}
                                className="w-full bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-gray-900 dark:text-zinc-300 focus:ring-2 focus:ring-blue-500/20 outline-none disabled:opacity-50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1">{t('settings.appium.port')}</label>
                            <input
                                type="number"
                                value={settings.appiumPort}
                                onChange={(e) => updateSetting('appiumPort', Number(e.target.value))}
                                disabled={appiumStatus.running}
                                className="w-full bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-gray-900 dark:text-zinc-300 focus:ring-2 focus:ring-blue-500/20 outline-none disabled:opacity-50"
                            />
                        </div>
                    </div>

                    {/* Logs Output */}
                    {showAppiumLogs && (
                        <div className="mt-4 bg-zinc-900 border border-zinc-800 rounded-xl p-3 font-mono text-xs h-64 overflow-auto custom-scrollbar shadow-inner">
                            {appiumLogs.length === 0 && <span className="text-zinc-500 italic">{t('settings.appium.waiting')}</span>}
                            {appiumLogs.map((log, i) => (
                                <div key={i} className="text-zinc-300 whitespace-pre-wrap border-b border-zinc-800/50 pb-0.5 mb-0.5">{log}</div>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    )}
                </section>

                {/* Path Configuration */}
                <section className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white tracking-tight">
                        <FolderOpen size={20} className="text-orange-500" /> {t('settings.paths')}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(Object.keys(settings.paths) as Array<keyof typeof settings.paths>).map((key) => (
                            <div key={key}>
                                <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1 capitalize">{t(`settings.path_labels.${key}` as any)}</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={settings.paths[key]}
                                        readOnly
                                        className="flex-1 bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-gray-900 dark:text-zinc-300 font-mono text-xs sm:text-sm"
                                        placeholder={t('settings.not_set')}
                                    />
                                    <button
                                        onClick={() => handleSelectFolder(key)}
                                        className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl text-zinc-600 dark:text-zinc-300 transition-all active:scale-95"
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
                <section className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white tracking-tight">
                        <Wrench size={20} className="text-blue-500" /> {t('settings.tools')}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {['appiumArgs', 'scrcpyArgs', 'robotArgs', 'appPackage'].map((key) => (
                            <div key={key}>
                                <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1">{t(`settings.tool_config.${key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)}` as any)}</label>
                                <input
                                    type="text"
                                    value={(settings.tools as any)[key]}
                                    onChange={(e) => updateSetting('tools', { ...settings.tools, [key]: e.target.value })}
                                    className="w-full bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-gray-900 dark:text-zinc-300 focus:ring-2 focus:ring-blue-500/20 outline-none"
                                />
                            </div>
                        ))}
                        <div className="col-span-1 md:col-span-2">
                            <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1">{t('settings.tool_config.ngrok_token')}</label>
                            <input
                                type="password"
                                value={settings.tools.ngrokToken}
                                onChange={(e) => updateSetting('tools', { ...settings.tools, ngrokToken: e.target.value })}
                                placeholder="28... (Ngrok Authtoken)"
                                className="w-full bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-gray-900 dark:text-zinc-300 focus:ring-2 focus:ring-blue-500/20 outline-none font-mono"
                            />
                        </div>
                    </div>
                </section>

                {/* Appearance & General */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <section className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white tracking-tight">
                            <Moon size={20} className="text-purple-500" /> {t('settings.appearance.title')}
                        </h2>
                        <div className="flex items-center justify-between">
                            <span className="text-zinc-600 dark:text-zinc-300">{t('settings.appearance.theme')}</span>
                            <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
                                <button
                                    onClick={() => updateSetting('theme', 'light')}
                                    className={`p-2 rounded-lg transition-all active:scale-95 ${settings.theme === 'light' ? 'bg-white shadow text-blue-600' : 'text-zinc-400 hover:text-gray-900 dark:hover:text-white'}`}
                                >
                                    <Sun size={18} />
                                </button>
                                <button
                                    onClick={() => updateSetting('theme', 'dark')}
                                    className={`p-2 rounded-lg transition-all active:scale-95 ${settings.theme === 'dark' ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-gray-900 dark:hover:text-white'}`}
                                >
                                    <Moon size={18} />
                                </button>
                            </div>
                        </div>
                    </section>

                    <section className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white tracking-tight">
                            <Globe size={20} className="text-blue-500" /> {t('settings.general')}
                        </h2>
                        <div>
                            <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1">{t('settings.language')}</label>
                            <select
                                value={settings.language}
                                onChange={(e) => updateSetting('language', e.target.value)}
                                className="w-full bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-gray-900 dark:text-zinc-300 focus:ring-2 focus:ring-blue-500/20 outline-none"
                            >
                                <option value="en_US">English (US)</option>
                                <option value="pt_BR">Português (Brasil)</option>
                                <option value="es_ES">Español</option>
                            </select>
                        </div>
                    </section>
                </div>

                {/* AI Integration */}
                <section className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white tracking-tight">
                        <Key size={20} className="text-yellow-500" /> {t('settings.ai.title')}
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1">{t('settings.ai.key')}</label>
                            <input
                                type="password"
                                value={settings.geminiApiKey}
                                onChange={(e) => updateSetting('geminiApiKey', e.target.value)}
                                placeholder={t('settings.ai.placeholder')}
                                className="w-full bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-gray-900 dark:text-zinc-300 focus:ring-2 focus:ring-blue-500/20 outline-none"
                            />
                        </div>
                    </div>
                </section>

                {/* System Versions */}
                <section className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white tracking-tight">
                        <Monitor size={20} className="text-pink-500" /> {t('settings.system.title')}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {systemVersions ? (
                            Object.entries(systemVersions).map(([key, value]) => (
                                <div key={key} className="bg-zinc-50 dark:bg-black/20 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50">
                                    <span className="block text-xs uppercase text-zinc-500 font-bold mb-1">{key}</span>
                                    <span className="text-sm font-mono text-gray-900 dark:text-zinc-300 truncate block" title={value}>{value}</span>
                                </div>
                            ))
                        ) : (
                            <div className="text-zinc-400 italic col-span-full">{t('settings.system.checking')}</div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}



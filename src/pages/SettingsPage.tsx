import { useSettings } from "@/lib/settings";
import { Moon, Sun, Globe, Server, Monitor, FolderOpen, Wrench, Play, Square, Terminal, Users, Plus, Edit2, Trash2, Settings as SettingsIcon } from "lucide-react";
import { Switch } from "@/components/atoms/Switch";
import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { feedback } from "@/lib/feedback";
import { TOOL_LINKS } from "@/lib/tools";
import { Modal } from "@/components/organisms/Modal";
import { ConfirmationModal } from "@/components/organisms/ConfirmationModal";

// Atoms
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { Section } from "@/components/organisms/Section";
import { PageHeader } from "@/components/organisms/PageHeader";

// New Components
import { Select } from "@/components/atoms/Select";
import { PathInput } from "@/components/molecules/PathInput";
import { TagInput } from "@/components/molecules/TagInput";
import { SegmentedControl } from "@/components/molecules/SegmentedControl";
import { InfoCard } from "@/components/molecules/InfoCard";

export function SettingsPage() {
    const { settings, updateSetting, loading, profiles, activeProfileId, createProfile, switchProfile, renameProfile, deleteProfile, systemVersions, checkSystemVersions, systemCheckStatus, isNgrokEnabled } = useSettings();
    const { t, i18n } = useTranslation();

    // Profile Management Details
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [newProfileName, setNewProfileName] = useState("");
    const [isRenaming, setIsRenaming] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

    // Responsive State
    const containerRef = useRef<HTMLDivElement>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setIsNarrow(entry.contentRect.width < 768);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

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

    const handleLogoUpload = async (key: 'customLogoLight' | 'customLogoDark') => {
        try {
            const selected = await open({
                filters: [{ name: 'Image', extensions: ['png', 'jpg', 'svg'] }]
            });
            if (selected) {
                const path = selected as string;
                try {
                    // Read file content immediately while we have dynamic permission
                    // We store the Base64 string to bypass filesystem permission issues on restart
                    const data = await readFile(path);

                    const base64 = btoa(
                        new Uint8Array(data).reduce((data, byte) => data + String.fromCharCode(byte), '')
                    );

                    const ext = path.split('.').pop()?.toLowerCase();
                    const mime = ext === 'svg' ? 'image/svg+xml' : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png';
                    const dataUri = `data:${mime};base64,${base64}`;

                    updateSetting(key, dataUri);
                } catch (readErr) {
                    feedback.toast.error("settings.logo.read_error");
                }
            }
        } catch (e) {
            feedback.toast.error("settings.logo.select_error", e);
        }
    };

    // Appium State
    const [appiumStatus, setAppiumStatus] = useState<{ running: boolean, pid?: number }>({ running: false });
    const [appiumLogs, setAppiumLogs] = useState<string[]>([]);
    const [showAppiumLogs, setShowAppiumLogs] = useState(false);
    const logsContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Cached System Versions
        if (!systemVersions) {
            checkSystemVersions();
        }

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
        if (showAppiumLogs && logsContainerRef.current) {
            logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
        }
    }, [appiumLogs, showAppiumLogs]);

    const checkAppiumStatus = async () => {
        try {
            const status = await invoke<{ running: boolean, pid?: number }>('get_appium_status');
            setAppiumStatus(status);
        } catch (e) {
            feedback.toast.error("settings.appium.status_error", e);
        }
    };

    const toggleAppium = async () => {
        try {
            if (appiumStatus.running) {
                await invoke('stop_appium_server');
                feedback.toast.info('feedback.appium_stopped');
            } else {
                await invoke('start_appium_server', {
                    host: settings.appiumHost,
                    port: settings.appiumPort,
                    args: settings.tools.appiumArgs
                });
                setShowAppiumLogs(true);
                feedback.toast.success('feedback.appium_started');
            }
            checkAppiumStatus();
        } catch (e: any) {
            let errStr = String(e).replace(/^Error:/, '').trim();
            feedback.toast.error('common.error_occurred', { error: errStr });
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

    const handleDeleteClick = (profileId: string) => {
        setShowDeleteConfirm(profileId);
    };

    const confirmDeleteInfo = () => {
        if (showDeleteConfirm) {
            deleteProfile(showDeleteConfirm);
            setShowDeleteConfirm(null);
            feedback.toast.success(t('feedback.success'));
        }
    };

    return (
        <div ref={containerRef} className="space-y-4 animate-in fade-in duration-500 pb-12">
            {/* Delete Confirmation Modal */}
            <ConfirmationModal
                isOpen={!!showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(null)}
                onConfirm={confirmDeleteInfo}
                title={t('settings.profiles.delete')}
                description={t('settings.profiles.confirm_delete')}
                confirmText={t('common.delete')}
            />

            {/* Page Header */}
            <PageHeader
                title={t('sidebar.settings')}
                description={t('sidebar.description_settings')}
                icon={SettingsIcon}
                iconSize="xl"
            />

            {/* Profile Manager Section */}
            <Section
                title={t('settings.profiles.title')}
                icon={Users}
                menus={
                    <Select
                        options={profiles.map(p => ({
                            label: p.id === 'default' && p.name === 'Default' ? t('settings.profiles.default') : p.name,
                            value: p.id
                        }))}
                        value={activeProfileId}
                        onChange={(e) => { switchProfile(e.target.value); feedback.toast.success('feedback.profile_changed'); }}
                        containerClassName="w-[180px]"
                    />
                }
                actions={
                    <>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setIsRenaming(false); setNewProfileName(""); setShowProfileModal(true); }}
                            leftIcon={<Plus size={16} />}
                        >
                            {!isNarrow && t('settings.profiles.create')}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setIsRenaming(true); setNewProfileName(profiles.find(p => p.id === activeProfileId)?.name || ""); setShowProfileModal(true); }}
                            leftIcon={<Edit2 size={16} />}
                        >
                            {!isNarrow && t('settings.profiles.rename')}
                        </Button>
                        {profiles.length > 1 && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteClick(activeProfileId)}
                                className="text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                                <Trash2 size={16} />
                            </Button>
                        )}
                    </>
                }
            />

            {/* Modal for Create/Rename */}
            <Modal
                isOpen={showProfileModal}
                onClose={() => setShowProfileModal(false)}
                title={isRenaming ? t('settings.profiles.rename') : t('settings.profiles.create')}
            >
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                    <input
                        autoFocus
                        type="text"
                        value={newProfileName}
                        onChange={(e) => setNewProfileName(e.target.value)}
                        placeholder={t('settings.profiles.name_placeholder')}
                        className="w-full bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-primary/20 text-gray-900 dark:text-zinc-100"
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
                            className="px-4 py-2 bg-primary hover:opacity-90 text-white rounded-xl disabled:opacity-50 transition-all active:scale-95"
                        >
                            {t('common.save')}
                        </button>
                    </div>
                </form>
            </Modal>

            <div className="grid gap-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Appium Server Config & Control */}
                    <Section
                        title={t('settings.appium.title')}
                        icon={Server}
                        status={
                            <div className={clsx("flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border",
                                appiumStatus.running
                                    ? "bg-green-50 text-green-600 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20"
                                    : "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700")}>
                                <div className={clsx("w-2 h-2 rounded-full", appiumStatus.running ? "bg-green-500" : "bg-zinc-400")} />
                                {appiumStatus.running ? t('settings.appium.running', { pid: appiumStatus.pid }) : t('settings.appium.stopped')}
                            </div>
                        }
                        actions={
                            <>
                                <button
                                    onClick={() => setShowAppiumLogs(!showAppiumLogs)}
                                    className={clsx("p-2 rounded-xl transition-all active:scale-95", showAppiumLogs ? "bg-primary/10 text-primary" : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400")}
                                    title={t('settings.appium.logs')}
                                    disabled={!appiumStatus.running && systemCheckStatus?.missingAppium?.length > 0}
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
                                    disabled={!appiumStatus.running && systemCheckStatus?.missingAppium?.length > 0}
                                >
                                    {appiumStatus.running ? <><Square size={16} fill="currentColor" /> {!isNarrow && t('settings.appium.stop')}</> : <><Play size={16} fill="currentColor" /> {!isNarrow && t('settings.appium.start')}</>}
                                </button>
                            </>
                        }
                    >

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div title={settings.tools.appiumArgs && systemCheckStatus?.missingAppium?.length > 0 ? "Appium dependencies missing" : ""}>
                                <Input
                                    label={t('settings.appium.host')}
                                    type="text"
                                    value={settings.appiumHost}
                                    onChange={(e) => updateSetting('appiumHost', e.target.value)}
                                    disabled={appiumStatus.running || systemCheckStatus?.missingAppium?.length > 0}
                                />
                            </div>
                            <div title={settings.tools.appiumArgs && systemCheckStatus?.missingAppium?.length > 0 ? "Appium dependencies missing" : ""}>
                                <Input
                                    label={t('settings.appium.port')}
                                    type="number"
                                    value={settings.appiumPort}
                                    onChange={(e) => updateSetting('appiumPort', Number(e.target.value))}
                                    disabled={appiumStatus.running || systemCheckStatus?.missingAppium?.length > 0}
                                />
                            </div>
                        </div>
                        <div className="mb-4">
                            <div title={settings.tools.appiumArgs && systemCheckStatus?.missingAppium?.length > 0 ? "Appium dependencies missing" : ""}>
                                <Input
                                    label={t('settings.tool_config.appium_args')}
                                    type="text"
                                    value={settings.tools.appiumArgs}
                                    onChange={(e) => updateSetting('tools', { ...settings.tools, appiumArgs: e.target.value })}
                                    disabled={appiumStatus.running || systemCheckStatus?.missingAppium?.length > 0}
                                    placeholder="--allow-insecure chromedriver"
                                />
                            </div>
                        </div>

                        {/* Logs Output */}
                        {showAppiumLogs && (
                            <div
                                ref={logsContainerRef}
                                className="mt-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 font-mono text-xs h-64 overflow-auto custom-scrollbar shadow-inner"
                            >
                                {appiumLogs.length === 0 && <span className="text-zinc-500 italic">{t('settings.appium.waiting')}</span>}
                                {appiumLogs.map((log, i) => (
                                    <div key={i} className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap border-b border-zinc-200 dark:border-zinc-800/50 pb-0.5 mb-0.5">{log}</div>
                                ))}
                            </div>
                        )}
                    </Section>

                    {/* Tool Options */}
                    <Section title={t('settings.tools')} icon={Wrench}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {['robotArgs', 'scrcpyArgs'].map((key) => {
                                let isDisabled = false;
                                if (key === 'robotArgs' && systemCheckStatus?.missingTesting?.length > 0) isDisabled = true;
                                if (key === 'scrcpyArgs' && systemCheckStatus?.missingMirroring?.length > 0) isDisabled = true;

                                return (
                                    <div key={key}>
                                        <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1">{t(`settings.tool_config.${key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)}` as any)}</label>
                                        <input
                                            type="text"
                                            value={(settings.tools as any)[key]}
                                            onChange={(e) => updateSetting('tools', { ...settings.tools, [key]: e.target.value })}
                                            className="w-full bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-gray-900 dark:text-zinc-300 focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                            disabled={isDisabled}
                                            title={isDisabled ? "Dependency missing" : ""}
                                        />
                                    </div>
                                );
                            })}
                            {/* App Packages List */}
                            <div className="col-span-1 md:col-span-2">
                                <TagInput
                                    label={t('settings.tool_config.app_packages')}
                                    tags={settings.tools.appPackage.split(',').map(p => p.trim()).filter(Boolean)}
                                    onAdd={(tag) => {
                                        const current = settings.tools.appPackage.split(',').map(p => p.trim()).filter(Boolean);
                                        if (!current.includes(tag)) {
                                            updateSetting('tools', { ...settings.tools, appPackage: [...current, tag].join(', ') });
                                        }
                                    }}
                                    onRemove={(tag) => {
                                        const current = settings.tools.appPackage.split(',').map(p => p.trim()).filter(Boolean);
                                        updateSetting('tools', { ...settings.tools, appPackage: current.filter(t => t !== tag).join(', ') });
                                    }}
                                    placeholder={t('settings.tool_config.add_package_placeholder')}
                                />
                            </div>
                            {isNgrokEnabled && (
                                <div className="col-span-1 md:col-span-2">
                                    <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1">{t('settings.tool_config.ngrok_token')}</label>
                                    <input
                                        type="password"
                                        value={settings.tools.ngrokToken || ''}
                                        onChange={(e) => updateSetting('tools', { ...settings.tools, ngrokToken: e.target.value })}
                                        className="w-full bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-gray-900 dark:text-zinc-300 focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                        placeholder="Authorization Token"
                                        disabled={systemCheckStatus?.missingTunnelling?.length > 0}
                                        title={systemCheckStatus?.missingTunnelling?.length > 0 ? "Ngrok not found" : ""}
                                    />
                                </div>
                            )}
                        </div>
                    </Section>
                </div>

                {/* Path Configuration */}
                <Section title={t('settings.paths.title')} icon={FolderOpen}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(['automationRoot', 'resources', 'tests', 'suites', 'logs', 'logcat', 'screenshots', 'recordings'] as Array<keyof typeof settings.paths>).map((key) => {
                            const isTestingPath = ['automationRoot', 'resources', 'tests', 'suites'].includes(key);
                            const isDisabled = isTestingPath && systemCheckStatus?.missingTesting?.length > 0;
                            return (
                                <PathInput
                                    key={key}
                                    label={t(`settings.path_labels.${key}` as any)}
                                    value={settings.paths[key] || ''}
                                    onSelect={(path) => updateSetting('paths', { ...settings.paths, [key]: path })}
                                    disabled={isDisabled}
                                    placeholder={t('settings.not_set')}
                                    directory={true}
                                />
                            );
                        })}
                    </div>
                </Section>

                {/* Appearance & General */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">


                    <Section
                        title={t('settings.appearance.title')}
                        icon={Moon}
                        menus={
                            <SegmentedControl
                                options={[
                                    { value: 'light', icon: <Sun size={18} /> },
                                    { value: 'dark', icon: <Moon size={18} /> }
                                ]}
                                value={settings.theme}
                                onChange={(val: any) => updateSetting('theme', val)}
                            />
                        }
                    >
                        {/* Primary Color */}
                        <div className="mt-6">
                            <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-300 mb-3">{t('settings.appearance.primary_color')}</h3>
                            <div className="flex flex-wrap gap-3">
                                {[
                                    { id: 'blue', hex: '#2563eb' },
                                    { id: 'red', hex: '#dc2626' },
                                    { id: 'green', hex: '#16a34a' },
                                    { id: 'purple', hex: '#9333ea' },
                                    { id: 'orange', hex: '#ea580c' },
                                    { id: 'cyan', hex: '#0891b2' },
                                    { id: 'pink', hex: '#db2777' },
                                ].map((color) => (
                                    <button
                                        key={color.id}
                                        onClick={() => updateSetting('primaryColor', color.id)}
                                        className={clsx(
                                            "w-8 h-8 rounded-full transition-all active:scale-95 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900 flex items-center justify-center",
                                            settings.primaryColor === color.id ? "ring-2 scale-110" : "hover:scale-105"
                                        )}
                                        style={{ backgroundColor: color.hex, borderColor: color.hex, '--tw-ring-color': color.hex } as any}
                                        title={color.id.charAt(0).toUpperCase() + color.id.slice(1)}
                                    >
                                        {settings.primaryColor === color.id && (
                                            <div className="w-2.5 h-2.5 bg-white rounded-full shadow-sm" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Sidebar Logo */}
                        <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                            <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-300 mb-3">{t('settings.appearance.sidebar_logo')}</h3>
                            <div className="space-y-4">
                                {/* Light Mode Logo */}
                                <div>
                                    <label className="block text-xs text-zinc-500 mb-1">{t('settings.appearance.logo_light')}</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={settings.customLogoLight || ''}
                                            readOnly
                                            placeholder={t('settings.appearance.use_default')}
                                            className="flex-1 bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-zinc-100"
                                        />
                                        <button
                                            onClick={() => handleLogoUpload('customLogoLight')}
                                            className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl transition-all"
                                        >
                                            <FolderOpen size={16} />
                                        </button>
                                        {settings.customLogoLight && (
                                            <button
                                                onClick={() => updateSetting('customLogoLight', undefined)}
                                                className="px-3 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 text-red-500 rounded-xl transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Dark Mode Logo */}
                                <div>
                                    <label className="block text-xs text-zinc-500 mb-1">{t('settings.appearance.logo_dark')}</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={settings.customLogoDark || ''}
                                            readOnly
                                            placeholder={t('settings.appearance.use_default')}
                                            className="flex-1 bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-zinc-100"
                                        />
                                        <button
                                            onClick={() => handleLogoUpload('customLogoDark')}
                                            className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl transition-all"
                                        >
                                            <FolderOpen size={16} />
                                        </button>
                                        {settings.customLogoDark && (
                                            <button
                                                onClick={() => updateSetting('customLogoDark', undefined)}
                                                className="px-3 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 text-red-500 rounded-xl transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <p className="text-[10px] text-zinc-400">
                                    {t('settings.appearance.logo_hint')}
                                </p>
                            </div>
                        </div>
                    </Section>

                    <Section title={t('settings.general')} icon={Globe}>
                        <div>
                            <Select
                                value={settings.language}
                                onChange={(e) => updateSetting('language', e.target.value)}
                                label={t('settings.language')}
                                options={[
                                    { value: "en_US", label: "English (US)" },
                                    { value: "pt_BR", label: "Português (Brasil)" },
                                    { value: "es_ES", label: "Español" }
                                ]}
                            />
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-zinc-800 mt-4">
                            <div>
                                <label className="block text-sm text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                                    {t('settings.recycle_device_views')}
                                </label>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {t('settings.recycle_device_views_desc', { defaultValue: "Reuse existing tabs when running tests on the same device" })}
                                </p>
                            </div>
                            <Switch
                                checked={settings.recycleDeviceViews}
                                onCheckedChange={(c: boolean) => updateSetting('recycleDeviceViews', c)}
                            />
                        </div>
                    </Section>
                </div >

                {/* System Versions */}
                <Section
                    title={t('settings.system.title')}
                    icon={Monitor}
                    actions={
                        <button
                            onClick={checkSystemVersions}
                            disabled={systemCheckStatus.loading}
                            className={
                                clsx(
                                    "p-2 rounded-xl transition-all active:scale-95 hover:bg-zinc-100 dark:hover:bg-zinc-800",
                                    systemCheckStatus.loading ? "animate-spin text-primary" : "text-zinc-500 hover:text-primary dark:text-zinc-400"
                                )
                            }
                            title={t('common.loading')}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></svg>
                        </button>
                    }
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {systemVersions ? (
                            (['adb', 'node', 'appium', 'uiautomator2', 'python', 'robot', 'appium_lib', 'scrcpy', 'ngrok'] as Array<keyof typeof systemVersions>)
                                .filter(key => key !== 'ngrok' || isNgrokEnabled)
                                .map((key) => (
                                    <InfoCard
                                        key={key}
                                        title={t(`settings.system.tools.${key}` as any) || key}
                                        href={TOOL_LINKS[key as keyof typeof TOOL_LINKS]}
                                        headerRight={<span className="text-zinc-300 dark:text-zinc-600">↗</span>}
                                        className="h-20"
                                    >
                                        <span className="text-sm font-mono text-gray-900 dark:text-zinc-300 truncate block mt-1" title={systemVersions[key]}>
                                            {systemVersions[key]}
                                        </span>
                                    </InfoCard>
                                ))
                        ) : (
                            <div className="text-zinc-400 italic col-span-full">{t('settings.system.checking')}</div>
                        )}
                    </div>
                </Section>
            </div>
        </div>
    );
}

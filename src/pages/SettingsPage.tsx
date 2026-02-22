import { useSettings } from "@/lib/settings";
import { Moon, Sun, Server, Monitor, FolderOpen, Wrench, Play, Square, Terminal, Users, Plus, Edit2, Trash2, Settings as SettingsIcon, Sparkles, FileJson, RefreshCcw } from "lucide-react";
import { Switch } from "@/components/atoms/Switch";
import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { feedback } from "@/lib/feedback";
import { TOOL_LINKS } from "@/lib/tools";
import { getAvailableModels } from "@/lib/dashboard/gemini";
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
import { LogoInput } from "@/components/molecules/LogoInput";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";

export function SettingsPage() {
    const { settings, updateSetting, loading, profiles, activeProfileId, createProfile, switchProfile, renameProfile, deleteProfile, systemVersions, checkSystemVersions, systemCheckStatus, isNgrokEnabled } = useSettings();
    const { t } = useTranslation();

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

    // AI Models State
    const [availableModels, setAvailableModels] = useState<string[]>(['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-pro']);
    const [showModelList, setShowModelList] = useState(false);

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
        return <div className="p-8 text-center text-on-surface-variant/80">Loading settings...</div>;
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

    const handleOpenSettingsFile = async () => {
        try {
            const appData = await appDataDir();
            const settingsPath = await join(appData, 'settings.json');
            await openPath(settingsPath);
        } catch (e) {
            feedback.toast.error("settings.error.open_file", e);
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
                    <>
                        {profiles.length > 1 && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteClick(activeProfileId)}
                                className="text-on-surface/80 hover:text-error hover:bg-error-container/10"
                                title={t('settings.profiles.delete')}
                            >
                                <Trash2 size={16} />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleOpenSettingsFile}
                            className="text-on-surface/80 hover:text-primary hover:bg-primary/10"
                            title={t('settings.action.open_file')}
                        >
                            <FileJson size={16} />
                        </Button>
                        <Select
                            options={profiles.map(p => ({
                                label: p.id === 'default' && p.name === 'Default' ? t('settings.profiles.default') : p.name,
                                value: p.id
                            }))}
                            value={activeProfileId}
                            onChange={(e) => { switchProfile(e.target.value); feedback.toast.success('feedback.profile_changed'); }}
                            containerClassName="w-[180px]"
                        />
                    </>
                }
                actions={
                    <>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setIsRenaming(true); setNewProfileName(profiles.find(p => p.id === activeProfileId)?.name || ""); setShowProfileModal(true); }}
                            leftIcon={<Edit2 size={16} />}
                        >
                            {!isNarrow && t('settings.profiles.rename')}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setIsRenaming(false); setNewProfileName(""); setShowProfileModal(true); }}
                            leftIcon={<Plus size={16} />}
                        >
                            {!isNarrow && t('settings.profiles.create')}
                        </Button>
                    </>
                }
            >
                <div className="mt-4 pt-4 border-t border-outline-variant/30 grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
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

                    <div>
                        <Select
                            value={settings.usageMode || 'explorer'}
                            onChange={async (e) => {
                                const mode = e.target.value as 'explorer' | 'automator';
                                updateSetting('usageMode', mode);
                                if (mode === 'automator') {
                                    checkSystemVersions(mode);
                                }
                            }}
                            label={t('onboarding.step2_title')}
                            options={[
                                { value: "explorer", label: t('onboarding.mode.explorer.title') },
                                { value: "automator", label: t('onboarding.mode.automator.title') }
                            ]}
                        />
                    </div>

                    {settings.usageMode === 'automator' && (
                        <div>
                            <Select
                                value={settings.automationFramework || 'robot'}
                                onChange={async (e) => {
                                    const framework = e.target.value as 'robot' | 'appium' | 'maestro';
                                    updateSetting('automationFramework', framework);
                                    checkSystemVersions('automator');
                                }}
                                label={t('onboarding.step3_title')}
                                options={[
                                    { value: "robot", label: t('onboarding.framework.robot.title') },
                                    { value: "appium", label: t('onboarding.framework.appium.title') },
                                    { value: "maestro", label: t('onboarding.framework.maestro.title') }
                                ]}
                            />
                        </div>
                    )}

                    <div className="flex items-center justify-between bg-surface-variant/5 hover:bg-surface-variant/10 p-3 rounded-2xl transition-colors select-none cursor-pointer h-[68px]" onClick={() => updateSetting('recycleDeviceViews', !settings.recycleDeviceViews)}>
                        <div>
                            <label className="block text-sm text-on-surface-variant/80 font-medium mb-0.5 pointer-events-none">
                                {t('settings.recycle_device_views')}
                            </label>
                            <p className="text-[10px] text-on-surface-variant/60 pointer-events-none mt-1">
                                {t('settings.recycle_device_views_desc', { defaultValue: "Reuse existing tabs when running tests on the same device" })}
                            </p>
                        </div>
                        <Switch
                            checked={settings.recycleDeviceViews}
                            onCheckedChange={(c: boolean) => updateSetting('recycleDeviceViews', c)}
                        />
                    </div>
                </div>
            </Section>

            {/* Modal for Create/Rename */}
            <Modal
                isOpen={showProfileModal}
                onClose={() => setShowProfileModal(false)}
                title={isRenaming ? t('settings.profiles.rename') : t('settings.profiles.create')}
            >
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                    <Input
                        autoFocus
                        value={newProfileName}
                        onChange={(e) => setNewProfileName(e.target.value)}
                        placeholder={t('settings.profiles.name_placeholder')}
                        className="bg-surface/50"
                    />
                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setShowProfileModal(false)}
                            className="text-on-surface-variant/80 hover:text-on-surface-variant/80"
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            disabled={!newProfileName.trim()}
                            variant="primary"
                        >
                            {t('common.save')}
                        </Button>
                    </div>
                </form>
            </Modal>

            <div className="grid gap-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Appium Server Config & Control */}
                    {settings.usageMode !== 'explorer' && (
                        <Section
                            title={t('settings.appium.title')}
                            icon={Server}
                            status={
                                <div className={clsx("flex items-center gap-2 px-3 py-1 rounded-2xl text-xs font-semibold border",
                                    appiumStatus.running
                                        ? "bg-success-container/10 text-on-success-container/10 border-success-container/20"
                                        : "bg-surface-variant/30 text-on-surface-variant/80 border-outline-variant")}>
                                    <div className={clsx("w-2 h-2 rounded-2xl", appiumStatus.running ? "bg-success" : "bg-on-surface/10")} />
                                    {appiumStatus.running ? t('settings.appium.running', { pid: appiumStatus.pid }) : t('settings.appium.stopped')}
                                </div>
                            }
                            actions={
                                <>
                                    <Button
                                        onClick={() => setShowAppiumLogs(!showAppiumLogs)}
                                        size="icon"
                                        variant="ghost"
                                        className={clsx(showAppiumLogs ? "bg-primary/10 text-primary" : "text-on-surface/80")}
                                        title={t('settings.appium.logs')}
                                        disabled={!appiumStatus.running && systemCheckStatus?.missingAppium?.length > 0}
                                    >
                                        <Terminal size={18} />
                                    </Button>

                                    <Button
                                        onClick={toggleAppium}
                                        variant={appiumStatus.running ? "danger" : "primary"}
                                        className="shadow-lg hover:shadow-xl transition-all"
                                        disabled={!appiumStatus.running && systemCheckStatus?.missingAppium?.length > 0}
                                        leftIcon={appiumStatus.running ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                                    >
                                        {!isNarrow && (appiumStatus.running ? t('settings.appium.stop') : t('settings.appium.start'))}
                                    </Button>
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
                                    className="mt-4 bg-surface/50 border border-outline-variant/30 rounded-2xl p-3 font-mono text-xs h-64 overflow-auto custom-scrollbar shadow-inner"
                                >
                                    {appiumLogs.length === 0 && <span className="text-on-surface-variant/80 italic">{t('settings.appium.waiting')}</span>}
                                    {appiumLogs.map((log, i) => (
                                        <div key={i} className="text-on-surface-variant/80 on-primaryspace-pre-wrap border-b border-outline-variant/30 pb-0.5 mb-0.5">{log}</div>
                                    ))}
                                </div>
                            )}
                        </Section>
                    )}

                    {/* Tool Options */}
                    <Section title={t('settings.tools')} icon={Wrench}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {['robotArgs', 'maestroArgs', 'appiumJavaArgs', 'scrcpyArgs'].map((key) => {
                                if (key === 'robotArgs' && (settings.usageMode === 'explorer' || (settings.automationFramework && settings.automationFramework !== 'robot'))) return null;
                                if (key === 'maestroArgs' && (settings.usageMode === 'explorer' || settings.automationFramework !== 'maestro')) return null;
                                if (key === 'appiumJavaArgs' && (settings.usageMode === 'explorer' || settings.automationFramework !== 'appium')) return null;

                                let isDisabled = false;
                                if (key === 'robotArgs' && systemCheckStatus?.missingTesting?.length > 0) isDisabled = true;
                                if (key === 'maestroArgs' && systemCheckStatus?.missingTesting?.length > 0) isDisabled = true;
                                if (key === 'appiumJavaArgs' && systemCheckStatus?.missingTesting?.length > 0) isDisabled = true;
                                if (key === 'scrcpyArgs' && systemCheckStatus?.missingMirroring?.length > 0) isDisabled = true;

                                let labelKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                                if (key === 'appiumJavaArgs') labelKey = 'appium_java_args'; // special case if not standard regex

                                return (
                                    <div key={key}>
                                        <Input
                                            label={t(`settings.tool_config.${labelKey}` as any)}
                                            type="text"
                                            value={(settings.tools as any)[key]}
                                            onChange={(e) => updateSetting('tools', { ...settings.tools, [key]: e.target.value })}
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
                                    <Input
                                        label={t('settings.tool_config.ngrok_token')}
                                        type="password"
                                        value={settings.tools.ngrokToken || ''}
                                        onChange={(e) => updateSetting('tools', { ...settings.tools, ngrokToken: e.target.value })}
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
                            if (isTestingPath && settings.usageMode === 'explorer') return null;
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
                            <h3 className="text-sm font-medium text-on-surface-variant/80 mb-3">{t('settings.appearance.primary_color')}</h3>
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
                                    <Button
                                        key={color.id}
                                        onClick={() => updateSetting('primaryColor', color.id)}
                                        variant="ghost"
                                        className={clsx(
                                            "w-8 h-8 rounded-2xl p-0 min-w-0 transition-transform",
                                            settings.primaryColor === color.id ? "ring-2 scale-110" : "hover:scale-105"
                                        )}
                                        style={{ backgroundColor: color.hex, borderColor: color.hex, '--tw-ring-color': color.hex } as any}
                                        title={color.id.charAt(0).toUpperCase() + color.id.slice(1)}
                                    >
                                        {settings.primaryColor === color.id && (
                                            <div className="w-2.5 h-2.5 bg-on-primary rounded-2xl shadow-sm" />
                                        )}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Sidebar Logo */}
                        <div className="mt-6 pt-6 border-t border-outline-variant/30">
                            <h3 className="text-sm font-medium text-on-surface-variant/80 mb-3">{t('settings.appearance.sidebar_logo')}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <LogoInput
                                    label={t('settings.appearance.logo_light')}
                                    value={settings.customLogoLight}
                                    onUpload={() => handleLogoUpload('customLogoLight')}
                                    onDelete={() => updateSetting('customLogoLight', undefined)}
                                    placeholder={t('settings.appearance.use_default')}
                                />
                                <LogoInput
                                    label={t('settings.appearance.logo_dark')}
                                    value={settings.customLogoDark}
                                    onUpload={() => handleLogoUpload('customLogoDark')}
                                    onDelete={() => updateSetting('customLogoDark', undefined)}
                                    placeholder={t('settings.appearance.use_default')}
                                />
                            </div>
                            <p className="text-[10px] text-on-surface-variant/80 mt-2">
                                {t('settings.appearance.logo_hint')}
                            </p>
                        </div>
                    </Section>

                    {/* AI Settings */}
                    <Section title={t('settings.ai.title')} icon={Sparkles}>
                        <div>
                            <Input
                                label={t('settings.ai.key')}
                                type="password"
                                value={settings.geminiApiKey || ''}
                                onChange={(e) => updateSetting('geminiApiKey', e.target.value)}
                                placeholder={t('settings.ai.placeholder')}
                            />
                            <p className="text-[10px] text-on-surface-variant/80 mt-2">
                                {t('settings.ai.help')}{' '}
                                <a
                                    href="https://aistudio.google.com/app/apikey"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary hover:underline"
                                >
                                    Google AI Studio
                                </a>
                            </p>
                            <div className="mt-4 flex gap-2 items-end">
                                <div className="flex-1">
                                    <div className="relative">
                                        <Input
                                            label={t('settings.ai.model')}
                                            type="text"
                                            value={settings.geminiModel || 'gemini-1.5-flash'}
                                            onChange={(e) => updateSetting('geminiModel', e.target.value)}
                                            placeholder="gemini-1.5-flash"
                                            onFocus={() => setShowModelList(true)}
                                            onBlur={() => setTimeout(() => setShowModelList(false), 200)}
                                        />
                                        {showModelList && availableModels.length > 0 && (
                                            <div className="absolute z-10 w-full mt-1 bg-surface border border-outline-variant/30 rounded-2xl shadow-lg max-h-48 overflow-auto custom-scrollbar">
                                                {availableModels.map(model => (
                                                    <button
                                                        key={model}
                                                        className="w-full text-left px-3 py-2 text-sm text-on-surface/80 hover:bg-primary/10 hover:text-primary transition-colors"
                                                        onClick={() => {
                                                            updateSetting('geminiModel', model);
                                                            setShowModelList(false);
                                                        }}
                                                    >
                                                        {model}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    onClick={async () => {
                                        if (!settings.geminiApiKey) {
                                            feedback.toast.error("common.error_occurred", { error: "API Key required" });
                                            return;
                                        }
                                        const toastId = feedback.toast.loading(t('settings.ai.loading_models'));
                                        try {
                                            const models = await getAvailableModels(settings.geminiApiKey);

                                            if (models.length > 0) {
                                                setAvailableModels(models);
                                                setShowModelList(true);
                                                feedback.toast.dismiss(toastId);
                                                feedback.toast.success(t('settings.ai.models_fetched'), {
                                                    description: t('settings.ai.models_found_desc', { count: models.length })
                                                });
                                            } else {
                                                feedback.toast.dismiss(toastId);
                                                feedback.toast.info(t('settings.ai.no_models_found'));
                                            }
                                        } catch (e: any) {
                                            feedback.toast.dismiss(toastId);
                                            feedback.toast.error("common.error_occurred", { error: e.message });
                                        }
                                    }}
                                    title={t('settings.ai.check_models')}
                                    className="mb-[2px]"
                                >
                                    <Server size={18} />
                                </Button>
                            </div>
                        </div>
                    </Section>


                </div >

                {/* System Versions */}
                <Section
                    title={t('settings.system.title')}
                    icon={Monitor}
                    actions={
                        <Button
                            onClick={() => checkSystemVersions()}
                            disabled={systemCheckStatus.loading}
                            variant="ghost"
                            size="icon"
                            className={
                                clsx(
                                    "rounded-2xl hover:bg-surface-variant/30",
                                    systemCheckStatus.loading ? "text-primary bg-primary/10" : "text-on-surface-variant/80 hover:text-primary"
                                )
                            }
                            title={t('common.loading')}
                        >
                            {systemCheckStatus.loading ? (
                                <ExpressiveLoading size="xsm" variant="circular" />
                            ) : (
                                <RefreshCcw size={18} />
                            )}
                        </Button>
                    }
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {systemVersions ? (
                            (['adb', 'node', 'appium', 'uiautomator2', 'python', 'robot', 'appium_lib', 'java', 'maven', 'maestro', 'scrcpy', 'ngrok'] as Array<keyof typeof systemVersions>)
                                .filter(key => {
                                    if (key === 'ngrok' && !isNgrokEnabled) return false;
                                    if (settings.usageMode === 'explorer' && ['node', 'appium', 'uiautomator2', 'python', 'robot', 'appium_lib', 'java', 'maven', 'maestro'].includes(key)) return false;

                                    // Framework-specific filtering
                                    if (settings.usageMode === 'automator') {
                                        if (['python', 'robot', 'appium_lib'].includes(key) && settings.automationFramework !== 'robot') return false;
                                        if (['java', 'maven'].includes(key) && settings.automationFramework !== 'appium') return false;
                                        if (['maestro'].includes(key) && settings.automationFramework !== 'maestro') return false;
                                        if (['appium', 'uiautomator2'].includes(key) && settings.automationFramework !== 'appium' && settings.automationFramework !== 'robot') return false;
                                    }

                                    return true;
                                })
                                .map((key) => (
                                    <InfoCard
                                        key={key}
                                        title={t(`settings.system.tools.${key}` as any) || key}
                                        href={TOOL_LINKS[key as keyof typeof TOOL_LINKS]}
                                        headerRight={<span className="text-on-surface-variant/80">↗</span>}
                                        className="h-20"
                                    >
                                        <span className="text-sm font-mono text-on-surface/80 truncate block mt-1" title={systemVersions[key]}>
                                            {systemVersions[key]}
                                        </span>
                                    </InfoCard>
                                ))
                        ) : (
                            <div className="text-on-surface/80 italic col-span-full">{t('settings.system.checking')}</div>
                        )}
                    </div>
                </Section>
            </div>
        </div>
    );
}

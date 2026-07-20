import { useSettings } from "@/lib/settings";
import { Moon, Sun, Server, Monitor, FolderOpen, Wrench, Play, Square, Terminal, Users, Plus, Edit2, Trash2, Settings as SettingsIcon, Sparkles, FileJson, RefreshCcw, GitBranch, Link2, Briefcase, ChevronDown, FilePlus, Copy } from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const Slack = ({ size = 18 }: { size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <rect width="8" height="8" x="3" y="3" rx="2" />
        <path d="M12 3v18" />
        <path d="M3 12h18" />
        <rect width="8" height="8" x="13" y="13" rx="2" />
    </svg>
);
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTestSessions } from "@/lib/testSessionStore";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile, readTextFile } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { feedback } from "@/lib/feedback";
import { TOOL_LINKS } from "@/lib/tools";
import { getAvailableModels as getGeminiModels } from "@/lib/dashboard/gemini";
import { getAvailableModels as getClaudeModels } from "@/lib/dashboard/claude";
import { getAvailableModels as getOpenAIModels } from "@/lib/dashboard/openai";
import { migrateScreenMaps } from "@/lib/dashboard/mapperPersistence";
import { Modal } from "@/components/organisms/Modal";
import { ConfirmationModal } from "@/components/organisms/ConfirmationModal";
import { testJiraConnection } from "@/lib/integrations/jira";
import { testAzureConnection } from "@/lib/integrations/azureDevOps";
import { testTestLinkConnection } from "@/lib/integrations/testLink";

// Atoms
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { Section } from "@/components/organisms/Section";
import { PageHeader } from "@/components/organisms/PageHeader";
import { Switch } from "@/components/atoms/Switch";
import { ActionCard } from "@/components/atoms/ActionCard";

// New Components
import { Select } from "@/components/atoms/Select";
import { SplitButton } from "@/components/molecules/SplitButton";
import { PathInput } from "@/components/molecules/PathInput";
import { TagInput } from "@/components/atoms/TagInput";
import { SegmentedControl } from "@/components/molecules/SegmentedControl";
import { InfoCard } from "@/components/molecules/InfoCard";
import { LogoInput } from "@/components/molecules/LogoInput";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";

import { useRemoteConfig } from "@/lib/RemoteConfigProvider";

interface SettingsPageProps {
    onNavigate?: (page: string) => void;
}

export function SettingsPage({ onNavigate: _onNavigate }: SettingsPageProps) {
    const { settings, updateSetting, loading, profiles, activeProfileId, createProfile, importSettingsStore, switchProfile, renameProfile, deleteProfile, systemVersions, checkSystemVersions, systemCheckStatus, isNgrokEnabled, is_test_mode } = useSettings();

    const { t } = useTranslation();
    const { sessions } = useTestSessions();
    const isTestRunning = sessions.some(s => s.status === 'running');
    const showAppiumSection = settings.usageMode === 'automator' && settings.automationFramework !== 'maestro' && is_test_mode !== 'web';

    // Profile Management Details
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [newProfileName, setNewProfileName] = useState("");
    const [isRenaming, setIsRenaming] = useState(false);
    const [migrationPending, setMigrationPending] = useState<{ oldPath: string, newPath: string } | null>(null);
    const [isMigrating, setIsMigrating] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [creationMode, setCreationMode] = useState<'default' | 'clone' | 'import'>('default');
    const [importedSettings, setImportedSettings] = useState<any>(null);
    const [importedFileName, setImportedFileName] = useState<string | null>(null);

    // Integrations Modal state
    const [showIntegrationsModal, setShowIntegrationsModal] = useState(false);
    const [expandedIntegrations, setExpandedIntegrations] = useState<Record<string, boolean>>({
        jira: false,
        azure: false,
        testlink: false,
        git: false,
        webhooks: false,
    });

    const toggleIntegrationExpanded = (key: string) => {
        setExpandedIntegrations(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    // Responsive State
    const containerRef = useRef<HTMLDivElement>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    // AI Model Fetching State
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [modelFetchError, setModelFetchError] = useState<string | null>(null);
    const [availableModels, setAvailableModels] = useState<string[]>(['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-pro']);
    const [showModelList, setShowModelList] = useState(false);

    const [isRestartingADB, setIsRestartingADB] = useState(false);

    const claudeCodeVersion = systemVersions?.claude_code;
    const isClaudeCodeInstalled = !!claudeCodeVersion && claudeCodeVersion !== 'Not Found';

    const antigravityVersion = systemVersions?.antigravity;
    const isAntigravityInstalled = !!antigravityVersion && antigravityVersion !== 'Not Found';

    const { isFeatureEnabled } = useRemoteConfig();
    const isCypressEnabled = isFeatureEnabled('is_cypress_enabled');
    const isSeleniumEnabled = isFeatureEnabled('is_selenium_enabled');

    // Integrations Connection Testing
    const [testingJira, setTestingJira] = useState(false);
    const [testingAzure, setTestingAzure] = useState(false);
    const [testingTestLink, setTestingTestLink] = useState(false);

    // Custom Color State
    const [showCustomColorModal, setShowCustomColorModal] = useState(false);
    const [customColorHex, setCustomColorHex] = useState('#ffffff');

    const handleTestJira = async () => {
        if (!settings.jira) return;
        setTestingJira(true);
        try {
            const success = await testJiraConnection(settings.jira);
            if (success) {
                feedback.toast.success(t('settings.integrations.jira.connection_success'));
            } else {
                feedback.toast.error(t('settings.integrations.jira.connection_failed'));
            }
        } catch (e: any) {
            feedback.toast.error(t('common.error_occurred') + ': ' + e.message);
        } finally {
            setTestingJira(false);
        }
    };

    const handleTestAzure = async () => {
        if (!settings.azureDevOps) return;
        setTestingAzure(true);
        try {
            const success = await testAzureConnection(settings.azureDevOps);
            if (success) {
                feedback.toast.success(t('settings.integrations.azure.connection_success'));
            } else {
                feedback.toast.error(t('settings.integrations.azure.connection_failed'));
            }
        } catch (e: any) {
            feedback.toast.error(t('common.error_occurred') + ': ' + e.message);
        } finally {
            setTestingAzure(false);
        }
    };

    const handleTestTestLink = async () => {
        if (!settings.testLink) return;
        setTestingTestLink(true);
        try {
            const success = await testTestLinkConnection(settings.testLink);
            if (success) {
                feedback.toast.success(t('settings.integrations.testlink.connection_success'));
            } else {
                feedback.toast.error(t('settings.integrations.testlink.connection_failed'));
            }
        } catch (e: any) {
            feedback.toast.error(t('common.error_occurred') + ': ' + e.message);
        } finally {
            setTestingTestLink(false);
        }
    };


    const handleRestartADB = async () => {
        try {
            setIsRestartingADB(true);
            feedback.toast.info('feedback.adb_restarting');
            await invoke('restart_adb_server');
            feedback.toast.success('feedback.adb_restarted');
            // Refresh system versions to make sure ADB is back
            checkSystemVersions();
        } catch (e: any) {
            let errStr = String(e).replace(/^Error:/, '').trim();
            feedback.toast.error('common.error_occurred', { error: errStr });
        } finally {
            setIsRestartingADB(false);
        }
    };

    const handleFetchModels = async () => {
        const provider = settings.aiProvider;
        const apiKey = provider === 'gemini' ? settings.geminiApiKey : provider === 'claude' ? settings.claudeApiKey : settings.openaiApiKey;

        if (!apiKey) {
            setModelFetchError(t('common.error_occurred', { error: "API Key required" }));
            setShowModelList(true);
            return;
        }

        setIsFetchingModels(true);
        setModelFetchError(null);
        setShowModelList(true);

        try {
            let models: string[] = [];
            if (provider === 'gemini') {
                models = await getGeminiModels(apiKey);
            } else if (provider === 'claude') {
                models = await getClaudeModels(apiKey);
            } else if (provider === 'openai') {
                models = await getOpenAIModels(apiKey);
            }

            const { modelsByProvider } = await import('@/lib/dashboard/aiFallback');
            const priorities = modelsByProvider[provider] || [];

            models.sort((a, b) => {
                let indexA = -1;
                let indexB = -1;
                if (provider === 'gemini' || provider === 'openai') {
                    indexA = priorities.findIndex(p => a === p || a.endsWith(p));
                    indexB = priorities.findIndex(p => b === p || b.endsWith(p));
                } else {
                    indexA = priorities.findIndex(p => a === p || a.startsWith(p));
                    indexB = priorities.findIndex(p => b === p || b.startsWith(p));
                }

                if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;
                return a.localeCompare(b);
            });

            setAvailableModels(models);
        } catch (e: any) {
            setModelFetchError(e.message || "Failed to fetch models");
        } finally {
            setIsFetchingModels(false);
        }
    };

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

    // Splitter state
    const [leftPaneWidth, setLeftPaneWidth] = useState<number>(50);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const splitContainerRef = useRef<HTMLDivElement>(null);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        setIsDragging(true);
        e.preventDefault();
    }, []);

    useEffect(() => {
        if (!isDragging) return;

        const handlePointerMove = (e: PointerEvent) => {
            if (!splitContainerRef.current) return;
            const containerRect = splitContainerRef.current.getBoundingClientRect();
            let newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
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

    // Clear available models when provider changes
    useEffect(() => {
        setAvailableModels([]);
        setModelFetchError(null);
        setShowModelList(false);
    }, [settings.aiProvider]);



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
    const isTestRunningRef = useRef(isTestRunning);

    useEffect(() => {
        isTestRunningRef.current = isTestRunning;
    }, [isTestRunning]);

    useEffect(() => {
        // Cached System Versions
        if (!systemVersions) {
            checkSystemVersions();
        }

        // Initial status check
        checkAppiumStatus(isTestRunningRef.current);

        // Poll status every 2 seconds
        const interval = setInterval(() => checkAppiumStatus(isTestRunningRef.current), 2000);

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

    const checkAppiumStatus = async (isRunning: boolean = false) => {
        try {
            const status = await invoke<{ running: boolean, pid?: number }>('get_appium_status', {
                host: settings.appiumHost,
                port: Number(settings.appiumPort),
                is_test_running: isRunning
            });
            setAppiumStatus(status);
        } catch (e) {
            feedback.toast.error("settings.appium.status_error", e);
        }
    };

    const startAppiumNewWindow = async () => {
        try {
            await invoke('start_appium_in_terminal', {
                host: settings.appiumHost,
                port: Number(settings.appiumPort),
                basePath: settings.appiumBasePath,
                args: settings.tools.appiumArgs
            });
            feedback.toast.success('settings.appium.started_new_window');
            // Start checking status more frequently
            checkAppiumStatus();
        } catch (e: any) {
            let errStr = String(e).replace(/^Error:/, '').trim();
            feedback.toast.error('common.error_occurred', { error: errStr });
        }
    };

    const openAppiumLogTerminal = async () => {
        try {
            await invoke('open_appium_log_terminal');
        } catch (e: any) {
            let errStr = String(e).replace(/^Error:/, '').trim();
            feedback.toast.error('common.error_occurred', { error: errStr });
        }
    };

    const toggleAppium = async () => {
        try {
            if (appiumStatus.running) {
                await invoke('stop_appium_server', {
                    host: settings.appiumHost,
                    port: Number(settings.appiumPort)
                });
                feedback.toast.info('feedback.appium_stopped');
            } else {
                await invoke('start_appium_server', {
                    host: settings.appiumHost,
                    port: Number(settings.appiumPort),
                    basePath: settings.appiumBasePath,
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

    const handleImportFile = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: 'JSON', extensions: ['json'] }]
            });
            if (selected) {
const raw = Array.isArray(selected) ? selected[0] : selected;
const filePath = typeof raw === 'string' ? raw : raw.path;
const fileContent = await readTextFile(filePath);
const parsed = JSON.parse(fileContent);
                if (typeof parsed === 'object' && parsed !== null) {
                    setImportedSettings(parsed);
                    setImportedFileName(filePath.split(/[/\\]/).pop() || 'config.json');
                } else {
                    feedback.toast.error(t('settings.profiles.invalid_file_format'));
                }
            }
        } catch (e: any) {
            feedback.toast.error(t('settings.profiles.invalid_file_format') + ': ' + e.message);
        }
    };

    const handleProfileSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (creationMode !== 'import' && !newProfileName.trim()) return;

        if (isRenaming) {
            renameProfile(activeProfileId, newProfileName);
        } else {
            if (creationMode === 'clone') {
                createProfile(newProfileName, settings);
            } else if (creationMode === 'import' && importedSettings) {
                importSettingsStore(importedSettings);
                feedback.toast.success(t('feedback.success', 'Settings imported successfully'));
            } else {
                createProfile(newProfileName);
            }
        }
        setShowProfileModal(false);
        setNewProfileName("");
        setIsRenaming(false);
        setCreationMode('default');
        setImportedSettings(null);
        setImportedFileName(null);
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
        <div ref={containerRef} className="space-y-4 animate-in fade-in duration-500">
            {/* Migration Confirmation Modal */}
            <ConfirmationModal
                isOpen={!!migrationPending}
                onClose={() => {
                    if (migrationPending) {
                        updateSetting('paths', { ...settings.paths, mappings: migrationPending.newPath });
                        setMigrationPending(null);
                    }
                }}
                onConfirm={async () => {
                    if (migrationPending) {
                        setIsMigrating(true);
                        try {
                            await migrateScreenMaps(activeProfileId, migrationPending.oldPath, migrationPending.newPath);
                            feedback.toast.success('settings.feedback.migration_success');
                        } catch (err) {
                            feedback.toast.error('settings.feedback.migration_error', err);
                        } finally {
                            setIsMigrating(false);
                            updateSetting('paths', { ...settings.paths, mappings: migrationPending.newPath });
                            setMigrationPending(null);
                        }
                    }
                }}
                title={t('settings.paths.migration_title')}
                description={t('settings.paths.migration_desc')}
                confirmText={t('settings.paths.migration_confirm')}
                variant="warning"
                isLoading={isMigrating}
            />

            {/* Delete Confirmation Modal */}
            <ConfirmationModal
                isOpen={!!showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(null)}
                onConfirm={confirmDeleteInfo}
                title={t('settings.profiles.delete')}
                description={t('settings.profiles.confirm_delete')}
                confirmText={t('common.delete')}
            />

            {/* Third-Party Integrations Modal */}
            <Modal
                isOpen={showIntegrationsModal}
                onClose={() => setShowIntegrationsModal(false)}
                title={t('settings.integrations.title')}
                className="max-w-2xl"
            >
                <div className="space-y-4">
                    {/* Jira */}
                    {isFeatureEnabled('is_integration_jira_enabled') && (
                        <div className="border border-outline-variant/30 rounded-2xl bg-surface/30 overflow-hidden">
                            <div
                                className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-variant/10 transition-colors select-none"
                                onClick={() => toggleIntegrationExpanded('jira')}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                        <Briefcase size={18} />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-on-surface">{t('settings.integrations.jira.title')}</h3>
                                        <span className="text-xs text-on-surface-variant/80">
                                            {settings.jira?.enabled ? t('settings.integrations.enabled') : t('settings.integrations.disabled')}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                                    <Switch
                                        checked={settings.jira?.enabled || false}
                                        onCheckedChange={(checked) => updateSetting('jira', {
                                            host: settings.jira?.host || '',
                                            email: settings.jira?.email || '',
                                            apiToken: settings.jira?.apiToken || '',
                                            projectKey: settings.jira?.projectKey || '',
                                            enabled: checked
                                        })}
                                    />
                                    <Button
                                        type="button"
                                        onClick={() => toggleIntegrationExpanded('jira')}
                                        className={clsx(
                                            "p-1.5 text-on-surface-variant/80 hover:text-on-surface bg-transparent shadow-none hover:bg-surface-variant/30 rounded-2xl transition-all duration-200",
                                            expandedIntegrations.jira && "transform rotate-180"
                                        )}
                                    >
                                        <ChevronDown size={20} />
                                    </Button>
                                </div>
                            </div>
                            <AnimatePresence initial={false}>
                                {expandedIntegrations.jira && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="p-4 pt-0 border-t border-outline-variant/10 space-y-3">
                                            <div className="h-2" />
                                            <Input
                                                label={t('settings.integrations.jira.host')}
                                                type="text"
                                                value={settings.jira?.host || ''}
                                                onChange={(e) => updateSetting('jira', {
                                                    host: e.target.value,
                                                    email: settings.jira?.email || '',
                                                    apiToken: settings.jira?.apiToken || '',
                                                    projectKey: settings.jira?.projectKey || '',
                                                    enabled: settings.jira?.enabled || false
                                                })}
                                                placeholder="e.g. your-company.atlassian.net"
                                            />
                                            <Input
                                                label={t('settings.integrations.jira.email')}
                                                type="email"
                                                value={settings.jira?.email || ''}
                                                onChange={(e) => updateSetting('jira', {
                                                    host: settings.jira?.host || '',
                                                    email: e.target.value,
                                                    apiToken: settings.jira?.apiToken || '',
                                                    projectKey: settings.jira?.projectKey || '',
                                                    enabled: settings.jira?.enabled || false
                                                })}
                                                placeholder="e.g. name@company.com"
                                            />
                                            <Input
                                                label={t('settings.integrations.jira.token')}
                                                type="password"
                                                value={settings.jira?.apiToken || ''}
                                                onChange={(e) => updateSetting('jira', {
                                                    host: settings.jira?.host || '',
                                                    email: settings.jira?.email || '',
                                                    apiToken: e.target.value,
                                                    projectKey: settings.jira?.projectKey || '',
                                                    enabled: settings.jira?.enabled || false
                                                })}
                                                placeholder="Atlassian API Token"
                                            />
                                            <Input
                                                label={t('settings.integrations.jira.project')}
                                                type="text"
                                                value={settings.jira?.projectKey || ''}
                                                onChange={(e) => updateSetting('jira', {
                                                    host: settings.jira?.host || '',
                                                    email: settings.jira?.email || '',
                                                    apiToken: settings.jira?.apiToken || '',
                                                    projectKey: e.target.value,
                                                    enabled: settings.jira?.enabled || false
                                                })}
                                                placeholder="e.g. PROJ"
                                            />
                                            <div className="flex justify-end pt-2">
                                                <Button
                                                    onClick={handleTestJira}
                                                    disabled={testingJira || !settings.jira?.host || !settings.jira?.email || !settings.jira?.apiToken || !settings.jira?.projectKey}
                                                    variant="secondary"
                                                    size="sm"
                                                >
                                                    {testingJira ? t('settings.integrations.testing') : t('settings.integrations.test_connection')}
                                                </Button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* Azure DevOps */}
                    {isFeatureEnabled('is_integration_azure_enabled') && (
                        <div className="border border-outline-variant/30 rounded-2xl bg-surface/30 overflow-hidden">
                            <div
                                className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-variant/10 transition-colors select-none"
                                onClick={() => toggleIntegrationExpanded('azure')}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                        <Briefcase size={18} />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-on-surface">{t('settings.integrations.azure.title')}</h3>
                                        <span className="text-xs text-on-surface-variant/80">
                                            {settings.azureDevOps?.enabled ? t('settings.integrations.enabled') : t('settings.integrations.disabled')}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                                    <Switch
                                        checked={settings.azureDevOps?.enabled || false}
                                        onCheckedChange={(checked) => updateSetting('azureDevOps', {
                                            org: settings.azureDevOps?.org || '',
                                            project: settings.azureDevOps?.project || '',
                                            pat: settings.azureDevOps?.pat || '',
                                            enabled: checked
                                        })}
                                    />
                                    <Button
                                        type="button"
                                        onClick={() => toggleIntegrationExpanded('azure')}
                                        className={clsx(
                                            "p-1.5 text-on-surface-variant/80 hover:text-on-surface bg-transparent shadow-none hover:bg-surface-variant/30 rounded-2xl transition-all duration-200",
                                            expandedIntegrations.azure && "transform rotate-180"
                                        )}
                                    >
                                        <ChevronDown size={20} />
                                    </Button>
                                </div>
                            </div>
                            <AnimatePresence initial={false}>
                                {expandedIntegrations.azure && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="p-4 pt-0 border-t border-outline-variant/10 space-y-3">
                                            <div className="h-2" />
                                            <Input
                                                label={t('settings.integrations.azure.org')}
                                                type="text"
                                                value={settings.azureDevOps?.org || ''}
                                                onChange={(e) => updateSetting('azureDevOps', {
                                                    org: e.target.value,
                                                    project: settings.azureDevOps?.project || '',
                                                    pat: settings.azureDevOps?.pat || '',
                                                    enabled: settings.azureDevOps?.enabled || false
                                                })}
                                                placeholder="Organization Name"
                                            />
                                            <Input
                                                label={t('settings.integrations.azure.project')}
                                                type="text"
                                                value={settings.azureDevOps?.project || ''}
                                                onChange={(e) => updateSetting('azureDevOps', {
                                                    org: settings.azureDevOps?.org || '',
                                                    project: e.target.value,
                                                    pat: settings.azureDevOps?.pat || '',
                                                    enabled: settings.azureDevOps?.enabled || false
                                                })}
                                                placeholder="Project Name"
                                            />
                                            <Input
                                                label={t('settings.integrations.azure.pat')}
                                                type="password"
                                                value={settings.azureDevOps?.pat || ''}
                                                onChange={(e) => updateSetting('azureDevOps', {
                                                    org: settings.azureDevOps?.org || '',
                                                    project: settings.azureDevOps?.project || '',
                                                    pat: e.target.value,
                                                    enabled: settings.azureDevOps?.enabled || false
                                                })}
                                                placeholder="Personal Access Token"
                                            />
                                            <div className="flex justify-end pt-2">
                                                <Button
                                                    onClick={handleTestAzure}
                                                    disabled={testingAzure || !settings.azureDevOps?.org || !settings.azureDevOps?.project || !settings.azureDevOps?.pat}
                                                    variant="secondary"
                                                    size="sm"
                                                >
                                                    {testingAzure ? t('settings.integrations.testing') : t('settings.integrations.test_connection')}
                                                </Button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* TestLink */}
                    {isFeatureEnabled('is_integration_testlink_enabled') && (
                        <div className="border border-outline-variant/30 rounded-2xl bg-surface/30 overflow-hidden">
                            <div
                                className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-variant/10 transition-colors select-none"
                                onClick={() => toggleIntegrationExpanded('testlink')}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                        <Server size={18} />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-on-surface">{t('settings.integrations.testlink.title')}</h3>
                                        <span className="text-xs text-on-surface-variant/80">
                                            {settings.testLink?.enabled ? t('settings.integrations.enabled') : t('settings.integrations.disabled')}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                                    <Switch
                                        checked={settings.testLink?.enabled || false}
                                        onCheckedChange={(checked) => updateSetting('testLink', {
                                            url: settings.testLink?.url || '',
                                            devKey: settings.testLink?.devKey || '',
                                            projectId: settings.testLink?.projectId || '',
                                            enabled: checked
                                        })}
                                    />
                                    <Button
                                        type="button"
                                        onClick={() => toggleIntegrationExpanded('testlink')}
                                        className={clsx(
                                            "p-1.5 text-on-surface-variant/80 hover:text-on-surface bg-transparent shadow-none hover:bg-surface-variant/30 rounded-2xl transition-all duration-200",
                                            expandedIntegrations.testlink && "transform rotate-180"
                                        )}
                                    >
                                        <ChevronDown size={20} />
                                    </Button>
                                </div>
                            </div>
                            <AnimatePresence initial={false}>
                                {expandedIntegrations.testlink && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="p-4 pt-0 border-t border-outline-variant/10 space-y-3">
                                            <div className="h-2" />
                                            <Input
                                                label={t('settings.integrations.testlink.url')}
                                                type="text"
                                                value={settings.testLink?.url || ''}
                                                onChange={(e) => updateSetting('testLink', {
                                                    url: e.target.value,
                                                    devKey: settings.testLink?.devKey || '',
                                                    projectId: settings.testLink?.projectId || '',
                                                    enabled: settings.testLink?.enabled || false
                                                })}
                                                placeholder="e.g. http://localhost/testlink/lib/api/xmlrpc/v1/xmlrpc.php"
                                            />
                                            <Input
                                                label={t('settings.integrations.testlink.devkey')}
                                                type="password"
                                                value={settings.testLink?.devKey || ''}
                                                onChange={(e) => updateSetting('testLink', {
                                                    url: settings.testLink?.url || '',
                                                    devKey: e.target.value,
                                                    projectId: settings.testLink?.projectId || '',
                                                    enabled: settings.testLink?.enabled || false
                                                })}
                                                placeholder="Developer Key"
                                            />
                                            <Input
                                                label={t('settings.integrations.testlink.projectid')}
                                                type="text"
                                                value={settings.testLink?.projectId || ''}
                                                onChange={(e) => updateSetting('testLink', {
                                                    url: settings.testLink?.url || '',
                                                    devKey: settings.testLink?.devKey || '',
                                                    projectId: e.target.value,
                                                    enabled: settings.testLink?.enabled || false
                                                })}
                                                placeholder="Numerical Project ID"
                                            />
                                            <div className="flex justify-end pt-2">
                                                <Button
                                                    onClick={handleTestTestLink}
                                                    disabled={testingTestLink || !settings.testLink?.url || !settings.testLink?.devKey || !settings.testLink?.projectId}
                                                    variant="secondary"
                                                    size="sm"
                                                >
                                                    {testingTestLink ? t('settings.integrations.testing') : t('settings.integrations.test_connection')}
                                                </Button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* Git */}
                    {isFeatureEnabled('is_integration_git_enabled') && (
                        <div className="border border-outline-variant/30 rounded-2xl bg-surface/30 overflow-hidden">
                            <div
                                className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-variant/10 transition-colors select-none"
                                onClick={() => toggleIntegrationExpanded('git')}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                        <GitBranch size={18} />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-on-surface">{t('settings.integrations.git.title')}</h3>
                                        <span className="text-xs text-on-surface-variant/80">
                                            {settings.git?.enabled ? t('settings.integrations.enabled') : t('settings.integrations.disabled')}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                                    <Switch
                                        checked={settings.git?.enabled || false}
                                        onCheckedChange={(checked) => updateSetting('git', {
                                            enabled: checked,
                                            showBadges: settings.git?.showBadges || false
                                        })}
                                    />
                                    <Button
                                        type="button"
                                        onClick={() => toggleIntegrationExpanded('git')}
                                        className={clsx(
                                            "p-1.5 text-on-surface-variant/80 hover:text-on-surface bg-transparent shadow-none hover:bg-surface-variant/30 rounded-2xl transition-all duration-200",
                                            expandedIntegrations.git && "transform rotate-180"
                                        )}
                                    >
                                        <ChevronDown size={20} />
                                    </Button>
                                </div>
                            </div>
                            <AnimatePresence initial={false}>
                                {expandedIntegrations.git && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="p-4 pt-0 border-t border-outline-variant/10 space-y-3">
                                            <div className="h-2" />
                                            <div className="flex items-center justify-between py-1">
                                                <span className="text-xs font-semibold text-on-surface-variant/80 select-none">
                                                    {t('settings.integrations.git.badges')}
                                                </span>
                                                <Switch
                                                    checked={settings.git?.showBadges || false}
                                                    onCheckedChange={(checked) => updateSetting('git', {
                                                        enabled: settings.git?.enabled || false,
                                                        showBadges: checked
                                                    })}
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* Webhooks */}
                    {isFeatureEnabled('is_integration_webhooks_enabled') && (
                        <div className="border border-outline-variant/30 rounded-2xl bg-surface/30 overflow-hidden">
                            <div
                                className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-variant/10 transition-colors select-none"
                                onClick={() => toggleIntegrationExpanded('webhooks')}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                        <Slack size={18} />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-on-surface">{t('settings.integrations.webhooks.title')}</h3>
                                        <span className="text-xs text-on-surface-variant/80">
                                            {(settings.webhooks?.notifyOnPass || settings.webhooks?.notifyOnFail) ? t('settings.integrations.enabled') : t('settings.integrations.disabled')}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                                    <Switch
                                        checked={settings.webhooks?.notifyOnPass || settings.webhooks?.notifyOnFail || false}
                                        onCheckedChange={(checked) => {
                                            updateSetting('webhooks', {
                                                slackUrl: settings.webhooks?.slackUrl || '',
                                                teamsUrl: settings.webhooks?.teamsUrl || '',
                                                notifyOnPass: checked,
                                                notifyOnFail: checked
                                            });
                                        }}
                                    />
                                    <Button
                                        type="button"
                                        onClick={() => toggleIntegrationExpanded('webhooks')}
                                        className={clsx(
                                            "p-1.5 text-on-surface-variant/80 hover:text-on-surface bg-transparent shadow-none hover:bg-surface-variant/30 rounded-2xl transition-all duration-200",
                                            expandedIntegrations.webhooks && "transform rotate-180"
                                        )}
                                    >
                                        <ChevronDown size={20} />
                                    </Button>
                                </div>
                            </div>
                            <AnimatePresence initial={false}>
                                {expandedIntegrations.webhooks && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="p-4 pt-0 border-t border-outline-variant/10 space-y-3">
                                            <div className="h-2" />
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <Input
                                                    label={t('settings.integrations.webhooks.slack_url')}
                                                    type="text"
                                                    value={settings.webhooks?.slackUrl || ''}
                                                    onChange={(e) => updateSetting('webhooks', {
                                                        slackUrl: e.target.value,
                                                        teamsUrl: settings.webhooks?.teamsUrl || '',
                                                        notifyOnPass: settings.webhooks?.notifyOnPass || false,
                                                        notifyOnFail: settings.webhooks?.notifyOnFail || false
                                                    })}
                                                    placeholder="https://hooks.slack.com/services/..."
                                                />
                                                <Input
                                                    label={t('settings.integrations.webhooks.teams_url')}
                                                    type="text"
                                                    value={settings.webhooks?.teamsUrl || ''}
                                                    onChange={(e) => updateSetting('webhooks', {
                                                        slackUrl: settings.webhooks?.slackUrl || '',
                                                        teamsUrl: e.target.value,
                                                        notifyOnPass: settings.webhooks?.notifyOnPass || false,
                                                        notifyOnFail: settings.webhooks?.notifyOnFail || false
                                                    })}
                                                    placeholder="https://your-company.webhook.office.com/..."
                                                />
                                            </div>
                                            <div className="flex gap-6 pt-2">
                                                <div className="flex items-center gap-2.5">
                                                    <span className="text-xs font-semibold text-on-surface-variant/80 select-none">
                                                        {t('settings.integrations.webhooks.notify_pass')}
                                                    </span>
                                                    <Switch
                                                        checked={settings.webhooks?.notifyOnPass || false}
                                                        onCheckedChange={(checked) => updateSetting('webhooks', {
                                                            slackUrl: settings.webhooks?.slackUrl || '',
                                                            teamsUrl: settings.webhooks?.teamsUrl || '',
                                                            notifyOnPass: checked,
                                                            notifyOnFail: settings.webhooks?.notifyOnFail || false
                                                        })}
                                                    />
                                                </div>
                                                <div className="flex items-center gap-2.5">
                                                    <span className="text-xs font-semibold text-on-surface-variant/80 select-none">
                                                        {t('settings.integrations.webhooks.notify_fail')}
                                                    </span>
                                                    <Switch
                                                        checked={settings.webhooks?.notifyOnFail || false}
                                                        onCheckedChange={(checked) => updateSetting('webhooks', {
                                                            slackUrl: settings.webhooks?.slackUrl || '',
                                                            teamsUrl: settings.webhooks?.teamsUrl || '',
                                                            notifyOnPass: settings.webhooks?.notifyOnPass || false,
                                                            notifyOnFail: checked
                                                        })}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </Modal>

            {/* Page Header */}
            <PageHeader
                title={t('sidebar.settings')}
                description={t('sidebar.description_settings')}
                icon={SettingsIcon}
                iconSize="xl"
                rightElement={
                    (
                        /* Interface Zoom */
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <h3 className="text-sm font-medium text-on-surface-variant/80">{t('settings.appearance.zoom')}</h3>
                                <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-2xl">
                                    {Math.round((settings.zoomFactor || 1.0) * 100)}%
                                </span>
                            </div>
                            <div className="flex items-center gap-4">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    title={t('settings.appearance.zoom_hint')}
                                    onClick={() => updateSetting('zoomFactor', Math.max(0.7, Number(((settings.zoomFactor || 1.0) - 0.1).toFixed(1))))}
                                    className="h-8 w-8 p-0"
                                >
                                    -
                                </Button>
                                <input
                                    type="range"
                                    min="0.7"
                                    max="1.3"
                                    step="0.1"
                                    value={settings.zoomFactor || 1.0}
                                    onChange={(e) => updateSetting('zoomFactor', parseFloat(e.target.value))}
                                    className="flex-1 accent-primary h-1.5 bg-surface-variant rounded-2xl appearance-none cursor-pointer"
                                />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    title={t('settings.appearance.zoom_hint')}
                                    onClick={() => updateSetting('zoomFactor', Math.min(1.3, Number(((settings.zoomFactor || 1.0) + 0.1).toFixed(1))))}
                                    className="h-8 w-8 p-0"
                                >
                                    +
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    title={t('settings.appearance.zoom_hint')}
                                    onClick={() => updateSetting('zoomFactor', 1.0)}
                                    className="text-[10px] opacity-70 hover:opacity-100"
                                >
                                    Reset
                                </Button>
                            </div>
                        </div>
                    )
                }
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
                            containerClassName="w-[11.25rem]"
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
                <div className={clsx(
                    "mt-4 grid gap-6 items-end",
                    settings.usageMode === 'automator' ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2"
                )}>
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
                                    const currentFramework = settings.automationFramework || 'robot';
                                    if (!settings.automationFramework) {
                                        updateSetting('automationFramework', 'robot');
                                    }
                                    checkSystemVersions(mode, currentFramework);
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
                                    const framework = e.target.value as 'robot' | 'appium' | 'maestro' | 'cypress' | 'selenium';
                                    updateSetting('automationFramework', framework);
                                    checkSystemVersions('automator', framework);
                                }}
                                label={t('onboarding.step3_title')}
                                options={[
                                    { value: "robot", label: t('onboarding.framework.robot.title') },
                                    { value: "appium", label: t('onboarding.framework.appium.title') },
                                    { value: "maestro", label: t('onboarding.framework.maestro.title') },
                                    ...(isCypressEnabled ? [{ value: "cypress", label: t('onboarding.framework.cypress.title') }] : []),
                                    ...(isSeleniumEnabled ? [{ value: "selenium", label: t('onboarding.framework.selenium.title') }] : [])
                                ]}
                            />
                        </div>
                    )}
                </div>

            </Section>

            {/* Modal for Create/Rename */}
            <Modal
                isOpen={showProfileModal}
                onClose={() => setShowProfileModal(false)}
                title={isRenaming ? t('settings.profiles.rename') : t('settings.profiles.create')}
            >
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                    {creationMode !== 'import' && (
                        <Input
                            autoFocus
                            value={newProfileName}
                            onChange={(e) => setNewProfileName(e.target.value)}
                            placeholder={t('settings.profiles.name_placeholder')}
                            className="bg-surface/50"
                        />
                    )}
                    
                    {!isRenaming && (
                        <div className="space-y-4 pt-2">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <ActionCard
                                    title={t('settings.profiles.mode_default')}
                                    description={t('settings.profiles.mode_default_desc')}
                                    icon={<FilePlus size={18} />}
                                    selected={creationMode === 'default'}
                                    onClick={() => setCreationMode('default')}
                                    className="p-3"
                                />
                                <ActionCard
                                    title={t('settings.profiles.mode_clone')}
                                    description={t('settings.profiles.mode_clone_desc')}
                                    icon={<Copy size={18} />}
                                    selected={creationMode === 'clone'}
                                    onClick={() => setCreationMode('clone')}
                                    className="p-3"
                                />
                                <ActionCard
                                    title={t('settings.profiles.mode_import')}
                                    description={t('settings.profiles.mode_import_desc')}
                                    icon={<FileJson size={18} />}
                                    selected={creationMode === 'import'}
                                    onClick={() => setCreationMode('import')}
                                    className="p-3"
                                >
                                    {creationMode === 'import' && (
                                        <div className="flex flex-col gap-2 mt-2">
                                            <Button 
                                                type="button" 
                                                variant="outline" 
                                                size="sm"
                                                onClick={handleImportFile}
                                                className="w-full flex justify-center"
                                            >
                                                <FileJson size={16} className="mr-2" />
                                                {t('settings.profiles.select_file')}
                                            </Button>
                                            {importedFileName && (
                                                <div className="text-[10px] text-on-surface-variant text-center mt-1">
                                                    {t('settings.profiles.file_selected')}: <span className="font-medium truncate block max-w-full">{importedFileName}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </ActionCard>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
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
                            disabled={(creationMode !== 'import' && !newProfileName.trim()) || (creationMode === 'import' && !importedSettings)}
                            variant="primary"
                            className="hover:bg-secondary-container"
                        >
                            {t('common.save')}
                        </Button>
                    </div>
                </form>
            </Modal>

            <div className="grid gap-6">
                <div 
                    ref={splitContainerRef}
                    className={clsx("flex flex-col md:flex-row gap-6", isDragging && "select-none cursor-col-resize")}
                    style={{ '--left-width': `${leftPaneWidth}%` } as React.CSSProperties}
                >
                    {/* Appium Server Config & Control */}
                    {showAppiumSection && (
                        <div className="shrink-0 w-full md:w-[var(--left-width)] flex flex-col min-h-0">
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
                                    {appiumStatus.running && (
                                        <Button
                                            onClick={() => setShowAppiumLogs(!showAppiumLogs)}
                                            size="icon"
                                            variant="ghost"
                                            className={clsx(showAppiumLogs ? "bg-primary/10 text-primary dark:text-primary/80" : "text-on-surface/80")}
                                            title={t('settings.appium.logs')}
                                            disabled={systemCheckStatus?.missingAppium?.length > 0}
                                        >
                                            <Terminal size={18} />
                                        </Button>
                                    )}

                                    {appiumStatus.running ? (
                                        <Button
                                            onClick={toggleAppium}
                                            variant="danger"
                                            className="shadow-lg hover:shadow-xl transition-all"
                                            disabled={systemCheckStatus?.missingAppium?.length > 0}
                                            leftIcon={<Square size={16} fill="currentColor" />}
                                        >
                                            {!isNarrow && t('settings.appium.stop')}
                                        </Button>
                                    ) : (
                                        <SplitButton
                                            primaryAction={{
                                                label: t('settings.appium.start'),
                                                onClick: toggleAppium,
                                                icon: <Play size={16} fill="currentColor" />
                                            }}
                                            secondaryActions={[
                                                {
                                                    label: t('settings.appium.start_new_window'),
                                                    onClick: startAppiumNewWindow,
                                                    icon: <Terminal size={16} />
                                                }
                                            ]}
                                            disabled={systemCheckStatus?.missingAppium?.length > 0 || settings.noAppiumForRobot}
                                            variant="primary"
                                            className="shadow-lg hover:shadow-xl transition-all"
                                        />
                                    )}
                                </>
                            }
                        >

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                {settings.automationFramework === 'robot' && (
                                    <div className="col-span-1 md:col-span-2 flex items-center pt-2">
                                        <Button
                                            type="button"
                                            id="noAppiumForRobot"
                                            role="checkbox"
                                            aria-checked={settings.noAppiumForRobot || false}
                                            onClick={() => updateSetting('noAppiumForRobot', !settings.noAppiumForRobot)}
                                            className="flex items-center gap-2.5 text-left focus:outline-none select-none cursor-pointer group bg-transparent shadow-none hover:bg-transparent"
                                        >
                                            <div className={clsx(
                                                "w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 cursor-pointer",
                                                settings.noAppiumForRobot
                                                    ? "bg-primary border-primary text-on-primary"
                                                    : "border-outline-variant/30 bg-surface/50 group-hover:border-outline"
                                            )}>
                                                {settings.noAppiumForRobot && (
                                                    <div className="w-2 h-2 bg-on-primary rounded-2xl animate-in zoom-in-50 duration-200" />
                                                )}
                                            </div>
                                            <span className="text-xs font-semibold text-on-surface-variant/80 select-none cursor-pointer">
                                                {t('settings.tool_config.no_appium_for_robot')}
                                            </span>
                                        </Button>
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-4">
                                    <div title={settings.tools.appiumArgs && systemCheckStatus?.missingAppium?.length > 0 ? "Appium dependencies missing" : ""}>
                                        <Input
                                            label={t('settings.appium.host')}
                                            type="text"
                                            value={settings.appiumHost}
                                            onChange={(e) => updateSetting('appiumHost', e.target.value)}
                                            disabled={appiumStatus.running || systemCheckStatus?.missingAppium?.length > 0 || settings.noAppiumForRobot}
                                        />
                                    </div>
                                    <div title={settings.tools.appiumArgs && systemCheckStatus?.missingAppium?.length > 0 ? "Appium dependencies missing" : ""}>
                                        <Input
                                            label={t('settings.appium.port')}
                                            type="number"
                                            value={settings.appiumPort}
                                            onChange={(e) => updateSetting('appiumPort', Number(e.target.value))}
                                            disabled={appiumStatus.running || systemCheckStatus?.missingAppium?.length > 0 || settings.noAppiumForRobot}
                                        />
                                    </div>
                                </div>
                                <div title={settings.tools.appiumArgs && systemCheckStatus?.missingAppium?.length > 0 ? "Appium dependencies missing" : ""}>
                                    <Input
                                        label={t('settings.tool_config.appium_base_path')}
                                        type="text"
                                        value={settings.appiumBasePath}
                                        onChange={(e) => updateSetting('appiumBasePath', e.target.value)}
                                        disabled={appiumStatus.running || systemCheckStatus?.missingAppium?.length > 0 || settings.noAppiumForRobot}
                                        placeholder="/wd/hub"
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
                                        disabled={appiumStatus.running || systemCheckStatus?.missingAppium?.length > 0 || settings.noAppiumForRobot}
                                        placeholder="--allow-insecure chromedriver"
                                    />
                                </div>
                            </div>

                            {/* Logs Output */}
                            {showAppiumLogs && appiumStatus.running && (
                                <div className="mt-4 relative animate-in fade-in duration-300">
                                    <div
                                        ref={logsContainerRef}
                                        className="bg-surface/50 border border-outline-variant/30 rounded-2xl p-3 font-mono text-xs h-64 overflow-auto custom-scrollbar shadow-inner"
                                    >
                                        {appiumLogs.length === 0 && <span className="text-on-surface-variant/80 italic">{t('settings.appium.waiting')}</span>}
                                        {appiumLogs.map((log, i) => (
                                            <div key={i} className="text-on-surface-variant/80 space-pre-wrap border-b border-outline-variant/30 pb-0.5 mb-0.5">{log}</div>
                                        ))}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={openAppiumLogTerminal}
                                        className="absolute top-2 right-2 m-1 bg-surface-variant/80 hover:bg-surface-variant backdrop-blur-sm shadow-sm"
                                        title={t('settings.appium.open_log_terminal')}
                                    >
                                        <Monitor size={16} />
                                    </Button>
                                </div>
                            )}
                        </Section>
                        </div>
                    )}

                    {showAppiumSection && (
                        <div 
                            className="hidden md:flex w-1 bg-outline-variant/30 hover:bg-primary/60 cursor-col-resize shrink-0 transition-colors z-10 shadow-[0_0_0_2px_transparent] hover:shadow-[0_0_0_2px_rgba(var(--color-primary),0.2)] self-stretch rounded-full"
                            onPointerDown={handlePointerDown}
                        />
                    )}

                    {/* Tool Options */}
                    <div className={clsx("flex flex-col min-h-0", !showAppiumSection ? "w-full" : "flex-1")}>
                        <Section
                            title={t('settings.tools')}
                            icon={Wrench}
                        menus={
                            is_test_mode !== 'web' ? (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleRestartADB}
                                    disabled={isRestartingADB}
                                    leftIcon={isRestartingADB ? <ExpressiveLoading size="xsm" variant="circular" /> : <RefreshCcw size={16} />}
                                    className="text-on-surface/80 hover:text-primary hover:bg-primary/10"
                                >
                                    {t('settings.action.restart_adb')}
                                </Button>
                            ) : undefined
                        }
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {['robotArgs', 'maestroArgs', 'appiumJavaArgs', 'cypressArgs', 'seleniumArgs', 'scrcpyArgs'].map((key) => {
                                if (key === 'robotArgs' && (settings.usageMode === 'explorer' || (settings.automationFramework && settings.automationFramework !== 'robot'))) return null;
                                if (key === 'maestroArgs' && (settings.usageMode === 'explorer' || settings.automationFramework !== 'maestro')) return null;
                                if (key === 'appiumJavaArgs' && (settings.usageMode === 'explorer' || settings.automationFramework !== 'appium')) return null;
                                if (key === 'cypressArgs' && (settings.usageMode === 'explorer' || settings.automationFramework !== 'cypress')) return null;
                                if (key === 'seleniumArgs' && (settings.usageMode === 'explorer' || settings.automationFramework !== 'selenium')) return null;
                                if (key === 'scrcpyArgs' && is_test_mode === 'web') return null;

                                let isDisabled = false;
                                if (key === 'robotArgs' && systemCheckStatus?.missingTesting?.length > 0) isDisabled = true;
                                if (key === 'maestroArgs' && systemCheckStatus?.missingTesting?.length > 0) isDisabled = true;
                                if (key === 'appiumJavaArgs' && systemCheckStatus?.missingTesting?.length > 0) isDisabled = true;
                                if (key === 'cypressArgs' && systemCheckStatus?.missingTesting?.length > 0) isDisabled = true;
                                if (key === 'seleniumArgs' && systemCheckStatus?.missingTesting?.length > 0) isDisabled = true;
                                if (key === 'scrcpyArgs' && systemCheckStatus?.missingMirroring?.length > 0) isDisabled = true;

                                let labelKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                                if (key === 'appiumJavaArgs') labelKey = 'appium_java_args';

                                return (
                                    <div key={key} className={clsx(key === 'scrcpyArgs' && settings.usageMode === 'explorer' && "col-span-1 md:col-span-2")}>
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
                            {is_test_mode !== 'web' && (
                                <div className="col-span-1 md:col-span-2">
                                    <TagInput
                                        label={t('settings.tool_config.app_packages')}
                                        tags={settings.tools.appPackage.split(',').map(p => p.trim()).filter(Boolean)}
                                        onChange={(tags) => {
                                            updateSetting('tools', { ...settings.tools, appPackage: tags.join(', ') });
                                        }}
                                        placeholder={t('settings.tool_config.add_package_placeholder')}
                                    />
                                </div>
                            )}
                            <div className="col-span-1 md:col-span-2">
                                <PathInput
                                    label={t('settings.tool_config.custom_adb_path' as any)}
                                    value={settings.customAdbPath || ''}
                                    onSelect={(path) => updateSetting('customAdbPath', path)}
                                    placeholder={t('settings.not_set')}
                                    directory={false}
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
                </div>


                {/* Path Configuration */}
                <Section
                    title={t('settings.paths.title')}
                    icon={FolderOpen}
                    menus={
                        isFeatureEnabled('is_integrations_enabled') && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowIntegrationsModal(true)}
                                leftIcon={<Link2 size={16} />}
                                className="text-on-surface/80 hover:text-primary hover:bg-primary/10"
                            >
                                {t('settings.integrations.title')}
                            </Button>
                        )
                    }
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(['automationRoot', 'resources', 'tests', 'suites', 'logs', 'logcat', 'screenshots', 'recordings', 'mappings'] as Array<keyof typeof settings.paths>).map((key) => {
                            const isTestingPath = ['automationRoot', 'resources', 'tests', 'suites'].includes(key);
                            if (isTestingPath && settings.usageMode === 'explorer') return null;
                            if (key === 'logcat' && is_test_mode === 'web') return null;
                            const isDisabled = isTestingPath && systemCheckStatus?.missingTesting?.length > 0;
                            return (
                                <PathInput
                                    key={key}
                                    label={t(`settings.path_labels.${key}` as any)}
                                    value={settings.paths[key] || ''}
                                    onSelect={async (path) => {
                                        if (key === 'mappings') {
                                            const oldPath = settings.paths.mappings;
                                            if (oldPath && oldPath !== path) {
                                                try {
                                                    const oldEntries = await invoke<any[]>('list_directory', { path: oldPath });
                                                    const newEntries = await invoke<any[]>('list_directory', { path });
                                                    const hasMappingsInSource = oldEntries.some(entry => entry.name.endsWith('.json'));
                                                    const hasMappingsInDestination = newEntries.some(entry => entry.name.endsWith('.json'));

                                                    if (hasMappingsInSource && hasMappingsInDestination) {
                                                        feedback.toast.error('settings.paths.migration_destination_not_empty');
                                                        return;
                                                    }
                                                } catch (error) {
                                                    console.warn('Failed to validate mappings migration paths', error);
                                                }

                                                setMigrationPending({ oldPath, newPath: path });
                                                return; // Do not update setting yet, wait for modal
                                            }
                                        }
                                        updateSetting('paths', { ...settings.paths, [key]: path });
                                    }}
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
                            <>
                                {/* Primary Color */}
                                <div>
                                    {/* <h3 className="text-sm font-medium text-on-surface-variant/80 mb-3">{t('settings.appearance.primary_color')}</h3> */}
                                    <div className="grid grid-cols-4 md:grid-cols-4 lg:grid-cols-8 gap-3">
                                        {[
                                            { id: 'blue', hex: '#2563eb' },
                                            { id: 'red', hex: '#dc2626' },
                                            { id: 'green', hex: '#16a34a' },
                                            { id: 'purple', hex: '#9333ea' },
                                            { id: 'orange', hex: '#ea580c' },
                                            { id: 'cyan', hex: '#0891b2' },
                                            { id: 'pink', hex: '#db2777' },
                                            { id: 'custom', hex: '#ffffff' },
                                        ].map((color) => (
                                            <Button
                                                key={color.id}
                                                onClick={color.id === 'custom' ? () => {
                                                    setCustomColorHex(settings.primaryColor?.startsWith('#') ? settings.primaryColor : '#ffffff');
                                                    setShowCustomColorModal(true);
                                                } : () => updateSetting('primaryColor', color.id)}
                                                variant="ghost"
                                                className={clsx(
                                                    "w-6 h-6 rounded-2xl p-0 min-w-0 transition-transform",
                                                    (settings.primaryColor === color.id || (color.id === 'custom' && settings.primaryColor?.startsWith('#'))) ? "ring-2 scale-110" : "hover:scale-105"
                                                )}
                                                style={{
                                                    backgroundColor: color.id === 'custom' && settings.primaryColor?.startsWith('#') ? settings.primaryColor : color.hex,
                                                    borderColor: color.id === 'custom' && settings.primaryColor?.startsWith('#') ? settings.primaryColor : color.hex,
                                                    '--tw-ring-color': color.id === 'custom' && settings.primaryColor?.startsWith('#') ? settings.primaryColor : color.hex
                                                } as any}
                                                title={t(`settings.appearance.${color.id}_color` as any)}>
                                                {(settings.primaryColor === color.id || (color.id === 'custom' && settings.primaryColor?.startsWith('#'))) && (
                                                    <div className="w-2.5 h-2.5 bg-on-primary rounded-2xl shadow-sm" />
                                                )}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        }
                        actions={
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


                        {/* Sidebar Logo */}
                        <div className="space-y-4 pt-1">
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
                    <Section
                        title={t('settings.ai.title')}
                        icon={Sparkles}
                        menus={
                            <div className="space-y-4">
                                <Select
                                    value={settings.aiProvider || 'gemini'}
                                    onChange={(e) => updateSetting('aiProvider', e.target.value as any)}
                                    containerClassName="w-48"
                                    options={[
                                        { value: 'gemini', label: t('settings.ai.gemini.title') },
                                        { value: 'claude', label: t('settings.ai.claude.title') },
                                        { value: 'openai', label: t('settings.ai.openai.title') },
                                        { value: 'claude-code', label: t('settings.ai.claude_code.title') },
                                        { value: 'antigravity-cli', label: t('settings.ai.antigravity.title') }
                                    ]}
                                />
                            </div>
                        }
                    >

                        {/* Gemini Config */}
                        {settings.aiProvider === 'gemini' && (
                            <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                                <Input
                                    label={t('settings.ai.key')}
                                    type="password"
                                    value={settings.geminiApiKey || ''}
                                    onChange={(e) => updateSetting('geminiApiKey', e.target.value)}
                                    placeholder={t('settings.ai.gemini.placeholder')}
                                />
                                <p className="text-[10px] text-on-surface-variant/80 mt-1">
                                    {t('settings.ai.gemini.help')}{' '}
                                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">Google AI Studio</a>
                                </p>
                                <div className="relative">
                                    <Input
                                        label={t('settings.ai.model')}
                                        type="text"
                                        value={settings.geminiModel || 'gemini-1.5-flash'}
                                        onChange={(e) => updateSetting('geminiModel', e.target.value)}
                                        onFocus={() => {
                                            handleFetchModels();
                                        }}
                                        onBlur={() => setTimeout(() => setShowModelList(false), 200)}
                                        placeholder="e.g. gemini-1.5-flash"
                                    />
                                    {showModelList && settings.aiProvider === 'gemini' && (
                                        <div className="absolute z-10 w-full mt-1 bg-surface border border-outline-variant/30 rounded-2xl shadow-lg max-h-48 overflow-auto custom-scrollbar">
                                            {isFetchingModels ? (
                                                <div className="px-3 py-4 flex items-center justify-center gap-3 text-sm text-on-surface-variant/70 italic">
                                                    <ExpressiveLoading size="xsm" variant="circular" />
                                                    <span>{t('settings.ai.loading_models')}</span>
                                                </div>
                                            ) : modelFetchError ? (
                                                <div className="px-3 py-4 text-xs text-error/80 flex flex-col gap-1">
                                                    <span className="font-medium">{t('common.error_occurred')}</span>
                                                    <span className="opacity-70">{modelFetchError}</span>
                                                </div>
                                            ) : availableModels.length > 0 ? (
                                                availableModels.map(model => (
                                                    <Button
                                                        variant="unstyled"
                                                        key={model}
                                                        type="button"
                                                        className="justify-start w-full text-left px-3 py-2 text-sm text-on-surface/80 hover:bg-primary/10 hover:text-primary transition-colors border-b border-outline-variant/5 last:border-0"
                                                        onMouseDown={() => { updateSetting('geminiModel', model); setShowModelList(false); }}
                                                        onClick={() => { updateSetting('geminiModel', model); setShowModelList(false); }}
                                                    >
                                                        {model}
                                                    </Button>
                                                ))
                                            ) : (
                                                <div className="px-3 py-4 text-sm text-on-surface-variant/60 italic text-center">
                                                    {t('settings.ai.no_models_found')}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Claude Config */}
                        {settings.aiProvider === 'claude' && (
                            <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                                <Input
                                    label={t('settings.ai.key')}
                                    type="password"
                                    value={settings.claudeApiKey || ''}
                                    onChange={(e) => updateSetting('claudeApiKey', e.target.value)}
                                    placeholder={t('settings.ai.claude.placeholder')}
                                />
                                <p className="text-[10px] text-on-surface-variant/80 mt-1">
                                    {t('settings.ai.claude.help')}{' '}
                                    <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">Anthropic Console</a>
                                </p>
                                <div className="relative">
                                    <Input
                                        label={t('settings.ai.model')}
                                        type="text"
                                        value={settings.claudeModel || 'claude-3-5-sonnet-20240620'}
                                        onChange={(e) => updateSetting('claudeModel', e.target.value)}
                                        onFocus={() => {
                                            handleFetchModels();
                                        }}
                                        onBlur={() => setTimeout(() => setShowModelList(false), 200)}
                                        placeholder="e.g. claude-3-5-sonnet-20240620"
                                    />
                                    {showModelList && settings.aiProvider === 'claude' && (
                                        <div className="absolute z-10 w-full mt-1 bg-surface border border-outline-variant/30 rounded-2xl shadow-lg max-h-48 overflow-auto custom-scrollbar">
                                            {isFetchingModels ? (
                                                <div className="px-3 py-4 flex items-center justify-center gap-3 text-sm text-on-surface-variant/70 italic">
                                                    <ExpressiveLoading size="xsm" variant="circular" />
                                                    <span>{t('settings.ai.loading_models')}</span>
                                                </div>
                                            ) : modelFetchError ? (
                                                <div className="px-3 py-4 text-xs text-error/80 flex flex-col gap-1">
                                                    <span className="font-medium">{t('common.error_occurred')}</span>
                                                    <span className="opacity-70">{modelFetchError}</span>
                                                </div>
                                            ) : availableModels.length > 0 ? (
                                                availableModels.map(model => (
                                                    <Button
                                                        variant="unstyled"
                                                        key={model}
                                                        type="button"
                                                        className="justify-start w-full text-left px-3 py-2 text-sm text-on-surface/80 hover:bg-primary/10 hover:text-primary transition-colors border-b border-outline-variant/5 last:border-0"
                                                        onMouseDown={() => { updateSetting('claudeModel', model); setShowModelList(false); }}
                                                        onClick={() => { updateSetting('claudeModel', model); setShowModelList(false); }}
                                                    >
                                                        {model}
                                                    </Button>
                                                ))
                                            ) : (
                                                <div className="px-3 py-4 text-sm text-on-surface-variant/60 italic text-center">
                                                    {t('settings.ai.no_models_found')}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* OpenAI Config */}
                        {settings.aiProvider === 'openai' && (
                            <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                                <Input
                                    label={t('settings.ai.key')}
                                    type="password"
                                    value={settings.openaiApiKey || ''}
                                    onChange={(e) => updateSetting('openaiApiKey', e.target.value)}
                                    placeholder={t('settings.ai.openai.placeholder')}
                                />
                                <p className="text-[10px] text-on-surface-variant/80 mt-1">
                                    {t('settings.ai.openai.help')}{' '}
                                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">OpenAI Platform</a>
                                </p>
                                <div className="relative">
                                    <Input
                                        label={t('settings.ai.model')}
                                        type="text"
                                        value={settings.openaiModel || 'gpt-4o'}
                                        onChange={(e) => updateSetting('openaiModel', e.target.value)}
                                        onFocus={() => {
                                            handleFetchModels();
                                        }}
                                        onBlur={() => setTimeout(() => setShowModelList(false), 200)}
                                        placeholder="e.g. gpt-4o"
                                    />
                                    {showModelList && settings.aiProvider === 'openai' && (
                                        <div className="absolute z-10 w-full mt-1 bg-surface border border-outline-variant/30 rounded-2xl shadow-lg max-h-48 overflow-auto custom-scrollbar">
                                            {isFetchingModels ? (
                                                <div className="px-3 py-4 flex items-center justify-center gap-3 text-sm text-on-surface-variant/70 italic">
                                                    <ExpressiveLoading size="xsm" variant="circular" />
                                                    <span>{t('settings.ai.loading_models')}</span>
                                                </div>
                                            ) : modelFetchError ? (
                                                <div className="px-3 py-4 text-xs text-error/80 flex flex-col gap-1">
                                                    <span className="font-medium">{t('common.error_occurred')}</span>
                                                    <span className="opacity-70">{modelFetchError}</span>
                                                </div>
                                            ) : availableModels.length > 0 ? (
                                                availableModels.map(model => (
                                                    <Button
                                                        variant="unstyled"
                                                        key={model}
                                                        type="button"
                                                        className="justify-start w-full text-left px-3 py-2 text-sm text-on-surface/80 hover:bg-primary/10 hover:text-primary transition-colors border-b border-outline-variant/5 last:border-0"
                                                        onMouseDown={() => { updateSetting('openaiModel', model); setShowModelList(false); }}
                                                        onClick={() => { updateSetting('openaiModel', model); setShowModelList(false); }}
                                                    >
                                                        {model}
                                                    </Button>
                                                ))
                                            ) : (
                                                <div className="px-3 py-4 text-sm text-on-surface-variant/60 italic text-center">
                                                    {t('settings.ai.no_models_found')}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Claude Code CLI Config */}
                        {settings.aiProvider === 'claude-code' && (
                            <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-3">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 p-2 rounded-xl bg-primary/10 text-primary">
                                            <Terminal size={18} />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium text-on-surface">
                                                {t('settings.ai.claude_code.title')}
                                            </p>
                                            <p className="text-xs text-on-surface-variant leading-relaxed">
                                                {t('settings.ai.claude_code.help')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="pt-2 flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${isClaudeCodeInstalled ? 'bg-success' : 'bg-error animate-pulse'}`} />
                                            <span className="text-xs font-medium text-on-surface-variant">
                                                {isClaudeCodeInstalled
                                                    ? t('settings.ai.claude_code.installed', { version: claudeCodeVersion })
                                                    : t('settings.ai.claude_code.not_installed')
                                                }
                                            </span>
                                        </div>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => checkSystemVersions()}
                                            className="h-8 px-3 text-[11px]"
                                        >
                                            {t('settings.ai.claude_code.check_install')}
                                        </Button>
                                    </div>

                                    <div className="pt-2">
                                        <Input
                                            label={t('settings.ai.claude_code.token_label')}
                                            type="password"
                                            value={settings.claudeCodeToken || ''}
                                            onChange={(e) => updateSetting('claudeCodeToken', e.target.value)}
                                            placeholder={t('settings.ai.claude_code.token_placeholder')}
                                        />
                                        <p className="text-[10px] text-on-surface-variant/80 mt-1">
                                            {t('settings.ai.claude_code.token_help')}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Antigravity CLI Config */}
                        {settings.aiProvider === 'antigravity-cli' && (
                            <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-3">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 p-2 rounded-xl bg-primary/10 text-primary">
                                            <Terminal size={18} />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium text-on-surface">
                                                {t('settings.ai.antigravity.title')}
                                            </p>
                                            <p className="text-xs text-on-surface-variant leading-relaxed">
                                                {t('settings.ai.antigravity.help')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="pt-2 flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${isAntigravityInstalled ? 'bg-success' : 'bg-error animate-pulse'}`} />
                                            <span className="text-xs font-medium text-on-surface-variant">
                                                {isAntigravityInstalled
                                                    ? t('settings.ai.antigravity.installed', { version: antigravityVersion })
                                                    : t('settings.ai.antigravity.not_installed')
                                                }
                                            </span>
                                        </div>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => checkSystemVersions()}
                                            className="h-8 px-3 text-[11px]"
                                        >
                                            {t('settings.ai.antigravity.check_install')}
                                        </Button>
                                    </div>

                                    <div className="pt-2">
                                        <Input
                                            label={t('settings.ai.antigravity.token_label')}
                                            type="password"
                                            value={settings.antigravityApiKey || ''}
                                            onChange={(e) => updateSetting('antigravityApiKey', e.target.value)}
                                            placeholder={t('settings.ai.antigravity.token_placeholder')}
                                        />
                                        <p className="text-[10px] text-on-surface-variant/80 mt-1">
                                            {t('settings.ai.antigravity.token_help')}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* <div className="pt-4 border-t border-outline-variant/30 mt-4 animate-in fade-in duration-500">
                                <Input
                                    label={t('settings.ai.max_exploration_steps')}
                                    type="number"
                                    min={1}
                                    max={500}
                                    value={settings.maxExplorationSteps || 30}
                                    onChange={(e) => updateSetting('maxExplorationSteps', Math.max(1, parseInt(e.target.value) || 1))}
                                />
                                <p className="text-[10px] text-on-surface-variant/80 mt-1">
                                    {t('settings.ai.max_exploration_steps_help')}
                                </p>
                            </div> */}
                    </Section>
                </div>



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
                                    systemCheckStatus.loading ? "text-primary dark:text-primary/80 bg-primary/10" : "text-on-surface-variant/80 hover:text-primary"
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {systemVersions ? (
                            (['adb', 'node', 'appium', 'uiautomator2', 'scrcpy', 'python', 'robot', 'appium_lib', 'java', 'maven', 'maestro', 'ngrok'] as Array<keyof typeof systemVersions>)
                                .filter(key => {
                                    if (key === 'ngrok' && !isNgrokEnabled) return false;
                                    if (is_test_mode === 'web' && ['adb', 'scrcpy'].includes(key)) return false;
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

            {/* Custom Color Modal */}
            <Modal
                isOpen={showCustomColorModal}
                onClose={() => setShowCustomColorModal(false)}
                title={t('settings.appearance.custom_color')}
            >
                <div className="p-4 flex flex-col gap-4">
                    <p className="text-sm text-on-surface-variant">
                        {t('settings.appearance.custom_color_description') || 'Select a custom primary color for the application.'}
                    </p>
                    <div className="flex gap-4 items-center">
                        <input
                            type="color"
                            value={customColorHex}
                            onChange={(e) => setCustomColorHex(e.target.value)}
                            className="w-12 h-12 rounded cursor-pointer border-none p-0 bg-transparent"
                            style={{ colorScheme: settings.theme }}
                        />
                        <Input
                            type="text"
                            value={customColorHex}
                            onChange={(e) => {
                                const val = e.target.value;
                                setCustomColorHex(val);
                            }}
                            placeholder="#RRGGBB"
                            className="flex-1 font-mono uppercase"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 p-4 border-t border-outline-variant/30 bg-surface-variant/30">
                    <Button variant="ghost" onClick={() => setShowCustomColorModal(false)}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="primary"
                        onClick={() => {
                            if (/^#[0-9A-Fa-f]{6}$/i.test(customColorHex)) {
                                updateSetting('primaryColor', customColorHex);
                                setShowCustomColorModal(false);
                            } else {
                                feedback.toast.error('Invalid hex color. Please use #RRGGBB format.');
                            }
                        }}
                    >
                        {t('common.save')}
                    </Button>
                </div>
            </Modal>
        </div>
    );
}

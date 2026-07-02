import { LazyStore } from '@tauri-apps/plugin-store';
import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { invoke } from '@tauri-apps/api/core';
import { feedback } from './feedback';
import { checkForUpdates, UpdateInfo } from './updater';
import { getRemoteString } from './remoteConfig';

export interface SystemVersions {
    adb: string;
    node: string;
    appium: string;
    uiautomator2: string;
    python: string;
    robot: string;
    appium_lib: string;
    java: string;
    maven: string;
    maestro: string;
    scrcpy: string;
    ngrok: string;
    claude_code: string;
    antigravity: string;
    cypress: string;
    pytest: string;
}

// Initialize the store
const store = new LazyStore('settings.json');

export interface AppSettings {
    theme: 'dark' | 'light';
    language: string;
    primaryColor: string;
    customLogoLight?: string;
    customLogoDark?: string;
    recycleDeviceViews: boolean; // New setting
    allowActionsDuringTest: boolean; // Control whether actions are allowed during test
    saveLogs: boolean; // Persist log saving preference
    usageMode?: 'explorer' | 'automator';
    automationFramework?: 'robot' | 'appium' | 'maestro' | 'cypress' | 'selenium';
    explorerPlatform?: 'mobile' | 'web';
    customAdbPath?: string;
    noAppiumForRobot?: boolean;

    // Appium
    appiumHost: string;
    appiumPort: number;
    appiumBasePath: string;

    // Paths
    paths: {
        suites: string;
        tests: string;
        resources: string;
        logs: string;
        logcat: string;
        screenshots: string;
        recordings: string;
        automationRoot: string;
        mappings?: string;
    };
    logcatKeywords?: string[];

    // Tools
    tools: {
        appiumArgs: string;
        scrcpyArgs: string;
        robotArgs: string;
        maestroArgs: string;
        appiumJavaArgs: string;
        appPackage: string; // for monitoring/logcat filtering
        ngrokToken: string;
        cypressArgs: string;
        seleniumArgs: string;
    };

    // AI
    aiProvider: 'gemini' | 'claude' | 'openai' | 'claude-code' | 'antigravity-cli';
    geminiApiKey?: string;
    antigravityApiKey?: string;
    geminiModel: string;
    claudeApiKey?: string;
    claudeModel: string;
    openaiApiKey?: string;
    openaiModel: string;
    maxExplorationSteps?: number;
    presentationEnabled: boolean;
    zoomFactor: number;
    claudeCodeToken?: string;
    aiChatEnabled: boolean;
    aiTestModeEnabled: boolean;
    aiSessionId?: string;
    updateChannel?: 'stable' | 'beta' | 'alpha';
    azureDevOps?: {
        org: string;
        project: string;
        pat: string;
        enabled: boolean;
    };
    jira?: {
        host: string;
        email: string;
        apiToken: string;
        projectKey: string;
        enabled: boolean;
    };
    testLink?: {
        url: string;
        devKey: string;
        projectId: string;
        enabled: boolean;
    };
    git?: {
        enabled: boolean;
        showBadges: boolean;
    };
    webhooks?: {
        slackUrl: string;
        teamsUrl: string;
        notifyOnPass: boolean;
        notifyOnFail: boolean;
    };
}

const getDefaultSettings = (): AppSettings => ({
    theme: 'dark',
    language: 'en_US',
    primaryColor: 'blue',
    aiProvider: 'gemini',
    geminiApiKey: '',
    antigravityApiKey: '',
    geminiModel: getRemoteString('default_gemini_model') || 'gemini-3.1-flash-lite',
    claudeApiKey: '',
    claudeModel: getRemoteString('default_claude_model') || 'claude-3-5-sonnet-20240620',
    openaiApiKey: '',
    openaiModel: getRemoteString('default_openai_model') || 'gpt-4o',
    recycleDeviceViews: false, // Default to false
    allowActionsDuringTest: false, // Default to false (blocking)
    saveLogs: false, // Default to false
    explorerPlatform: 'mobile',
    appiumHost: '127.0.0.1',
    appiumPort: 4723,
    appiumBasePath: '/',
    paths: {
        automationRoot: '',
        resources: '',
        tests: '',
        suites: '',
        logs: '',
        logcat: '',
        screenshots: '',
        recordings: '',
        mappings: '',
    },
    logcatKeywords: [],
    tools: {
        appiumArgs: getRemoteString('default_appium_args') || '--relaxed-security',
        scrcpyArgs: getRemoteString('default_scrcpy_args') || '-m 1024 -b 2M --max-fps=30 --no-audio --stay-awake',
        robotArgs: '--split-log',
        maestroArgs: '',
        appiumJavaArgs: 'test',
        appPackage: 'com.android.chrome, com.chrome.beta',
        ngrokToken: '',
        cypressArgs: '',
        seleniumArgs: ''
    },
    maxExplorationSteps: 30,
    presentationEnabled: false,
    zoomFactor: 1.0,
    claudeCodeToken: '',
    aiChatEnabled: false,
    aiTestModeEnabled: false,
    aiSessionId: undefined,
    updateChannel: 'stable',
    customAdbPath: '',
    noAppiumForRobot: false,
    azureDevOps: {
        org: '',
        project: '',
        pat: '',
        enabled: false
    },
    jira: {
        host: '',
        email: '',
        apiToken: '',
        projectKey: '',
        enabled: false
    },
    testLink: {
        url: '',
        devKey: '',
        projectId: '',
        enabled: false
    },
    git: {
        enabled: false,
        showBadges: false
    },
    webhooks: {
        slackUrl: '',
        teamsUrl: '',
        notifyOnPass: false,
        notifyOnFail: false
    }
});

export interface Profile {
    id: string;
    name: string;
    settings: AppSettings;
}

interface SettingsStoreData {
    activeProfileId: string;
    profiles: Record<string, Profile>;
}

const SECRET_PATHS = [
    ['geminiApiKey'],
    ['antigravityApiKey'],
    ['claudeApiKey'],
    ['openaiApiKey'],
    ['claudeCodeToken'],
    ['tools', 'ngrokToken'],
    ['azureDevOps', 'pat'],
    ['jira', 'apiToken'],
    ['testLink', 'devKey'],
    ['webhooks', 'slackUrl'],
    ['webhooks', 'teamsUrl']
];

async function encryptValue(val: string | undefined | null): Promise<string> {
    if (!val || typeof val !== 'string' || val.trim() === '' || val.startsWith('enc:')) {
        return val || '';
    }
    try {
        const encrypted = await invoke<string>('encrypt_secret', { plainText: val });
        return `enc:${encrypted}`;
    } catch (e) {
        console.error("Encryption failed for secret:", e);
        return val;
    }
}

async function decryptValue(val: string | undefined | null): Promise<string> {
    if (!val || typeof val !== 'string' || !val.startsWith('enc:')) {
        return val || '';
    }
    try {
        const encryptedPart = val.substring(4);
        return await invoke<string>('decrypt_secret', { encryptedText: encryptedPart });
    } catch (e) {
        console.error("Decryption failed for secret:", e);
        return '';
    }
}

async function processSettingsSecrets<T>(settings: T, mode: 'encrypt' | 'decrypt'): Promise<T> {
    const copy = structuredClone(settings);
    const fn = mode === 'encrypt' ? encryptValue : decryptValue;
    const promises: Promise<void>[] = [];

    for (const path of SECRET_PATHS) {
        let parent: unknown = copy;
        for (let i = 0; i < path.length - 1; i++) {
            if (isObject(parent)) {
                parent = parent[path[i]];
            } else {
                parent = undefined;
                break;
            }
        }
        if (isObject(parent)) {
            const lastKey = path[path.length - 1];
            if (parent[lastKey] !== undefined && parent[lastKey] !== null) {
                // Ensure we capture the exact parent reference and key for the promise
                const p = parent;
                const k = lastKey;
                promises.push(
                    fn(p[k] as string).then(val => { p[k] = val; })
                );
            }
        }
    }
    await Promise.all(promises);
    return copy;
}

async function processStoreDataSecrets(data: SettingsStoreData, mode: 'encrypt' | 'decrypt'): Promise<SettingsStoreData> {
    const copy = structuredClone(data);
    const promises: Promise<void>[] = [];

    if (copy.profiles) {
        for (const pid of Object.keys(copy.profiles)) {
            if (copy.profiles[pid]?.settings) {
                promises.push(
                    processSettingsSecrets(copy.profiles[pid].settings, mode).then(settings => {
                        copy.profiles[pid].settings = settings;
                    })
                );
            }
        }
    }
    await Promise.all(promises);
    return copy;
}
// Initial Check Status Interface
export interface SystemCheckStatus {
    loading: boolean;
    complete: boolean;
    missingCritical: string[]; // Only ADB
    missingAppium: string[]; // Node, Appium, UiAutomator2 -- affects Appium Settings & Controls
    missingTesting: string[]; // Python, Robot, AppiumLibrary -- affects Launcher Tab
    missingMirroring: string[]; // Scrcpy -- affects Mirroring options
    missingTunnelling: string[]; // Ngrok -- affects Connect Tab remote features
}


interface SettingsContextType {
    settings: AppSettings;
    activeProfileId: string;
    profiles: Profile[];
    updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
    setMultipleSettings: (newSettings: Partial<AppSettings>) => void;
    createProfile: (name: string) => void;
    switchProfile: (id: string) => void;
    renameProfile: (id: string, name: string) => void;
    deleteProfile: (id: string) => void;
    loading: boolean;
    hasHydrated: boolean;
    systemVersions: SystemVersions | null;
    checkSystemVersions: (forceUsageMode?: 'explorer' | 'automator', forceFramework?: 'robot' | 'appium' | 'maestro' | 'cypress' | 'selenium', silent?: boolean) => Promise<void>;
    systemCheckStatus: SystemCheckStatus;
    updateInfo: UpdateInfo | null;
    checkForAppUpdate: (manual?: boolean) => Promise<void>;
    isNgrokEnabled: boolean;
    enableNgrok: () => void;
    is_test_mode: 'mobile' | 'web';
    activeWebUrl: string;
    setActiveWebUrl: (url: string) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [storeData, setStoreData] = useState<SettingsStoreData>({
        activeProfileId: 'default',
        profiles: {
            'default': { id: 'default', name: 'Default', settings: getDefaultSettings() }
        }
    });
    const [activeWebUrl, setActiveWebUrl] = useState<string>('https://google.com');
    const [loading, setLoading] = useState(true);
    const [hasHydrated, setHasHydrated] = useState(false);
    const [isNgrokEnabled, setIsNgrokEnabled] = useState(false);

    const enableNgrok = () => {
        setIsNgrokEnabled(true);
    };

    const isRootOrTooBroadPath = (path: string): boolean => {
        const normalized = path.replace(/\\/g, '/');
        if (normalized === '/') return true;
        if (/^[A-Za-z]:\/?$/.test(normalized)) return true;
        if (/^\/\/[^/]+\/?$/.test(normalized)) return true;
        return false;
    };

    const sanitizeWorkspacePaths = (paths: unknown[]): string[] => {
        const sanitized: string[] = [];
        const seen = new Set<string>();

        paths.forEach((rawPath) => {
            if (typeof rawPath !== 'string') return;

            const trimmed = rawPath.trim();
            if (!trimmed) return;

            const withoutTrailingSeparator = trimmed.replace(/[\\/]+$/, '') || trimmed;
            if (isRootOrTooBroadPath(withoutTrailingSeparator)) return;

            const dedupeKey = withoutTrailingSeparator.replace(/\\/g, '/').toLowerCase();
            if (seen.has(dedupeKey)) return;
            seen.add(dedupeKey);
            sanitized.push(withoutTrailingSeparator);
        });

        return sanitized;
    };

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        // Safety timeout for store operations (8s)
        const safetyTimer = setTimeout(() => {
            setLoading(currentLoading => {
                if (currentLoading) {
                    console.warn("[Settings] Store load taking too long, bypassing loading state...");
                    return false;
                }
                return currentLoading;
            });
        }, 8000);

        try {
            const saved = await store.get<SettingsStoreData>('app_config');
            clearTimeout(safetyTimer);

            if (saved) {
                let decryptedSaved = saved;
                try {
                    decryptedSaved = await processStoreDataSecrets(saved, 'decrypt');
                } catch (e) {
                    console.error("[Settings] Decryption of store data failed:", e);
                }

                // Migration Logic
                if (decryptedSaved.profiles) {
                    // It's already the new format
                    // Just ensure defaults for missing fields in existing profiles
                    const migrated = { ...decryptedSaved };
                    Object.keys(migrated.profiles).forEach(pid => {
                        migrated.profiles[pid].settings = deepMerge(getDefaultSettings(), migrated.profiles[pid].settings);
                        migrated.profiles[pid].settings.aiChatEnabled = false;
                        migrated.profiles[pid].settings.aiTestModeEnabled = false;
                        
                        // Active Migration for Remote Config overrides
                        const s = migrated.profiles[pid].settings;
                        const ds = getDefaultSettings();
                        if (s.geminiModel === 'gemini-1.5-flash' || s.geminiModel === 'gemini-3.1-flash-lite') s.geminiModel = ds.geminiModel;
                        if (s.claudeModel === 'claude-3-5-sonnet-20240620') s.claudeModel = ds.claudeModel;
                        if (s.openaiModel === 'gpt-4o') s.openaiModel = ds.openaiModel;
                        if (s.tools.scrcpyArgs === '-m 1024 -b 2M --max-fps=30 --no-audio --stay-awake') s.tools.scrcpyArgs = ds.tools.scrcpyArgs;
                        if (s.tools.appiumArgs === '--relaxed-security') s.tools.appiumArgs = ds.tools.appiumArgs;
                    });

                    // Validate activeProfileId
                    if (!migrated.profiles[migrated.activeProfileId]) {
                        console.warn(`[Settings] Active profile '${migrated.activeProfileId}' not found. Resetting to default.`);
                        const availableIds = Object.keys(migrated.profiles);
                        if (availableIds.length > 0) {
                            migrated.activeProfileId = migrated.profiles['default'] ? 'default' : availableIds[0];
                        } else {
                            // Should not happen if we found profiles, but just in case
                            migrated.profiles = { 'default': { id: 'default', name: 'Default', settings: getDefaultSettings() } };
                            migrated.activeProfileId = 'default';
                        }
                    }

                    setStoreData(migrated);
                } else {
                    // It's the old flat format. Migrate to Default Profile.
                    console.info("Migrating legacy settings to Default Profile...");
                    const migratedSettings = deepMerge(getDefaultSettings(), decryptedSaved as unknown as Partial<AppSettings>);
                    migratedSettings.aiChatEnabled = false;
                    migratedSettings.aiTestModeEnabled = false;
                    
                    // Active Migration for old flat format
                    const ds = getDefaultSettings();
                    if (migratedSettings.geminiModel === 'gemini-1.5-flash' || migratedSettings.geminiModel === 'gemini-3.1-flash-lite') migratedSettings.geminiModel = ds.geminiModel;
                    if (migratedSettings.claudeModel === 'claude-3-5-sonnet-20240620') migratedSettings.claudeModel = ds.claudeModel;
                    if (migratedSettings.openaiModel === 'gpt-4o') migratedSettings.openaiModel = ds.openaiModel;
                    if (migratedSettings.tools.scrcpyArgs === '-m 1024 -b 2M --max-fps=30 --no-audio --stay-awake') migratedSettings.tools.scrcpyArgs = ds.tools.scrcpyArgs;
                    if (migratedSettings.tools.appiumArgs === '--relaxed-security') migratedSettings.tools.appiumArgs = ds.tools.appiumArgs;

                    const newStoreData: SettingsStoreData = {
                        activeProfileId: 'default',
                        profiles: {
                            'default': { id: 'default', name: 'Default', settings: migratedSettings }
                        }
                    };
                    setStoreData(newStoreData);
                    // Save immediately
                    saveStore(newStoreData);
                }

                // Initial sync
                const activeId = decryptedSaved.activeProfileId;
                const paths = decryptedSaved.profiles[activeId]?.settings?.paths;
                if (paths) {
                    const sanitizedPaths = sanitizeWorkspacePaths(Object.values(paths));
                    if (sanitizedPaths.length > 0) {
                        invoke('sync_workspace_permissions', { paths: sanitizedPaths }).catch(console.error);
                    }
                }
            }

        } catch (e) {
            feedback.toast.error("settings.load_error", e);
        } finally {
            clearTimeout(safetyTimer);
            setHasHydrated(true);
            setLoading(false);
        }
    };

    const syncWorkspaces = (paths: Record<string, string>) => {
        const sanitizedPaths = sanitizeWorkspacePaths(Object.values(paths));
        if (sanitizedPaths.length === 0) return;
        invoke('sync_workspace_permissions', { paths: sanitizedPaths })
            .catch(e => console.error("[Security] Sync failed:", e));
    };

    const saveStore = async (data: SettingsStoreData) => {
        try {
            const encryptedData = await processStoreDataSecrets(data, 'encrypt');
            await store.set('app_config', encryptedData);
            await store.save();
        } catch (e) {
            feedback.toast.error("settings.save_error", e);
        }
    };

    const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setStoreData((currentStoreData) => {
            const activeId = currentStoreData.activeProfileId;
            const currentProfile = currentStoreData.profiles[activeId];

            if (!currentProfile) {
                feedback.toast.error("settings.profile_not_found");
                return currentStoreData;
            }

            const updatedSettings = { ...currentProfile.settings, [key]: value };
            const updatedProfile = { ...currentProfile, settings: updatedSettings };

            const newData = {
                ...currentStoreData,
                profiles: {
                    ...currentStoreData.profiles,
                    [activeId]: updatedProfile
                }
            };

            // Fire and forget save to disk
            saveStore(newData);

            // Sync permissions if paths changed
            if (key === 'paths') {
                syncWorkspaces(value as Record<string, string>);
            }

            return newData;
        });
    };

    const setMultipleSettings = (newSettings: Partial<AppSettings>) => {
        setStoreData((currentStoreData) => {
            const activeId = currentStoreData.activeProfileId;
            const currentProfile = currentStoreData.profiles[activeId];

            if (!currentProfile) {
                feedback.toast.error("settings.profile_not_found");
                return currentStoreData;
            }

            const updatedSettings = deepMerge(currentProfile.settings, newSettings);
            const updatedProfile = { ...currentProfile, settings: updatedSettings };

            const newData = {
                ...currentStoreData,
                profiles: {
                    ...currentStoreData.profiles,
                    [activeId]: updatedProfile
                }
            };

            // Fire and forget save to disk
            saveStore(newData);

            // Sync permissions if paths changed
            if (newSettings.paths) {
                syncWorkspaces(newSettings.paths as Record<string, string>);
            }

            return newData;
        });
    };

    const createProfile = (name: string) => {
        const id = uuidv4();
        const newProfile: Profile = {
            id,
            name,
            settings: getDefaultSettings()
        };
        const newData = {
            ...storeData,
            activeProfileId: id,
            profiles: { ...storeData.profiles, [id]: newProfile }
        };
        setStoreData(newData);
        saveStore(newData);
    };

    const switchProfile = (id: string) => {
        if (storeData.profiles[id]) {
            const newData = { ...storeData, activeProfileId: id };
            setStoreData(newData);
            saveStore(newData);
        }
    };

    const renameProfile = (id: string, name: string) => {
        if (storeData.profiles[id]) {
            const newData = {
                ...storeData,
                profiles: {
                    ...storeData.profiles,
                    [id]: { ...storeData.profiles[id], name }
                }
            };
            setStoreData(newData);
            saveStore(newData);
        }
    };

    const deleteProfile = (id: string) => {
        // If deleting current, switch to default first.
        const profiles = { ...storeData.profiles };
        if (Object.keys(profiles).length <= 1) {
            alert("Cannot delete the last profile.");
            return;
        }

        delete profiles[id];
        let newActiveId = storeData.activeProfileId;
        if (id === newActiveId) {
            newActiveId = Object.keys(profiles)[0];
        }

        const newData = {
            activeProfileId: newActiveId,
            profiles
        };
        setStoreData(newData);
        saveStore(newData);
    };

    const activeProfile = storeData.profiles[storeData.activeProfileId] || storeData.profiles['default'];

    useEffect(() => {
        if (hasHydrated) {
            invoke('update_custom_adb_path', { path: activeProfile.settings.customAdbPath || '' }).catch(console.error);
        }
    }, [activeProfile.settings.customAdbPath, hasHydrated]);

    const [systemVersions, setSystemVersions] = useState<SystemVersions | null>(null);

    const [systemCheckStatus, setSystemCheckStatus] = useState<SystemCheckStatus>({
        loading: false,
        complete: false,
        missingCritical: [],
        missingAppium: [],
        missingTesting: [],
        missingMirroring: [],
        missingTunnelling: []
    });

    const checkSystemVersions = async (forceUsageMode?: 'explorer' | 'automator', forceFramework?: 'robot' | 'appium' | 'maestro' | 'cypress' | 'selenium', silent: boolean = false) => {
        const mode = forceUsageMode || activeProfile.settings.usageMode;
        const framework = forceFramework || activeProfile.settings.automationFramework || 'robot';

        const processVersions = (versions: SystemVersions) => {
            setSystemVersions(versions);

            const missingCritical: string[] = [];
            const missingAppium: string[] = [];
            const missingTesting: string[] = [];
            const missingMirroring: string[] = [];
            const missingTunnelling: string[] = [];

            const isWebMode = mode === 'explorer'
                ? (activeProfile.settings.explorerPlatform === 'web')
                : ['cypress', 'selenium'].includes(framework);

            // Critical Tools (Skip mobile checks in web mode)
            if (!isWebMode) {
                if (versions.adb === 'Not Found') {
                    missingCritical.push('ADB');
                }
                // Mirroring Tools (Skip in web mode)
                if (versions.scrcpy === 'Not Found') {
                    missingMirroring.push('Scrcpy');
                }
            }

            // Appium/Web Tools (Only check if not explorer)
            if (mode !== 'explorer') {
                if (isWebMode) {
                    if (framework === 'cypress') {
                        if (versions.node === 'Not Found') missingTesting.push('Node.js (Required for Cypress)');
                    } else if (framework === 'selenium') {
                        if (versions.python === 'Not Found' || versions.python === 'Not Checked') missingTesting.push('Python');
                    }
                } else {
                    if (versions.node === 'Not Found') missingAppium.push('Node.js');

                    // Framework Specific Tools
                    if (framework === 'robot') {
                        if (versions.appium === 'Not Found') missingAppium.push('Appium (Node.js)');
                        if (versions.uiautomator2 === 'Not Found') missingAppium.push('UiAutomator2 (Appium)');
                        if (versions.python === 'Not Found') missingTesting.push('Python');
                        if (versions.robot === 'Not Found') missingTesting.push('Robot Framework (Python)');
                        if (versions.appium_lib === 'Not Found') missingTesting.push('AppiumLibrary (Robot Framework)');
                    }

                    if (framework === 'appium') {
                        if (versions.appium === 'Not Found') missingAppium.push('Appium (Node.js)');
                        if (versions.uiautomator2 === 'Not Found') missingAppium.push('UiAutomator2 (Appium)');
                        if (versions.java === 'Not Found') missingTesting.push('Java (JDK)');
                        if (versions.maven === 'Not Found') missingTesting.push('Maven');
                    }

                    if (framework === 'maestro') {
                        if (versions.maestro === 'Not Found') missingTesting.push('Maestro');
                    }
                }
            }

            // Tunnelling Tools
            if (isNgrokEnabled && versions.ngrok === 'Not Found') missingTunnelling.push('Ngrok');

            setSystemCheckStatus({
                loading: false,
                complete: true,
                missingCritical,
                missingAppium,
                missingTesting,
                missingMirroring,
                missingTunnelling
            });
        };

        const cacheKey = `cached_system_versions_${mode}_${framework}_${isNgrokEnabled}`;
        
        if (!silent) {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                try {
                    const parsedVersions = JSON.parse(cached) as SystemVersions;
                    processVersions(parsedVersions);
                    // Continue to background fetch
                } catch (e) {
                    setSystemCheckStatus(prev => ({ ...prev, loading: true }));
                }
            } else {
                setSystemCheckStatus(prev => ({ ...prev, loading: true }));
            }
        }

        try {
            // Conditionally skip ngrok and automator dependencies checks
            const versions = await invoke<SystemVersions>('get_system_versions', {
                checkAutomator: mode !== 'explorer',
                framework: framework,
                checkNgrok: isNgrokEnabled
            });

            localStorage.setItem(cacheKey, JSON.stringify(versions));
            processVersions(versions);

        } catch (e) {
            feedback.toast.error("settings.versions_load_error", e);
            setSystemCheckStatus(prev => ({ ...prev, loading: false }));
        }
    };

    // Update Logic
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

    const checkForAppUpdate = async (manual: boolean = false) => {
        // If we already have info and it's not a manual check, skip
        if (updateInfo && !manual) return;

        try {
            const channel = activeProfile.settings.updateChannel || 'stable';
            const info = await checkForUpdates(channel);
            setUpdateInfo(info);

            if (manual) {
                if (info.available) {
                    feedback.toast.success("about.update_available", { version: info.latestVersion });
                } else {
                    feedback.toast.info("about.update_not_available");
                }
            }
        } catch (e) {
            if (manual) feedback.toast.error("about.update_error");
        }
    };

    const is_test_mode: 'mobile' | 'web' = activeProfile.settings.usageMode === 'explorer'
        ? (activeProfile.settings.explorerPlatform || 'mobile')
        : (['cypress', 'selenium'].includes(activeProfile.settings.automationFramework || 'robot') ? 'web' : 'mobile');

    return (
        <SettingsContext.Provider value={{
            settings: activeProfile.settings,
            activeProfileId: storeData.activeProfileId,
            profiles: Object.values(storeData.profiles),
            updateSetting,
            setMultipleSettings,
            createProfile,
            switchProfile,
            renameProfile,
            deleteProfile,
            loading,
            hasHydrated,
            systemVersions,
            checkSystemVersions,
            systemCheckStatus,
            updateInfo,
            checkForAppUpdate,
            isNgrokEnabled,
            enableNgrok,
            is_test_mode,
            activeWebUrl,
            setActiveWebUrl
        }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}

// Simple deep merge helper
function deepMerge<T>(target: T, source: Partial<T>): T {
    const output = { ...target };
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            const k = key as keyof T;
            if (isObject(source[k])) {
                if (!(k in target)) {
                    (output as Record<string, unknown>)[k as string] = source[k];
                } else {
                    (output as Record<string, unknown>)[k as string] = deepMerge(target[k] as Record<string, unknown>, source[k] as Record<string, unknown>);
                }
            } else {
                (output as Record<string, unknown>)[k as string] = source[k];
            }
        });
    }
    return output;
}

function isObject(item: unknown): item is Record<string, unknown> {
    return (item !== null && typeof item === 'object' && !Array.isArray(item));
}

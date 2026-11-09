import { LazyStore } from '@tauri-apps/plugin-store';
import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { invoke } from '@tauri-apps/api/core';
import { feedback } from './feedback';
import { checkForUpdates, UpdateInfo } from './updater';

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

export interface ComplianceRule {
    id: string;
    name: string;
    pattern: string;
    severity: 'critical' | 'warning' | 'info';
    maskInLogs: boolean;
    blockOnViolation: boolean;
    enabled: boolean;
}

export interface SpecPipelineSettings {
    enabled: boolean;
    baseSpecsDir: string;
    scenariosFilename: string;
    resultsFilename: string;
    evidenceSubdir: string;
    autoTranspileToRobot: boolean;
}

export interface TelemetryWebhooksSettings {
    enabled: boolean;
    endpointUrl: string;
    headers: Record<string, string>;
    tags: Record<string, string>;
    sendOnTestCompleted: boolean;
    sendOnHardwareAudit: boolean;
}

export interface ComplianceWatcherSettings {
    enabled: boolean;
    rules: ComplianceRule[];
}

export interface AppSettings {
    language: string;
    zoomFactor: number;
    theme: 'dark' | 'light';
    primaryColor: string;
    presentationEnabled: boolean;
    customAdbPath?: string;
    usageMode?: 'explorer' | 'automator';
    explorerPlatform?: 'mobile' | 'web';
    automationFramework?: 'robot' | 'appium' | 'maestro' | 'cypress' | 'selenium';
    updateChannel?: 'stable' | 'beta' | 'alpha';
    recycleDeviceViews: boolean; // New setting
    allowActionsDuringTest: boolean; // Control whether actions are allowed during test
    saveLogs: boolean; // Persist log saving preference
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
    logcatLevel?: string;
    logcatExtraTags?: string;
    logcatSelectedPackage?: string;
    stopwatchSelectedPackage?: string;

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
    geminiModel: string;
    claudeApiKey?: string;
    claudeModel: string;
    openaiApiKey?: string;
    openaiModel: string;
    antigravityApiKey?: string;
    claudeCodeToken?: string;
    aiSessionId?: string;
    aiChatEnabled: boolean;
    aiTestModeEnabled: boolean;
    maxExplorationSteps?: number;

    // Integrations
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

    // Plugins & Extensibility
    specPipeline?: SpecPipelineSettings;
    telemetryWebhooks?: TelemetryWebhooksSettings;
    complianceWatcher?: ComplianceWatcherSettings;

    // Custom Logos
    customLogoLight?: string;
    customLogoDark?: string;
}

const getDefaultSettings = (): AppSettings => ({
    language: 'en_US',
    zoomFactor: 1.0,
    theme: 'dark',
    primaryColor: 'blue',
    presentationEnabled: false,
    customAdbPath: '',
    usageMode: 'automator',
    explorerPlatform: 'mobile',
    automationFramework: 'robot',
    updateChannel: 'stable',
    recycleDeviceViews: true,
    allowActionsDuringTest: true,
    saveLogs: false,
    noAppiumForRobot: false,

    appiumHost: '127.0.0.1',
    appiumPort: 4723,
    appiumBasePath: '/',

    paths: {
        suites: '',
        tests: '',
        resources: '',
        logs: '',
        logcat: '',
        screenshots: '',
        recordings: '',
        automationRoot: '',
        mappings: ''
    },
    logcatKeywords: [],
    logcatLevel: 'verbose',
    logcatExtraTags: '',
    logcatSelectedPackage: '',
    stopwatchSelectedPackage: '',

    tools: {
        appiumArgs: '',
        scrcpyArgs: '',
        robotArgs: '',
        maestroArgs: '',
        appiumJavaArgs: '',
        appPackage: '',
        ngrokToken: '',
        cypressArgs: '',
        seleniumArgs: ''
    },

    aiProvider: 'gemini',
    geminiApiKey: '',
    geminiModel: 'gemini-2.5-flash',
    claudeApiKey: '',
    claudeModel: 'claude-3-5-sonnet-20241022',
    openaiApiKey: '',
    openaiModel: 'gpt-4o',
    antigravityApiKey: '',
    claudeCodeToken: '',
    aiSessionId: '',
    aiChatEnabled: true,
    aiTestModeEnabled: false,
    maxExplorationSteps: 20,

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
    },

    specPipeline: {
        enabled: false,
        baseSpecsDir: 'specs',
        scenariosFilename: 'cenarios-de-teste.md',
        resultsFilename: 'resultados.md',
        evidenceSubdir: 'evidencias',
        autoTranspileToRobot: true
    },
    telemetryWebhooks: {
        enabled: false,
        endpointUrl: '',
        headers: {
            'Content-Type': 'application/json'
        },
        tags: {
            source: 'robot_runner'
        },
        sendOnTestCompleted: true,
        sendOnHardwareAudit: true
    },
    complianceWatcher: {
        enabled: false,
        rules: [
            {
                id: 'pci-pan',
                name: 'PCI Credit Card PAN',
                pattern: '\\b(?:\\d[ -]*?){13,19}\\b',
                severity: 'critical',
                maskInLogs: true,
                blockOnViolation: true,
                enabled: true
            },
            {
                id: 'pci-cvv',
                name: 'PCI CVV / CVC Code',
                pattern: '\\b\\d{3,4}\\b',
                severity: 'critical',
                maskInLogs: true,
                blockOnViolation: true,
                enabled: false
            },
            {
                id: 'selinux-denied',
                name: 'SELinux AVC Denials',
                pattern: 'avc:\\s+denied',
                severity: 'warning',
                maskInLogs: false,
                blockOnViolation: false,
                enabled: true
            },
            {
                id: 'private-key',
                name: 'Private Key / Certificate Secret',
                pattern: '-----BEGIN (?:RSA )?PRIVATE KEY-----',
                severity: 'critical',
                maskInLogs: true,
                blockOnViolation: true,
                enabled: true
            }
        ]
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
    ['claudeApiKey'],
    ['openaiApiKey'],
    ['antigravityApiKey'],
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
// Tools resolved individually by the `get_tool_version` backend command
export type ToolKey = 'adb' | 'node' | 'appium' | 'uiautomator2' | 'python' | 'robot' | 'appium_lib'
    | 'java' | 'maven' | 'maestro' | 'scrcpy' | 'ngrok' | 'claude_code' | 'antigravity';

// Placeholder value shown while a tool is still being identified in background
export const TOOL_CHECKING = 'Checking';

// Returns true only when the tool was identified as installed (not missing, skipped or still pending)
export function isToolInstalled(version?: string | null): boolean {
    return !!version && version !== 'Not Found' && version !== 'Not Checked' && version !== TOOL_CHECKING;
}

// Feature groups that depend on optional tools
export type ToolGroup = 'appium' | 'testing' | 'mirroring' | 'tunnelling';

// Initial Check Status Interface
export interface SystemCheckStatus {
    loading: boolean; // True only while the critical ADB check is pending (blocks the UI)
    complete: boolean; // True once every tool check has finished
    missingCritical: string[]; // Only ADB
    missingAppium: string[]; // Node, Appium, UiAutomator2 -- affects Appium Settings & Controls
    missingTesting: string[]; // Python, Robot, AppiumLibrary -- affects Launcher Tab
    missingMirroring: string[]; // Scrcpy -- affects Mirroring options
    missingTunnelling: string[]; // Ngrok -- affects Connect Tab remote features
    pendingGroups: ToolGroup[]; // Groups whose dependencies are still being identified in background
    revalidating: boolean; // Cached versions are applied and being confirmed in background
    checkedTools: number; // Progress of the background check
    totalTools: number;
}

const MISSING_KEY_BY_GROUP: Record<ToolGroup, 'missingAppium' | 'missingTesting' | 'missingMirroring' | 'missingTunnelling'> = {
    appium: 'missingAppium',
    testing: 'missingTesting',
    mirroring: 'missingMirroring',
    tunnelling: 'missingTunnelling',
};

// A feature group is unavailable while its tools are missing OR still being identified
export function isToolGroupUnavailable(status: SystemCheckStatus | undefined, group: ToolGroup): boolean {
    if (!status) return false;
    return (status[MISSING_KEY_BY_GROUP[group]]?.length ?? 0) > 0 || (status.pendingGroups?.includes(group) ?? false);
}

type UsageMode = 'explorer' | 'automator';
type Framework = 'robot' | 'appium' | 'maestro' | 'cypress' | 'selenium';

// ADB comes first so the blocking check finishes as soon as possible
function getToolsToCheck(mode: UsageMode | undefined, framework: Framework, checkNgrok: boolean): ToolKey[] {
    const tools: ToolKey[] = ['adb', 'scrcpy', 'claude_code', 'antigravity'];
    if (mode !== 'explorer') {
        tools.push('node', 'java', 'python');
        if (framework === 'robot') tools.push('robot', 'appium_lib', 'appium', 'uiautomator2');
        if (framework === 'appium') tools.push('maven', 'appium', 'uiautomator2');
        if (framework === 'maestro') tools.push('maestro');
    }
    if (checkNgrok) tools.push('ngrok');
    return tools;
}

function createBaseVersions(): SystemVersions {
    return {
        adb: 'Not Checked', node: 'Not Checked', appium: 'Not Checked', uiautomator2: 'Not Checked',
        python: 'Not Checked', robot: 'Not Checked', appium_lib: 'Not Checked', java: 'Not Checked',
        maven: 'Not Checked', maestro: 'Not Checked', scrcpy: 'Not Found', ngrok: 'Not Checked',
        claude_code: 'Not Found', antigravity: 'Not Found', cypress: 'Not Checked', pytest: 'Not Checked',
    };
}

type SystemStatusEvaluation = Omit<SystemCheckStatus, 'loading' | 'complete' | 'revalidating' | 'checkedTools' | 'totalTools'>;

// Computes missing/pending tool groups from partially resolved versions
function evaluateSystemStatus(
    versions: SystemVersions,
    pending: Set<ToolKey>,
    mode: UsageMode | undefined,
    framework: Framework,
    isWebMode: boolean,
    checkNgrok: boolean,
): SystemStatusEvaluation {
    const missing: Record<'critical' | ToolGroup, string[]> = { critical: [], appium: [], testing: [], mirroring: [], tunnelling: [] };
    const pendingGroups = new Set<ToolGroup>();

    const requireTool = (key: ToolKey, group: 'critical' | ToolGroup, label: string, notCheckedIsMissing = false) => {
        if (pending.has(key)) {
            if (group !== 'critical') pendingGroups.add(group);
            return;
        }
        const value = versions[key];
        if (value === 'Not Found' || (notCheckedIsMissing && value === 'Not Checked')) missing[group].push(label);
    };

    // Critical & mirroring tools (skipped in web mode)
    if (!isWebMode) {
        requireTool('adb', 'critical', 'ADB');
        requireTool('scrcpy', 'mirroring', 'Scrcpy');
    }

    // Appium/Web tools (only when not in explorer mode)
    if (mode !== 'explorer') {
        if (isWebMode) {
            if (framework === 'cypress') requireTool('node', 'testing', 'Node.js (Required for Cypress)');
            else if (framework === 'selenium') requireTool('python', 'testing', 'Python', true);
        } else {
            requireTool('node', 'appium', 'Node.js');

            if (framework === 'robot') {
                requireTool('appium', 'appium', 'Appium (Node.js)');
                requireTool('uiautomator2', 'appium', 'UiAutomator2 (Appium)');
                requireTool('python', 'testing', 'Python');
                requireTool('robot', 'testing', 'Robot Framework (Python)');
                requireTool('appium_lib', 'testing', 'AppiumLibrary (Robot Framework)');
            }

            if (framework === 'appium') {
                requireTool('appium', 'appium', 'Appium (Node.js)');
                requireTool('uiautomator2', 'appium', 'UiAutomator2 (Appium)');
                requireTool('java', 'testing', 'Java (JDK)');
                requireTool('maven', 'testing', 'Maven');
            }

            if (framework === 'maestro') requireTool('maestro', 'testing', 'Maestro');
        }
    }

    // Tunnelling tools
    if (checkNgrok) requireTool('ngrok', 'tunnelling', 'Ngrok');

    return {
        missingCritical: missing.critical,
        missingAppium: missing.appium,
        missingTesting: missing.testing,
        missingMirroring: missing.mirroring,
        missingTunnelling: missing.tunnelling,
        pendingGroups: Array.from(pendingGroups),
    };
}


interface SettingsContextType {
    settings: AppSettings;
    activeProfileId: string;
    profiles: Profile[];
    updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
    setMultipleSettings: (newSettings: Partial<AppSettings>) => void;
    createProfile: (name: string, initialSettings?: Partial<AppSettings>) => void;
    importSettingsStore: (importedData: any) => void;
    switchProfile: (id: string) => void;
    renameProfile: (id: string, name: string) => void;
    deleteProfile: (id: string) => void;
    loading: boolean;
    hasHydrated: boolean;
    systemVersions: SystemVersions | null;
    checkSystemVersions: (forceUsageMode?: 'explorer' | 'automator', forceFramework?: 'robot' | 'appium' | 'maestro' | 'cypress' | 'selenium', useCache?: boolean) => Promise<void>;
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
            let saved: SettingsStoreData | null = null;
            try {
                const portableJson = await invoke<string | null>('get_portable_settings');
                if (portableJson) {
                    const parsed = JSON.parse(portableJson);
                    saved = parsed.app_config || parsed;
                    console.info("[Settings] Loaded portable settings.json.");
                }
            } catch (err) {
                console.warn("[Settings] Portable settings check error:", err);
            }

            if (!saved) {
                saved = await store.get<SettingsStoreData>('app_config') ?? null;
            }
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
            const jsonStr = JSON.stringify({ app_config: encryptedData }, null, 2);
            const wasPortable = await invoke<boolean>('save_portable_settings', { content: jsonStr });
            if (!wasPortable) {
                await store.set('app_config', encryptedData);
                await store.save();
            }
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

    const createProfile = (name: string, initialSettings?: Partial<AppSettings>) => {
        const id = uuidv4();
        const newProfile: Profile = {
            id,
            name,
            settings: deepMerge(getDefaultSettings(), initialSettings ?? {})
        };
        const newData = {
            ...storeData,
            activeProfileId: id,
            profiles: { ...storeData.profiles, [id]: newProfile }
        };
        setStoreData(newData);
        saveStore(newData);
    };

    const importSettingsStore = (importedData: any) => {
        try {
            if (!importedData || typeof importedData !== 'object') {
                throw new Error("Invalid settings data.");
            }

            let actualData = importedData;
            // Unwrap tauri store 'app_config' key if it exists
            if (importedData && importedData.app_config) {
                actualData = importedData.app_config;
            }

            let migrated: SettingsStoreData;

            if (actualData.profiles && actualData.activeProfileId) {
                migrated = { ...actualData };
            } else {
                const migratedSettings = deepMerge(getDefaultSettings(), actualData as Partial<AppSettings>);
                migratedSettings.aiChatEnabled = false;
                migratedSettings.aiTestModeEnabled = false;
                migrated = {
                    activeProfileId: 'default',
                    profiles: {
                        'default': { id: 'default', name: 'Default', settings: migratedSettings }
                    }
                };
            }

            Object.keys(migrated.profiles).forEach(pid => {
                migrated.profiles[pid].settings = deepMerge(getDefaultSettings(), migrated.profiles[pid].settings);
                migrated.profiles[pid].settings.aiChatEnabled = false;
                migrated.profiles[pid].settings.aiTestModeEnabled = false;
            });

            if (!migrated.profiles[migrated.activeProfileId]) {
                const availableIds = Object.keys(migrated.profiles);
                if (availableIds.length > 0) {
                    migrated.activeProfileId = availableIds[0];
                } else {
                    migrated.profiles = { 'default': { id: 'default', name: 'Default', settings: getDefaultSettings() } };
                    migrated.activeProfileId = 'default';
                }
            }

            setStoreData(migrated);
            saveStore(migrated);

            const activeId = migrated.activeProfileId;
            const paths = migrated.profiles[activeId]?.settings?.paths;
            if (paths) {
                syncWorkspaces(paths as Record<string, string>);
            }

        } catch (e: any) {
            feedback.toast.error("Failed to import settings", e);
            throw e;
        }
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

    // Starts as loading so the blocking overlay is shown until the first ADB check resolves
    const [systemCheckStatus, setSystemCheckStatus] = useState<SystemCheckStatus>({
        loading: true,
        complete: false,
        missingCritical: [],
        missingAppium: [],
        missingTesting: [],
        missingMirroring: [],
        missingTunnelling: [],
        pendingGroups: [],
        revalidating: false,
        checkedTools: 0,
        totalTools: 0,
    });

    // Identifies the latest check run so results from superseded runs are ignored
    const checkRunIdRef = useRef(0);

    /**
     * Identifies installed host tools.
     * - useCache = true (startup, mode/framework switch): applies the last saved versions instantly
     *   (no blocking screen) and revalidates every tool in background, fixing the state if anything changed.
     * - useCache = false (manual refresh): ignores the saved versions and reads every tool fresh.
     */
    const checkSystemVersions = async (forceUsageMode?: UsageMode, forceFramework?: Framework, useCache: boolean = false) => {
        const runId = ++checkRunIdRef.current;
        const mode = forceUsageMode || activeProfile.settings.usageMode;
        const framework: Framework = forceFramework || activeProfile.settings.automationFramework || 'robot';
        const checkNgrok = isNgrokEnabled;
        const isWebMode = mode === 'explorer'
            ? (activeProfile.settings.explorerPlatform === 'web')
            : ['cypress', 'selenium'].includes(framework);

        const tools = getToolsToCheck(mode, framework, checkNgrok);
        const pending = new Set<ToolKey>(tools);
        const versions = createBaseVersions();
        const cacheKey = `cached_system_versions_${mode}_${framework}_${checkNgrok}`;

        // Tools whose last known version was restored from the cache
        const cachedVersions: Partial<Record<ToolKey, string>> = {};
        if (useCache) {
            try {
                const cached = localStorage.getItem(cacheKey);
                const parsed = cached ? JSON.parse(cached) as Partial<SystemVersions> : null;
                if (parsed) {
                    tools.forEach(tool => {
                        const value = parsed[tool];
                        if (typeof value === 'string' && value !== TOOL_CHECKING) cachedVersions[tool] = value;
                    });
                }
            } catch (e) {
                console.warn('[SystemCheck] Ignoring invalid cached versions:', e);
            }
        }
        const isRevalidating = Object.keys(cachedVersions).length > 0;

        tools.forEach(tool => { versions[tool] = cachedVersions[tool] ?? TOOL_CHECKING; });

        // Cached tools count as resolved for feature gating; only uncached tools stay pending
        const unresolved = () => new Set(Array.from(pending).filter(tool => !(tool in cachedVersions)));

        const publish = () => {
            if (runId !== checkRunIdRef.current) return;
            setSystemVersions({ ...versions });
            const blockingPending = unresolved();
            const evaluation = evaluateSystemStatus(versions, blockingPending, mode, framework, isWebMode, checkNgrok);
            setSystemCheckStatus({
                ...evaluation,
                loading: blockingPending.has('adb'),
                complete: pending.size === 0,
                revalidating: isRevalidating && pending.size > 0,
                checkedTools: tools.length - pending.size,
                totalTools: tools.length,
            });
        };

        publish();

        let failedTools = 0;
        // All tools are resolved in parallel; each result enables/disables its features as soon as it arrives
        await Promise.all(tools.map(async (tool) => {
            let value: string;
            try {
                value = await invoke<string>('get_tool_version', { tool });
            } catch (e) {
                console.error(`[SystemCheck] Failed to resolve ${tool} version:`, e);
                failedTools++;
                value = 'Not Found';
            }
            versions[tool] = value;
            pending.delete(tool);
            publish();
        }));

        if (runId !== checkRunIdRef.current) return;
        if (failedTools > 0) {
            feedback.toast.error("settings.versions_load_error");
            return;
        }
        localStorage.setItem(cacheKey, JSON.stringify(versions));

        // Warn the user when the background revalidation changed a tool's availability
        const changedTools = tools.filter(tool =>
            tool in cachedVersions && isToolInstalled(cachedVersions[tool]) !== isToolInstalled(versions[tool])
        );
        if (changedTools.length > 0) {
            feedback.toast.info('startup.background.tools_changed', { tools: changedTools.join(', ') });
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
            importSettingsStore,
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

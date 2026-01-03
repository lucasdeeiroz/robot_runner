import { LazyStore } from '@tauri-apps/plugin-store';
import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { invoke } from '@tauri-apps/api/core';

export interface SystemVersions {
    adb: string;
    node: string;
    python: string;
    scrcpy: string;
    appium: string;
    robot: string;
    uiautomator2: string;
    appium_lib: string;
}

// Initialize the store
const store = new LazyStore('settings.json');

export interface AppSettings {
    theme: 'dark' | 'light';
    language: string;
    primaryColor: string;
    customLogoLight?: string;
    customLogoDark?: string;

    // Appium
    appiumHost: string;
    appiumPort: number;

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
    };

    // Tools
    tools: {
        appiumArgs: string;
        scrcpyArgs: string;
        robotArgs: string;
        appPackage: string; // for monitoring/logcat filtering
        ngrokToken: string;
    };
}

const DEFAULT_SETTINGS: AppSettings = {
    theme: 'dark',
    language: 'en_US',
    primaryColor: 'blue',
    appiumHost: '127.0.0.1',
    appiumPort: 4723,
    paths: {
        suites: '',
        tests: '',
        resources: '',
        logs: '',
        logcat: 'logcat',
        screenshots: 'screenshots',
        recordings: 'recordings',
        automationRoot: '',
    },
    tools: {
        appiumArgs: '--relaxed-security',
        scrcpyArgs: '',
        robotArgs: '',
        appPackage: '',
        ngrokToken: ''
    }
};

export interface Profile {
    id: string;
    name: string;
    settings: AppSettings;
}

interface SettingsStoreData {
    activeProfileId: string;
    profiles: Record<string, Profile>;
}

interface SettingsContextType {
    settings: AppSettings;
    activeProfileId: string;
    profiles: Profile[];
    updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
    createProfile: (name: string) => void;
    switchProfile: (id: string) => void;
    renameProfile: (id: string, name: string) => void;
    deleteProfile: (id: string) => void;
    loading: boolean;
    systemVersions: SystemVersions | null;
    checkSystemVersions: () => Promise<void>;
}

// Initial Check Status Interface
export interface SystemCheckStatus {
    loading: boolean;
    complete: boolean;
    missingCritical: string[]; // node, adb
    missingTesting: string[]; // python, robot, appium, uiautomator2
    missingMirroring: string[]; // scrcpy
}

interface SettingsContextType {
    settings: AppSettings;
    activeProfileId: string;
    profiles: Profile[];
    updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
    createProfile: (name: string) => void;
    switchProfile: (id: string) => void;
    renameProfile: (id: string, name: string) => void;
    deleteProfile: (id: string) => void;
    loading: boolean;
    systemVersions: SystemVersions | null;
    checkSystemVersions: () => Promise<void>;
    systemCheckStatus: SystemCheckStatus;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [storeData, setStoreData] = useState<SettingsStoreData>({
        activeProfileId: 'default',
        profiles: {
            'default': { id: 'default', name: 'Default', settings: DEFAULT_SETTINGS }
        }
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const saved: any = await store.get('app_config');
            if (saved) {
                // Migration Logic
                if (saved.profiles) {
                    // It's already the new format
                    // Just ensure defaults for missing fields in existing profiles
                    const migrated = { ...saved };
                    Object.keys(migrated.profiles).forEach(pid => {
                        migrated.profiles[pid].settings = deepMerge(DEFAULT_SETTINGS, migrated.profiles[pid].settings);
                    });

                    // Validate activeProfileId
                    if (!migrated.profiles[migrated.activeProfileId]) {
                        console.warn(`[Settings] Active profile '${migrated.activeProfileId}' not found. Resetting to default.`);
                        const availableIds = Object.keys(migrated.profiles);
                        if (availableIds.length > 0) {
                            migrated.activeProfileId = migrated.profiles['default'] ? 'default' : availableIds[0];
                        } else {
                            // Should not happen if we found profiles, but just in case
                            migrated.profiles = { 'default': { id: 'default', name: 'Default', settings: DEFAULT_SETTINGS } };
                            migrated.activeProfileId = 'default';
                        }
                    }

                    setStoreData(migrated);
                } else {
                    // It's the old flat format. Migrate to Default Profile.
                    console.info("Migrating legacy settings to Default Profile...");
                    const migratedSettings = deepMerge(DEFAULT_SETTINGS, saved);
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
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        } finally {
            setLoading(false);
        }
    };

    const saveStore = (data: SettingsStoreData) => {
        store.set('app_config', data).then(() => store.save()).catch(e => {
            console.error('Failed to save settings:', e);
        });
    };

    const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        const activeId = storeData.activeProfileId;
        const currentProfile = storeData.profiles[activeId];

        console.log(`[Settings] Updating ${key} to ${value} for profile ${activeId}`);

        if (!currentProfile) {
            console.error('[Settings] Active profile not found!');
            return;
        }

        const updatedSettings = { ...currentProfile.settings, [key]: value };
        const updatedProfile = { ...currentProfile, settings: updatedSettings };

        const newData = {
            ...storeData,
            profiles: {
                ...storeData.profiles,
                [activeId]: updatedProfile
            }
        };

        setStoreData(newData);
        saveStore(newData);
    };

    const createProfile = (name: string) => {
        const id = uuidv4();
        // Clone current settings or default? Default is safer/cleaner.
        const newProfile: Profile = {
            id,
            name,
            settings: DEFAULT_SETTINGS
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
        // Prevent deleting last profile or current?
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

    const [systemVersions, setSystemVersions] = useState<SystemVersions | null>(null);

    const [systemCheckStatus, setSystemCheckStatus] = useState<SystemCheckStatus>({
        loading: false,
        complete: false,
        missingCritical: [],
        missingTesting: [],
        missingMirroring: []
    });

    const checkSystemVersions = async () => {
        // If already loading, skip? No, forcing check might be needed.
        setSystemCheckStatus(prev => ({ ...prev, loading: true }));
        try {
            const versions = await invoke<SystemVersions>('get_system_versions');
            setSystemVersions(versions);

            const missingCritical: string[] = [];
            const missingTesting: string[] = [];
            const missingMirroring: string[] = [];

            // Critical Tools
            if (versions.node === 'Not Found') missingCritical.push('Node.js');
            if (versions.adb === 'Not Found') missingCritical.push('ADB');

            // Testing Tools
            if (versions.python === 'Not Found') missingTesting.push('Python');
            if (versions.robot === 'Not Found') missingTesting.push('Robot Framework');
            if (versions.appium === 'Not Found') missingTesting.push('Appium');
            if (versions.uiautomator2 === 'Not Found') missingTesting.push('UiAutomator2');

            // Mirroring Tools
            if (versions.scrcpy === 'Not Found') missingMirroring.push('Scrcpy');

            setSystemCheckStatus({
                loading: false,
                complete: true,
                missingCritical,
                missingTesting,
                missingMirroring
            });

        } catch (e) {
            console.error("Failed to load system versions", e);
            setSystemCheckStatus(prev => ({ ...prev, loading: false }));
        }
    };

    return (
        <SettingsContext.Provider value={{
            settings: activeProfile.settings,
            activeProfileId: storeData.activeProfileId,
            profiles: Object.values(storeData.profiles),
            updateSetting,
            createProfile,
            switchProfile,
            renameProfile,
            deleteProfile,
            loading,
            systemVersions,
            checkSystemVersions,
            systemCheckStatus
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
function deepMerge(target: any, source: any): any {
    const output = { ...target };
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target)) Object.assign(output, { [key]: source[key] });
                else output[key] = deepMerge(target[key], source[key]);
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}

function isObject(item: any) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

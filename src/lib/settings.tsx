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
}

// Initialize the store
const store = new LazyStore('settings.json');

export interface AppSettings {
    theme: 'dark' | 'light';
    language: string;
    geminiApiKey: string;

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
    geminiApiKey: '',
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

    const checkSystemVersions = async () => {
        if (systemVersions) return;
        try {
            const versions = await invoke<SystemVersions>('get_system_versions');
            setSystemVersions(versions);
        } catch (e) {
            console.error("Failed to load system versions", e);
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
            checkSystemVersions
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

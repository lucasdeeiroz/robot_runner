import { LazyStore } from '@tauri-apps/plugin-store';
import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
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
    scrcpy: string;
    ngrok: string;
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
    recycleDeviceViews: false, // Default to false
    appiumHost: '127.0.0.1',
    appiumPort: 4723,
    paths: {
        automationRoot: '',
        resources: '',
        tests: '',
        suites: '',
        logs: '',
        logcat: '',
        screenshots: '',
        recordings: '',
    },
    tools: {
        appiumArgs: '--relaxed-security',
        scrcpyArgs: '-m 1024 -b 2M --max-fps=30 --no-audio --stay-awake',
        robotArgs: '--split-log',
        appPackage: 'com.android.chrome, com.chrome.beta',
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
    createProfile: (name: string) => void;
    switchProfile: (id: string) => void;
    renameProfile: (id: string, name: string) => void;
    deleteProfile: (id: string) => void;
    loading: boolean;
    systemVersions: SystemVersions | null;
    checkSystemVersions: () => Promise<void>;
    systemCheckStatus: SystemCheckStatus;
    updateInfo: UpdateInfo | null;
    checkForAppUpdate: (manual?: boolean) => Promise<void>;
    isNgrokEnabled: boolean;
    enableNgrok: () => void;
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
    const [isNgrokEnabled, setIsNgrokEnabled] = useState(false);

    const enableNgrok = () => {
        setIsNgrokEnabled(true);
    };

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
            feedback.toast.error("settings.load_error", e);
        } finally {
            setLoading(false);
        }
    };

    const saveStore = (data: SettingsStoreData) => {
        store.set('app_config', data).then(() => store.save()).catch(e => {
            feedback.toast.error("settings.save_error", e);
        });
    };

    const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        const activeId = storeData.activeProfileId;
        const currentProfile = storeData.profiles[activeId];

        // console.log(`[Settings] Updating ${key} to ${value} for profile ${activeId}`);

        if (!currentProfile) {
            feedback.toast.error("settings.profile_not_found");
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
        missingAppium: [],
        missingTesting: [],
        missingMirroring: [],
        missingTunnelling: []
    });

    const checkSystemVersions = async () => {
        setSystemCheckStatus(prev => ({ ...prev, loading: true }));
        try {
            // Conditionally skip ngrok check if not enabled
            const versions = await invoke<SystemVersions>('get_system_versions', { checkNgrok: isNgrokEnabled });

            // If ngrok is not enabled, artificially mark it as 'Not Found' or simply ignore checking it if the backend supports it.
            // Since backend returns all, we just filter it out effectively from the "error" list if we considered "Not Found" a critical error, 
            // but here we want to avoid showing it.
            // However, the prompt says: "Não fazer checagem de versão do ngrok durante o startup".
            // Since `get_system_versions` likely runs ALL checks in the backend, we might need a backend change OR just ignore the result here.
            // But if the backend check is slow/blocking, we'd want to avoid it.
            // Assuming `get_system_versions` is fast enough or we can't change backend easily:
            // We will just manage the UI state 'ngrok' based on `isNgrokEnabled`.

            // Wait, the prompt says: "Não fazer checagem de versão do ngrok durante o startup".
            // If the backend `get_system_versions` blindly checks everything, we rely on `isNgrokEnabled` to HIDE it.
            // BUT, if we can pass a flag to `get_system_versions` that would be ideal.
            // For now, assuming we can't change backend implementation in this step (TS implementation plan), 
            // we will simulate the behavior by overriding the result in state if not enabled.

            if (!isNgrokEnabled) {
                // Determine if we should even show it as "missing"
                // If it's disabled, we don't care if it's missing.
                versions.ngrok = ""; // Clear it so it doesn't show up? Or keep it but don't error?
            }

            setSystemVersions(versions);

            const missingCritical: string[] = [];
            const missingAppium: string[] = [];
            const missingTesting: string[] = [];
            const missingMirroring: string[] = [];
            const missingTunnelling: string[] = [];

            // Critical Tools
            if (versions.adb === 'Not Found') {
                missingCritical.push('ADB');
            }

            // Appium Tools
            if (versions.node === 'Not Found') missingAppium.push('Node.js');
            if (versions.appium === 'Not Found') missingAppium.push('Appium (Node.js)');
            if (versions.uiautomator2 === 'Not Found') missingAppium.push('UiAutomator2 (Appium)');

            // Testing Tools
            if (versions.python === 'Not Found') missingTesting.push('Python');
            if (versions.robot === 'Not Found') missingTesting.push('Robot Framework (Python)');
            if (versions.appium_lib === 'Not Found') missingTesting.push('AppiumLibrary (Robot Framework)');

            // Mirroring Tools
            if (versions.scrcpy === 'Not Found') missingMirroring.push('Scrcpy');

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
            const info = await checkForUpdates();
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
            systemCheckStatus,
            updateInfo,
            checkForAppUpdate,
            isNgrokEnabled,
            enableNgrok
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

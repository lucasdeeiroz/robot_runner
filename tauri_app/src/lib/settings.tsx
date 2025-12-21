import { LazyStore } from '@tauri-apps/plugin-store';
import { useState, useEffect, createContext, useContext, ReactNode } from 'react';

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
        logcat: '',
        screenshots: '',
        recordings: ''
    },
    tools: {
        appiumArgs: '--relaxed-security',
        scrcpyArgs: '',
        robotArgs: '',
        appPackage: '',
        ngrokToken: ''
    }
};

interface SettingsContextType {
    settings: AppSettings;
    updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
    loading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const saved = await store.get<AppSettings>('app_config');
            if (saved) {
                // Merge saved settings with default to ensure new fields are present
                setSettings(deepMerge(DEFAULT_SETTINGS, saved));
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        } finally {
            setLoading(false);
        }
    };

    const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        const newSettings = { ...settings, [key]: value };
        // Optimistic update
        setSettings(newSettings);
        // Persist in background
        store.set('app_config', newSettings).then(() => store.save()).catch(e => {
            console.error('Failed to save settings:', e);
        });
    };

    return (
        <SettingsContext.Provider value={{ settings, updateSetting, loading }}>
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

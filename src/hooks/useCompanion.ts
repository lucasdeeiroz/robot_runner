import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { version } from '@tauri-apps/plugin-os';
import { readFile } from '@tauri-apps/plugin-fs';
import packageJson from '../../package.json';
import { useSettings } from '../lib/settings';
import { useAuth } from '../lib/authStore';

export type CompanionStatus = 'disconnected' | 'connecting' | 'connected' | 'not_installed' | 'needs_update';

export interface CompanionEventItem {
    type: string;
    packageName: string;
    message: string;
    timestamp: number;
}

export interface HostMetadata {
    hostname: string;
    os_name: string;
}

export interface IncomingSnippetData {
    deviceUdid: string;
    content: string;
    timestamp: number;
}

let globalIncomingSnippet: IncomingSnippetData | null = null;
const globalSnippetListeners = new Set<(snippet: IncomingSnippetData | null) => void>();

export function setGlobalIncomingSnippet(snippet: IncomingSnippetData | null) {
    globalIncomingSnippet = snippet;
    globalSnippetListeners.forEach(listener => listener(snippet));
}

export interface CompanionDeviceInfo {
    status?: string;
    manufacturer: string;
    model: string;
    brand: string;
    androidVersion: string;
    sdkInt: number;
    serial: string;
    isAccessibilityEnabled?: boolean;
    battery?: {
        level: number;
        temperature: number;
        voltage: number;
        isCharging: boolean;
        health?: string;
        plugType?: string;
        currentNowmA?: number;
        currentAvgmA?: number;
    };
    storage?: {
        freeBytes: number;
        totalBytes: number;
    };
    nfc?: {
        isSupported: boolean;
        isEnabled: boolean;
    };
    printer?: {
        isSupported: boolean;
        hasPaper: boolean;
        coverOpen: boolean;
        isReady: boolean;
        vendor: string;
    };
}

interface CompanionDeviceCache {
    status: CompanionStatus;
    isInstalled: boolean | null;
    deviceInfo: CompanionDeviceInfo | null;
    recentEvents: CompanionEventItem[];
    lastConnectedAt?: number;
}

const companionCacheMap = new Map<string, CompanionDeviceCache>();
const companionListeners = new Set<(device: string, cache: CompanionDeviceCache) => void>();
const connectingDevicesSet = new Set<string>();

function safeParseCompanionJson<T = any>(raw: string): T {
    const trimmed = (raw || '').trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return JSON.parse(trimmed);
    }
    const firstBrace = trimmed.indexOf('{');
    const firstBracket = trimmed.indexOf('[');
    const startIndex = (firstBrace !== -1 && firstBracket !== -1)
        ? Math.min(firstBrace, firstBracket)
        : (firstBrace !== -1 ? firstBrace : firstBracket);
    if (startIndex !== -1) {
        return JSON.parse(trimmed.slice(startIndex));
    }
    return JSON.parse(trimmed);
}

function updateCompanionCache(device: string, updates: Partial<CompanionDeviceCache>) {
    const current = companionCacheMap.get(device) || {
        status: 'disconnected',
        isInstalled: null,
        deviceInfo: null,
        recentEvents: []
    };
    const updated = { ...current, ...updates };
    companionCacheMap.set(device, updated);
    companionListeners.forEach(listener => listener(device, updated));
}

export function useCompanion(selectedDevice: string | null) {
    const initialCache = selectedDevice ? companionCacheMap.get(selectedDevice) : null;
    const [status, setStatusState] = useState<CompanionStatus>(initialCache?.status ?? 'disconnected');
    const [isInstalled, setIsInstalledState] = useState<boolean | null>(initialCache?.isInstalled ?? null);
    const [deviceInfo, setDeviceInfoState] = useState<CompanionDeviceInfo | null>(initialCache?.deviceInfo ?? null);
    const [recentEvents, setRecentEventsState] = useState<CompanionEventItem[]>(initialCache?.recentEvents ?? []);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const { settings } = useSettings();
    const { user } = useAuth();
    const [incomingSnippet, setIncomingSnippet] = useState<IncomingSnippetData | null>(globalIncomingSnippet);

    useEffect(() => {
        const listener = (snippet: IncomingSnippetData | null) => {
            setIncomingSnippet(snippet);
        };
        globalSnippetListeners.add(listener);
        return () => {
            globalSnippetListeners.delete(listener);
        };
    }, []);

    const clearIncomingSnippet = useCallback(() => {
        setGlobalIncomingSnippet(null);
    }, []);

    const setStatus = useCallback((s: CompanionStatus) => {
        setStatusState(s);
        if (selectedDevice) updateCompanionCache(selectedDevice, { status: s });
    }, [selectedDevice]);

    const setIsInstalled = useCallback((inst: boolean | null) => {
        setIsInstalledState(inst);
        if (selectedDevice) updateCompanionCache(selectedDevice, { isInstalled: inst });
    }, [selectedDevice]);

    const setDeviceInfo = useCallback((info: CompanionDeviceInfo | null) => {
        setDeviceInfoState(info);
        if (selectedDevice) updateCompanionCache(selectedDevice, { deviceInfo: info, ...(info ? { lastConnectedAt: Date.now() } : {}) });
    }, [selectedDevice]);

    const setRecentEvents = useCallback((events: CompanionEventItem[]) => {
        setRecentEventsState(events);
        if (selectedDevice) updateCompanionCache(selectedDevice, { recentEvents: events });
    }, [selectedDevice]);

    // Sync state when other instances of useCompanion update cache for this device
    useEffect(() => {
        if (!selectedDevice) return;
        const listener = (device: string, cache: CompanionDeviceCache) => {
            if (device === selectedDevice) {
                setStatusState(cache.status);
                setIsInstalledState(cache.isInstalled);
                setDeviceInfoState(cache.deviceInfo);
                setRecentEventsState(cache.recentEvents);
            }
        };
        companionListeners.add(listener);
        return () => {
            companionListeners.delete(listener);
        };
    }, [selectedDevice]);

    const checkInstallation = useCallback(async () => {
        if (!selectedDevice) {
            setIsInstalled(null);
            setStatus('disconnected');
            return false;
        }
        try {
            const installed = await invoke<boolean>('check_companion_installed', { device: selectedDevice });
            setIsInstalled(installed);
            if (!installed) {
                setStatus('not_installed');
            } else {
                const installedVersion = await getCompanionVersion();
                if (installedVersion !== packageJson.version && installedVersion !== null) {
                    setStatus('needs_update');
                }
            }
            return installed;
        } catch (e) {
            console.error("[useCompanion] Failed to check installation:", e);
            setIsInstalled(false);
            setStatus('not_installed');
            return false;
        }
    }, [selectedDevice]);

    const getCompanionVersion = useCallback(async () => {
        if (!selectedDevice) return null;
        try {
            const version = await invoke<string>('get_app_version', {
                device: selectedDevice,
                package: 'com.lucasdeeiroz.robotrunner'
            });
            // console.log("Versão do app:", version);
            return version;
        } catch (e) {
            console.error("[useCompanion] Failed to get companion version:", e);
            return null;
        }
    }, [selectedDevice]);

    const fetchDeviceStats = useCallback(async (port: number) => {
        try {
            const rawJson = await invoke<string>('fetch_companion_info', { port, device: selectedDevice });
            const data: CompanionDeviceInfo = safeParseCompanionJson<CompanionDeviceInfo>(rawJson);
            setDeviceInfo(data);
            setStatus('connected');
            return true;
        } catch (err) {
            console.warn("[useCompanion] Failed to fetch device info via companion bridge:", err);
            setStatus('disconnected');
            return false;
        }
    }, [selectedDevice]);

    const fetchRecentEvents = useCallback(async (port = 9876) => {
        try {
            const rawJson = await invoke<string>('fetch_companion_events', { port, device: selectedDevice });
            const parsed = safeParseCompanionJson(rawJson);
            if (parsed.status === 'ok' && Array.isArray(parsed.events)) {
                setRecentEvents(parsed.events);
                return parsed.events as CompanionEventItem[];
            }
        } catch (e) {
            console.error("[useCompanion] Failed to fetch recent events:", e);
        }
        return [];
    }, [selectedDevice]);

    const fetchInstantUiTree = useCallback(async (port = 9876) => {
        try {
            const rawJson = await invoke<string>('fetch_companion_ui_tree', { port, device: selectedDevice });
            return safeParseCompanionJson(rawJson);
        } catch (e) {
            console.error("[useCompanion] Failed to fetch instant UI tree:", e);
            throw e;
        }
    }, [selectedDevice]);

    const fetchPendingSnippet = useCallback(async (port = 9876) => {
        try {
            const snippet = await invoke<string | null>('fetch_companion_pending_snippet', { port, device: selectedDevice });
            if (snippet && selectedDevice) {
                setGlobalIncomingSnippet({
                    deviceUdid: selectedDevice,
                    content: snippet,
                    timestamp: Date.now()
                });
            }
        } catch (e) {
            // silent
        }
    }, [selectedDevice]);

    const enableAccessibility = useCallback(async () => {
        if (!selectedDevice) return;
        try {
            await invoke('enable_companion_accessibility', { device: selectedDevice });
            console.log("[useCompanion] Enabled accessibility service on device:", selectedDevice);
            setTimeout(() => {
                fetchDeviceStats(9876);
            }, 1000);
        } catch (e) {
            console.error("[useCompanion] Failed to enable accessibility service:", e);
            throw e;
        }
    }, [selectedDevice, fetchDeviceStats]);

    const generatePdfReport = useCallback(async (port = 9876) => {
        try {
            const rawJson = await invoke<string>('generate_companion_pdf_report', { port, device: selectedDevice });
            return safeParseCompanionJson(rawJson);
        } catch (e) {
            console.error("[useCompanion] Failed to generate PDF report:", e);
            throw e;
        }
    }, [selectedDevice]);

    const runStandaloneCheckup = useCallback(async (port = 9876) => {
        try {
            const rawJson = await invoke<string>('run_companion_standalone_checkup', { port, device: selectedDevice });
            return safeParseCompanionJson(rawJson);
        } catch (e) {
            console.error("[useCompanion] Failed to run standalone checkup:", e);
            throw e;
        }
    }, [selectedDevice]);

    const performNodeAction = useCallback(async (opts: { resourceId?: string; text?: string; contentDescription?: string; action?: string; value?: string }, port = 9876) => {
        try {
            const rawJson = await invoke<string>('perform_companion_node_action', {
                port,
                resourceId: opts.resourceId,
                text: opts.text,
                contentDescription: opts.contentDescription,
                action: opts.action || 'click',
                value: opts.value,
                device: selectedDevice
            });
            return safeParseCompanionJson(rawJson);
        } catch (e) {
            console.error("[useCompanion] Failed to perform node action:", e);
            throw e;
        }
    }, [selectedDevice]);

    const syncTheme = useCallback(async (
        theme: string, 
        primaryColor: string, 
        userName?: string, 
        userEmail?: string,
        userPhotoBase64?: string,
        logoBase64?: string,
        port = 9876
    ) => {
        try {
            const payload = {
                theme,
                primaryColor,
                userName,
                userEmail,
                userPhotoBase64,
                logoBase64
            };
            const rawJson = await invoke<string>('trigger_companion_action', { 
                port, 
                endpoint: '/sync/theme',
                payload: JSON.stringify(payload),
                device: selectedDevice
            });
            return safeParseCompanionJson(rawJson);
        } catch (e) {
            console.error("[useCompanion] Failed to sync theme:", e);
            return null;
        }
    }, [selectedDevice]);

    const syncHostInfo = useCallback(async (port = 9876) => {
        try {
            const hostData = await invoke<HostMetadata>('get_host_metadata');
            const payload = {
                hostname: hostData.hostname,
                os_name: hostData.os_name,
                os_version: version(),
                appVersion: packageJson.version,
                user_name: user?.displayName || user?.email || 'Unknown User'
            };
            const result = await invoke<string>('trigger_companion_action', {
                port,
                endpoint: '/sync/host',
                payload: JSON.stringify(payload),
                device: selectedDevice
            });
            return safeParseCompanionJson(result);
        } catch (e) {
            console.warn("[useCompanion] Failed to sync host info:", e);
            return null;
        }
    }, [user, selectedDevice]);

    const connectCompanion = useCallback(async () => {
        if (!selectedDevice) return;
        if (connectingDevicesSet.has(selectedDevice)) return;
        connectingDevicesSet.add(selectedDevice);

        const isAlreadyConnected = companionCacheMap.get(selectedDevice)?.status === 'connected';
        if (!isAlreadyConnected) {
            setStatus('connecting');
        }
        console.log("[useCompanion] Connecting to Companion on device:", selectedDevice);

        // Prepare Logo Base64
        let logoBase64: string | undefined = undefined;
        const logoPath = settings.theme === 'light' ? settings.customLogoLight : settings.customLogoDark;
        if (logoPath) {
            try {
                if (logoPath.startsWith('data:')) {
                    logoBase64 = logoPath.split(',')[1];
                } else {
                    let data: Uint8Array | null = null;
                    try {
                        data = await readFile(logoPath);
                    } catch (e) {
                        if (logoPath.includes('/')) {
                            data = await readFile(logoPath.replace(/\//g, '\\'));
                        }
                    }
                    if (data) {
                        const uint8Array = new Uint8Array(data);
                        let binaryString = '';
                        const chunkSize = 8192;
                        for (let i = 0; i < uint8Array.length; i += chunkSize) {
                            const chunk = uint8Array.subarray(i, i + chunkSize);
                            binaryString += String.fromCharCode.apply(null, Array.from(chunk));
                        }
                        logoBase64 = btoa(binaryString);
                    }
                }
            } catch (e) {
                console.warn("[useCompanion] Failed to load logo base64:", e);
            }
        }

        try {
            const installed = await checkInstallation();
            if (!installed) {
                console.warn("[useCompanion] Companion app not installed");
                setStatus('not_installed');
                return;
            }

            // Setup ADB Forward
            const port = await invoke<number>('start_companion_forward', {
                device: selectedDevice,
                localPort: 9876,
                remotePort: 9876
            });
            console.log("[useCompanion] ADB port forward established on port:", port);

            // Ensure Accessibility Service is enabled via ADB on selected device
            try {
                await invoke('enable_companion_accessibility', { device: selectedDevice });
            } catch (e) {
                console.warn("[useCompanion] Auto enable accessibility failed silently:", e);
            }
            
            // Grant necessary permissions via ADB (READ_LOGS, DUMP, etc)
            try {
                await invoke('grant_companion_permissions', { device: selectedDevice });
            } catch (e) {
                console.warn("[useCompanion] Auto grant permissions failed silently:", e);
            }

            // Initial fetch
            const success = await fetchDeviceStats(port);
            if (success) {
                console.log("[useCompanion] Companion connected successfully!");
                syncTheme(
                    settings.theme, 
                    settings.primaryColor || '#6366F1', 
                    (user?.displayName || user?.email) ?? undefined, 
                    user?.email ?? undefined, 
                    user?.photoURL ?? undefined, 
                    logoBase64, 
                    port
                );
                syncHostInfo(port);
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = setInterval(() => {
                    fetchDeviceStats(port);
                    fetchRecentEvents(port);
                    fetchPendingSnippet(port);
                }, 3000);
            } else {
                console.warn("[useCompanion] Initial HTTP fetch failed. Attempting silent launch of Companion app...");
                try {
                    await invoke('launch_companion_app', { device: selectedDevice });
                    setTimeout(async () => {
                        const retrySuccess = await fetchDeviceStats(port);
                        if (retrySuccess) {
                            console.log("[useCompanion] Companion connected successfully after silent launch!");
                            syncTheme(
                                settings.theme, 
                                settings.primaryColor || '#6366F1', 
                                (user?.displayName || user?.email) ?? undefined, 
                                user?.email ?? undefined, 
                                user?.photoURL ?? undefined, 
                                logoBase64, 
                                port
                            );
                            syncHostInfo(port);
                            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                            pollIntervalRef.current = setInterval(() => {
                                fetchDeviceStats(port);
                                fetchRecentEvents(port);
                                fetchPendingSnippet(port);
                            }, 3000);
                        } else {
                            setStatus('disconnected');
                        }
                    }, 1500);
                } catch {
                    setStatus('disconnected');
                }
            }
        } catch (err) {
            console.error("[useCompanion] Connection error:", err);
            setStatus('disconnected');
        } finally {
            connectingDevicesSet.delete(selectedDevice);
        }
    }, [selectedDevice, checkInstallation, fetchDeviceStats, fetchRecentEvents, fetchPendingSnippet, syncTheme, syncHostInfo, settings.theme, settings.primaryColor, settings.customLogoLight, settings.customLogoDark, user]);

    const launchCompanion = useCallback(async () => {
        if (!selectedDevice) return;
        try {
            console.log("[useCompanion] Launching Companion App...");
            await invoke('launch_companion_app', { device: selectedDevice });
            setTimeout(() => {
                connectCompanion();
            }, 1200);
        } catch (e) {
            console.error("[useCompanion] Failed to launch companion app:", e);
        }
    }, [selectedDevice, connectCompanion]);

    const lastSyncedThemeKeyRef = useRef<string | null>(null);
    useEffect(() => {
        if (status === 'connected' && selectedDevice) {
            const themeKey = `${selectedDevice}_${settings.theme}_${settings.primaryColor}_${settings.customLogoLight}_${settings.customLogoDark}_${user?.displayName || user?.email}`;
            if (lastSyncedThemeKeyRef.current === themeKey) {
                return;
            }
            lastSyncedThemeKeyRef.current = themeKey;

            const logoPath = settings.theme === 'light' ? settings.customLogoLight : settings.customLogoDark;
            const syncThemeWithLogo = async () => {
                let logoBase64: string | undefined = undefined;
                if (logoPath) {
                    try {
                        if (logoPath.startsWith('data:')) {
                            logoBase64 = logoPath.split(',')[1];
                        } else {
                            let data: Uint8Array | null = null;
                            try {
                                data = await readFile(logoPath);
                            } catch (e) {
                                if (logoPath.includes('/')) {
                                    data = await readFile(logoPath.replace(/\//g, '\\'));
                                }
                            }
                            if (data) {
                                const uint8Array = new Uint8Array(data);
                                let binaryString = '';
                                const chunkSize = 8192;
                                for (let i = 0; i < uint8Array.length; i += chunkSize) {
                                    const chunk = uint8Array.subarray(i, i + chunkSize);
                                    binaryString += String.fromCharCode.apply(null, Array.from(chunk));
                                }
                                logoBase64 = btoa(binaryString);
                            }
                        }
                    } catch (e) {
                        console.warn("[useCompanion] Failed to load logo base64 in useEffect:", e);
                    }
                }
                
                syncTheme(
                    settings.theme, 
                    settings.primaryColor || '#6366F1', 
                    (user?.displayName || user?.email) ?? undefined, 
                    user?.email ?? undefined, 
                    user?.photoURL ?? undefined,
                    logoBase64
                );
            };
            syncThemeWithLogo();
        }
    }, [settings.theme, settings.primaryColor, settings.customLogoLight, settings.customLogoDark, user, status, selectedDevice, syncTheme]);

    const triggerAction = useCallback(async (endpoint: string, payload?: any) => {
        try {
            const result = await invoke<string>('trigger_companion_action', {
                port: 9876,
                endpoint,
                payload: payload ? JSON.stringify(payload) : null,
                device: selectedDevice
            });
            return safeParseCompanionJson(result);
        } catch (e) {
            console.error(`[useCompanion] Failed to trigger action ${endpoint}:`, e);
            throw e;
        }
    }, [selectedDevice]);

    const performTap = useCallback(async (x: number, y: number) => {
        return triggerAction('/action/tap', { x, y });
    }, [triggerAction]);

    const connectedDeviceTrackRef = useRef<string | null>(null);

    useEffect(() => {
        if (selectedDevice) {
            const cached = companionCacheMap.get(selectedDevice);
            if (cached?.status === 'connected') {
                setStatus('connected');
                setDeviceInfo(cached.deviceInfo);
                setRecentEvents(cached.recentEvents);
                setIsInstalled(cached.isInstalled);
            }
            if (connectedDeviceTrackRef.current !== selectedDevice) {
                connectedDeviceTrackRef.current = selectedDevice;
                checkInstallation().then(installed => {
                    if (installed) {
                        connectCompanion();
                    }
                });
            }
        } else {
            connectedDeviceTrackRef.current = null;
            setStatus('disconnected');
            setDeviceInfo(null);
            setRecentEvents([]);
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
        }

        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
        };
    }, [selectedDevice]);;

    const fetchArtifacts = useCallback(async (port = 9876) => {
        try {
            const rawJson = await invoke<string>('fetch_companion_artifacts', { port, device: selectedDevice });
            return safeParseCompanionJson(rawJson);
        } catch (e) {
            console.error("[useCompanion] Failed to fetch companion artifacts:", e);
            throw e;
        }
    }, [selectedDevice]);

    const fetchFleetPeers = useCallback(async (port = 9876) => {
        try {
            const rawJson = await invoke<string>('fetch_companion_fleet_peers', { port, device: selectedDevice });
            return safeParseCompanionJson(rawJson);
        } catch (e) {
            console.error("[useCompanion] Failed to fetch companion fleet peers:", e);
            throw e;
        }
    }, [selectedDevice]);

    const pushPayload = useCallback(async (payload: { artifactType: string; fileName: string; contentJson: string }, port = 9876) => {
        try {
            const rawJson = await invoke<string>('push_companion_payload', { port, payload: JSON.stringify(payload), device: selectedDevice });
            return safeParseCompanionJson(rawJson);
        } catch (e) {
            console.error("[useCompanion] Failed to push companion payload:", e);
            throw e;
        }
    }, [selectedDevice]);

    const pushActivityEvent = useCallback(async (status: string, testName: string, port = 9876) => {
        try {
            const payload = {
                type: "bdd_test",
                status,
                message: testName,
                timestamp: Date.now()
            };
            const result = await invoke<string>('trigger_companion_action', {
                port,
                endpoint: '/sync/activity',
                payload: JSON.stringify(payload),
                device: selectedDevice
            });
            return safeParseCompanionJson(result);
        } catch (e) {
            console.warn("[useCompanion] Failed to push activity event:", e);
            return null;
        }
    }, [selectedDevice]);

    return {
        status,
        isInstalled,
        deviceInfo,
        recentEvents,
        checkInstallation,
        connectCompanion,
        launchCompanion,
        triggerAction,
        fetchInstantUiTree,
        fetchRecentEvents,
        enableAccessibility,
        generatePdfReport,
        runStandaloneCheckup,
        performTap,
        performNodeAction,
        fetchArtifacts,
        fetchFleetPeers,
        pushPayload,
        syncTheme,
        syncHostInfo,
        pushActivityEvent,
        incomingSnippet,
        clearIncomingSnippet
    };
}

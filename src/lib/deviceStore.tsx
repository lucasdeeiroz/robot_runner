import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Device } from '@/lib/types';
import { feedback } from '@/lib/feedback';

interface DeviceContextType {
    devices: Device[];
    selectedDevices: string[];
    loading: boolean;
    loadDevices: () => Promise<void>;
    setSelectedDevices: (ids: string[]) => void;
    toggleDevice: (udid: string, multi: boolean) => void;
    selectSingleDevice: (udid: string) => void;
}

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

export function DeviceProvider({ children }: { children: React.ReactNode }) {
    const [devices, setDevices] = useState<Device[]>([]);
    const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const loadDevices = useCallback(async () => {
        setLoading(true);
        try {
            const list = await invoke<Device[]>('get_connected_devices');
            setDevices(list);

            // Auto-select logic if selection is empty or invalid
            setSelectedDevices(prev => {
                // If we have no selection and devices exist, select the first one
                if (prev.length === 0 && list.length > 0) {
                    return [list[0].udid];
                }

                // If we have selection, filter out disconnected ones
                const valid = prev.filter(id => list.find(d => d.udid === id));

                // If all selected were disconnected, but we have devices, select first
                if (valid.length === 0 && list.length > 0) {
                    return [list[0].udid];
                }

                // If valid selection changed length (some disconnected), update
                if (valid.length !== prev.length) {
                    return valid;
                }

                return prev;
            });

        } catch (e) {
            feedback.toast.error("devices.load_error", e);
        } finally {
            setLoading(false);
        }
    }, []);

    // Load on mount
    useEffect(() => {
        loadDevices();
    }, [loadDevices]);

    const toggleDevice = useCallback((udid: string, multi: boolean) => {
        setSelectedDevices(prev => {
            if (multi) {
                return prev.includes(udid)
                    ? prev.filter(id => id !== udid)
                    : [...prev, udid];
            } else {
                return [udid]; // Single select mode
            }
        });
    }, []);

    const selectSingleDevice = useCallback((udid: string) => {
        setSelectedDevices([udid]);
    }, []);

    return (
        <DeviceContext.Provider value={{
            devices,
            selectedDevices,
            loading,
            loadDevices,
            setSelectedDevices,
            toggleDevice,
            selectSingleDevice
        }}>
            {children}
        </DeviceContext.Provider>
    );
}

export function useDevices() {
    const context = useContext(DeviceContext);
    if (context === undefined) {
        throw new Error('useDevices must be used within a DeviceProvider');
    }
    return context;
}

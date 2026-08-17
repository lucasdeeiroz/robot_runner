import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface ScannerLap {
    cameraInitMs: number;
    searchMs: number;
    decodeMs: number;
    totalLatencyMs: number;
    barcodeValue: string;
    format: number;
}

export function useScannerStopwatch(selectedDevice: string) {
    const [scannerLaps, setScannerLaps] = useState<ScannerLap[]>([]);
    const [pendingLap, setPendingLap] = useState<ScannerLap | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [isCompanionActive, setIsCompanionActive] = useState(false);

    useEffect(() => {
        if (!selectedDevice) return;
        const interval = setInterval(() => {
            invoke<string>('trigger_companion_action', {
                port: 9876,
                endpoint: '/stopwatch/scanner/laps',
                method: 'GET'
            })
                .then(rawJson => JSON.parse(rawJson))
                .then(data => {
                    if (data.status === 'ok') {
                        setIsCompanionActive(true);
                        setScannerLaps(data.laps || []);
                        setPendingLap(data.pendingLap || null);
                        setIsScanning(data.isScanning || false);
                    } else {
                        setIsCompanionActive(false);
                    }
                })
                .catch(() => {
                    setIsCompanionActive(false);
                });
        }, 1000);
        return () => clearInterval(interval);
    }, [selectedDevice]);

    const clearScannerLaps = async () => {
        if (!selectedDevice) return;
        try {
            await invoke('trigger_companion_action', {
                port: 9876,
                endpoint: '/stopwatch/scanner/action',
                method: 'POST',
                payload: JSON.stringify({ action: 'clearLaps' })
            });
            setScannerLaps([]);
        } catch (e) {
            console.error('Failed to clear scanner laps', e);
        }
    };

    return {
        scannerLaps,
        pendingLap,
        isScanning,
        isCompanionActive,
        clearScannerLaps
    };
}

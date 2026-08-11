import { useState, useEffect } from "react";

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
            fetch('http://127.0.0.1:9876/stopwatch/scanner/laps')
                .then(res => res.json())
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
            await fetch('http://127.0.0.1:9876/stopwatch/scanner/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'clearLaps' })
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

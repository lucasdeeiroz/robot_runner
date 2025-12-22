import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, Smartphone } from 'lucide-react';
import { Device, DeviceCard } from './DeviceCard';

export function DeviceList() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchDevices = async () => {
        setLoading(true);
        setError(null);
        try {
            // Invoke the Rust command
            const result = await invoke<Device[]>('get_connected_devices');
            setDevices(result);
        } catch (err) {
            setError(String(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDevices();
        // Poll every 5 seconds
        const interval = setInterval(fetchDevices, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Smartphone className="text-blue-500" />
                    Connected Devices
                    <span className="text-sm font-normal text-zinc-500 bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-800">
                        {devices.length}
                    </span>
                </h2>
                <button
                    onClick={fetchDevices}
                    disabled={loading}
                    className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-all active:scale-95 disabled:opacity-50"
                    title="Refresh Devices"
                >
                    <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    Failed to load devices: {error}
                </div>
            )}

            {devices.length === 0 && !loading && !error && (
                <div className="text-center py-12 border-2 border-dashed border-zinc-800 rounded-xl">
                    <Smartphone size={48} className="mx-auto text-zinc-700 mb-4" />
                    <h3 className="text-lg font-medium text-zinc-400">No devices found</h3>
                    <p className="text-zinc-500 text-sm mt-1">Connect a device via USB or Pair via Wi-Fi</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {devices.map((device) => (
                    <DeviceCard key={device.udid} device={device} />
                ))}
            </div>
        </div>
    );
}

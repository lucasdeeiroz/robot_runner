import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Wifi, Link, Unplug } from "lucide-react";
import { DeviceList } from "@/components/DeviceList";
import clsx from "clsx";

export function DevicesPage() {
    const [ip, setIp] = useState("");
    const [port, setPort] = useState("");
    const [code, setCode] = useState("");
    const [statusMsg, setStatusMsg] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);
    const [loading, setLoading] = useState(false);

    const handleAction = async (action: 'connect' | 'pair' | 'disconnect') => {
        if (!ip || !port) {
            setStatusMsg({ text: "IP and Port are required", type: 'error' });
            return;
        }
        if (action === 'pair' && !code) {
            setStatusMsg({ text: "Pairing code is required for pairing", type: 'error' });
            return;
        }

        setLoading(true);
        setStatusMsg({ text: `Executing ${action}...`, type: 'info' });

        try {
            let cmd = '';
            let args = { ip, port, code: code || undefined };

            if (action === 'connect') cmd = 'adb_connect';
            else if (action === 'pair') cmd = 'adb_pair';
            else if (action === 'disconnect') cmd = 'adb_disconnect';

            const res = await invoke<string>(cmd, args);
            setStatusMsg({ text: res || "Success", type: 'success' });

            // Clear successful inputs if needed, or keep for reuse
            if (action === 'pair') setCode("");

        } catch (e) {
            setStatusMsg({ text: String(e), type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div>
                <h1 className="text-3xl font-bold mb-2 text-zinc-900 dark:text-zinc-100">Device Manager</h1>
                <p className="text-zinc-500 dark:text-zinc-400">Manage connections, view status, and configure your Android devices.</p>
            </div>

            {/* Wireless Connection Card */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                        <Wifi className="text-blue-600 dark:text-blue-400" size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Wireless Connection</h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">Connect to devices via Wi-Fi ADB</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div>
                        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 ml-1">IP Address</label>
                        <input
                            type="text"
                            placeholder="192.168.1.x"
                            value={ip}
                            onChange={e => setIp(e.target.value)}
                            className="w-full bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 ml-1">Port</label>
                        <input
                            type="text"
                            placeholder="5555"
                            value={port}
                            onChange={e => setPort(e.target.value)}
                            className="w-full bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 ml-1">Pairing Code (Optional)</label>
                        <input
                            type="text"
                            placeholder="123456"
                            value={code}
                            onChange={e => setCode(e.target.value)}
                            className="w-full bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                        />
                    </div>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => handleAction('connect')}
                        disabled={loading || !ip || !port}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Link size={18} /> Connect
                    </button>
                    <button
                        onClick={() => handleAction('pair')}
                        disabled={loading || !ip || !port || !code}
                        className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Wifi size={18} /> Pair
                    </button>
                    <button
                        onClick={() => handleAction('disconnect')}
                        disabled={loading || !ip || !port}
                        className="px-4 py-2 bg-red-100 dark:bg-red-900/20 hover:bg-red-200 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg font-medium transition-colors flex items-center gap-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Unplug size={18} /> Disconnect
                    </button>
                </div>

                {/* Status Message Area */}
                {statusMsg && (
                    <div className={clsx(
                        "mt-4 p-3 rounded-lg text-sm font-mono break-all animate-in slide-in-from-top-2",
                        statusMsg.type === 'error' ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50" :
                            statusMsg.type === 'success' ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-900/50" :
                                "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50"
                    )}>
                        {statusMsg.text}
                    </div>
                )}
            </div>

            <DeviceList />
        </div>
    );
}

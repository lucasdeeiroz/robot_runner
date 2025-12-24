import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Wifi, Link, Unplug, Globe, Copy } from "lucide-react";
import clsx from "clsx";
import { useSettings } from "@/lib/settings";
import { useTranslation } from "react-i18next";
import { feedback } from "@/lib/feedback";

interface ConnectSubTabProps {
    onDeviceConnected: () => void;
    selectedDevice?: string; // Add this prop
}

export function ConnectSubTab({ onDeviceConnected, selectedDevice }: ConnectSubTabProps) {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const [ip, setIp] = useState("");
    const [port, setPort] = useState("");
    const [code, setCode] = useState("");
    const [statusMsg, setStatusMsg] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);
    const [loading, setLoading] = useState(false);

    // Auto-Discovery Effect
    useEffect(() => {
        if (selectedDevice && selectedDevice.length > 5) { // Simple check if valid serial
            fetchDeviceIp();
        }
    }, [selectedDevice]);

    const fetchDeviceIp = async () => {
        if (!selectedDevice) return;
        try {
            const discoveredIp = await invoke<string>('get_device_ip', { serial: selectedDevice });
            if (discoveredIp) {
                setIp(discoveredIp);
                setPort("5555"); // Default port
                setStatusMsg({ text: `Auto-detected IP: ${discoveredIp}`, type: 'success' });
            }
        } catch (e) {
            console.log("Failed to auto-detect IP:", e);
            // Don't show error to user, just stay empty or silent
        }
    };

    // Ngrok State
    const [ngrokUrl, setNgrokUrl] = useState<string>("");
    const [ngrokLoading, setNgrokLoading] = useState(false);

    const handleStartNgrok = async () => {
        setNgrokLoading(true);
        try {
            const url = await invoke<string>('start_ngrok', {
                port: settings.appiumPort,
                token: settings.tools.ngrokToken
            });
            setNgrokUrl(url);
            setStatusMsg({ text: t('connect.status.tunnel_active'), type: 'success' });
            feedback.notify('feedback.remote_connected', 'feedback.details.url', { url });
        } catch (e) {
            console.error(e);
            setStatusMsg({ text: `Ngrok Error: ${e}`, type: 'error' });
        } finally {
            setNgrokLoading(false);
        }
    };

    const handleStopNgrok = async () => {
        try {
            await invoke('stop_ngrok');
            setNgrokUrl("");
            setStatusMsg({ text: "Ngrok Tunnel Stopped", type: 'info' }); // Keep this or add key? Let's assume stopped is okay.
        } catch (e) {
            setStatusMsg({ text: `Error stopping Ngrok: ${e}`, type: 'error' });
        }
    };

    const handleAction = async (action: 'connect' | 'pair' | 'disconnect') => {
        if (!ip || !port) {
            setStatusMsg({ text: t('connect.labels.ip') + " & " + t('connect.labels.port') + " required", type: 'error' });
            return;
        }
        if (action === 'pair' && !code) {
            setStatusMsg({ text: t('connect.labels.code') + " required", type: 'error' });
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

            if (action === 'connect') {
                // Wait a bit for device to appear in list
                setTimeout(() => onDeviceConnected(), 2000);
                feedback.notify('feedback.adb_connected', 'feedback.details.device', { device: ip });
            }

        } catch (e) {
            setStatusMsg({ text: String(e), type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full space-y-6 overflow-auto">
            {/* Wireless Connection Card */}
            <div className="bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                        <Wifi size={24} className="text-primary mb-2" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{t('connect.wireless.title')}</h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('connect.wireless.desc')}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div>
                        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 ml-1">{t('connect.labels.ip')}</label>
                        <input
                            type="text"
                            placeholder="192.168.1.x"
                            value={ip}
                            onChange={e => setIp(e.target.value)}
                            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 ml-1">{t('connect.labels.port')}</label>
                        <input
                            type="text"
                            placeholder="5555"
                            value={port}
                            onChange={e => setPort(e.target.value)}
                            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 ml-1">{t('connect.labels.code')}</label>
                        <input
                            type="text"
                            placeholder="123456"
                            value={code}
                            onChange={e => setCode(e.target.value)}
                            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                        />
                    </div>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => handleAction('connect')}
                        disabled={loading || !ip || !port}
                        className="px-6 py-2 bg-primary hover:opacity-90 text-white rounded-xl disabled:opacity-50 transition-all active:scale-95 flex items-center gap-2 font-medium shadow-lg shadow-primary/20 disabled:cursor-not-allowed"
                    >
                        <Link size={18} /> {t('connect.actions.connect')}
                    </button>
                    <button
                        onClick={() => handleAction('pair')}
                        disabled={loading || !ip || !port || !code}
                        className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Wifi size={18} /> {t('connect.actions.pair')}
                    </button>
                    <button
                        onClick={() => handleAction('disconnect')}
                        disabled={loading || !ip || !port}
                        className="px-4 py-2 bg-red-100 dark:bg-red-900/20 hover:bg-red-200 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg font-medium transition-colors flex items-center gap-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Unplug size={18} /> {t('connect.actions.disconnect')}
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
                {/* Ngrok Integration Card */}
                <div className="bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                            <Globe className="text-purple-600 dark:text-purple-400" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{t('connect.remote.title')}</h2>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('connect.remote.desc')}</p>
                        </div>
                    </div>

                    {!ngrokUrl && !ngrokLoading ? (
                        <div className="space-y-4">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 ml-1">{t('connect.labels.config')}</label>
                                <div className="flex items-center gap-2 p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg">
                                    <span className="text-sm text-zinc-500">{t('connect.labels.expose_port')}:</span>
                                    <span className="font-mono text-sm font-bold text-zinc-800 dark:text-zinc-200">{settings.appiumPort}</span>
                                    <span className="text-zinc-300 mx-2">|</span>
                                    <span className="text-sm text-zinc-500">{t('connect.labels.token')}:</span>
                                    <span className="font-mono text-sm text-zinc-800 dark:text-zinc-200">
                                        {settings.tools.ngrokToken ? '••••••••' : <span className="text-red-500 text-xs">{t('connect.labels.missing_token')}</span>}
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={handleStartNgrok}
                                disabled={!settings.tools.ngrokToken}
                                className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Link size={18} /> {t('connect.actions.start_tunnel')}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {ngrokLoading ? (
                                <div className="flex flex-col items-center justify-center p-8 space-y-3">
                                    <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                    <span className="text-sm text-zinc-500">{t('connect.status.starting_ngrok')}</span>
                                </div>
                            ) : (
                                <div className="space-y-4 animate-in fade-in">
                                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/50 rounded-lg p-4 flex flex-col items-center text-center space-y-2">
                                        <span className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wider">{t('connect.status.tunnel_active')}</span>
                                        <div className="flex items-center gap-2 bg-white dark:bg-black/40 px-3 py-1.5 rounded-md border border-green-200 dark:border-green-800/50">
                                            <span className="font-mono text-lg text-zinc-800 dark:text-zinc-200 select-all">{ngrokUrl}</span>
                                            <button
                                                onClick={() => { navigator.clipboard.writeText(ngrokUrl); setStatusMsg({ text: t('connect.actions.copy'), type: 'success' }); }}
                                                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-600"
                                                title="Copy URL"
                                            >
                                                <Copy size={16} />
                                            </button>
                                        </div>
                                        <span className="text-xs text-zinc-500">Forwarding to localhost:{settings.appiumPort}</span>
                                    </div>

                                    <button
                                        onClick={handleStopNgrok}
                                        className="w-full py-2 bg-red-100 dark:bg-red-900/20 hover:bg-red-200 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Unplug size={18} /> {t('connect.actions.stop_tunnel')}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}

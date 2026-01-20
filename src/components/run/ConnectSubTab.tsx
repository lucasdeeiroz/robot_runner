import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Wifi, Link, Unplug, Globe, Copy } from "lucide-react";
import clsx from "clsx";
import { useSettings } from "@/lib/settings";
import { useTranslation } from "react-i18next";
import { feedback } from "@/lib/feedback";
import { ConfirmationModal } from "@/components/shared/ConfirmationModal";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SplitButton } from "@/components/shared/SplitButton";
import { Section } from "@/components/organisms/Section";

interface ConnectSubTabProps {
    onDeviceConnected: () => void;
    selectedDevice?: string; // Add this prop
}

export function ConnectSubTab({ onDeviceConnected, selectedDevice }: ConnectSubTabProps) {
    const { t } = useTranslation();
    const { settings, systemCheckStatus } = useSettings();
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
            const output = await invoke<string>('run_adb_command', {
                device: selectedDevice,
                args: ['shell', 'ip -f inet addr show']
            });
            const lines = output.split('\n');
            let foundIp: string | null = null;

            const candidates: { ip: string, iface: string, priority: number }[] = [];

            for (const line of lines) {
                const match = line.match(/inet\s+(\d+\.\d+\.\d+\.\d+)\/(\d+)/);
                if (match && match[1] && match[1] !== '127.0.0.1') {
                    const ip = match[1];

                    let priority = 0;
                    if (line.includes('wlan')) priority = 10;
                    else if (line.includes('eth')) priority = 8;
                    else if (line.includes('en')) priority = 8; // en0 etc
                    else if (line.includes('rmnet')) priority = -1; // Mobile data - usually unreachable locally
                    else priority = 1;

                    candidates.push({ ip, iface: 'unknown', priority });
                }
            }

            // Sort by priority desc
            candidates.sort((a, b) => b.priority - a.priority);

            if (candidates.length > 0 && candidates[0].priority > 0) {
                foundIp = candidates[0].ip;
            }

            if (foundIp) {
                setIp(foundIp);
                setPort("5555");
                setStatusMsg({ text: t('connect.status.auto_ip', { ip: foundIp }), type: 'success' });
            } else {
                setStatusMsg({ text: t('connect.status.ip_not_found'), type: 'info' });
            }
        } catch (e) {
            // console.log("Failed to auto-detect IP:", e);
            setStatusMsg({ text: t('connect.status.ip_not_found'), type: 'info' });
        }
    };

    // Ngrok State
    const [ngrokUrl, setNgrokUrl] = useState<string>("");
    const [ngrokLoading, setNgrokLoading] = useState(false);
    const [ngrokStatusMsg, setNgrokStatusMsg] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);

    const handleStopNgrok = async () => {
        setNgrokStatusMsg(null);
        try {
            await invoke('stop_ngrok');
            setNgrokUrl("");
            setNgrokStatusMsg({ text: t('connect.status.tunnel_stopped'), type: 'info' });
        } catch (e) {
            setNgrokStatusMsg({ text: `${t('connect.status.tunnel_stop_error')}: ${e}`, type: 'error' });
        }
    };

    // Payment Required Modal
    const [showPaymentModal, setShowPaymentModal] = useState(false);

    const handleStartNgrok = async () => {
        setNgrokStatusMsg(null);
        setShowPaymentModal(false);

        if (!selectedDevice) {
            setNgrokStatusMsg({ text: t('connect.status.select_device_first') || "Select a device to expose", type: 'error' });
            return;
        }
        setNgrokLoading(true);
        try {
            // Determine device port (default 5555, or extract from IP:PORT)
            let devicePort = "5555";
            // Match :digits that might be at end or followed by whitespace
            const portMatch = selectedDevice.trim().match(/:(\d+)\b/);
            if (portMatch && portMatch[1]) {
                devicePort = portMatch[1];
            }

            // 1. Forward Local ADB Port (5555) -> Device (devicePort)
            await invoke('run_adb_command', {
                device: selectedDevice,
                args: ['forward', 'tcp:5555', `tcp:${devicePort}`]
            });

            // 2. Start Ngrok on port 5555
            const url = await invoke<string>('start_ngrok', {
                port: 5555,
                token: settings.tools.ngrokToken
            });
            setNgrokUrl(url);
            setNgrokStatusMsg({ text: t('connect.status.tunnel_active'), type: 'success' });
            feedback.notify('feedback.remote_connected', 'feedback.details.url', { url });
        } catch (e) {
            feedback.toast.error("connect.status.tunnel_start_error", e);
            const errStr = String(e);

            // Check for Payment Required Error (ERR_NGROK_8013)
            if (errStr.includes("ERR_NGROK_8013") || errStr.toLowerCase().includes("credit or debit card")) {
                setShowPaymentModal(true);
            }

            setNgrokStatusMsg({ text: `${t('connect.status.tunnel_start_error')}: ${e}`, type: 'error' });
        } finally {
            setNgrokLoading(false);
        }
    };

    const handleAction = async (action: 'connect' | 'pair' | 'disconnect' | 'disconnect_all') => {
        // Validation
        if (action !== 'disconnect_all' && action !== 'disconnect') {
            if (!ip || !port) {
                setStatusMsg({ text: t('connect.labels.ip') + " & " + t('connect.labels.port') + " required", type: 'error' });
                return;
            }
        }
        if (action === 'pair' && !code) {
            setStatusMsg({ text: t('connect.labels.code') + " required", type: 'error' });
            return;
        }

        setLoading(true);
        // Use generic "Disconnecting..." for both disconnect actions
        const statusKey = action === 'disconnect_all' ? 'disconnect' : action;

        setStatusMsg({ text: t(`connect.status.executing_${statusKey}`), type: 'info' });

        try {
            let cmd = '';
            let args: any = {};

            if (action === 'connect') {
                cmd = 'adb_connect';
                args = { ip, port };
            } else if (action === 'pair') {
                cmd = 'adb_pair';
                args = { ip, port, code };
            } else if (action === 'disconnect') {
                cmd = 'adb_disconnect';
                args = { ip, port };
            } else if (action === 'disconnect_all') {
                cmd = 'adb_disconnect_all';
                args = {};
            }

            // Execute command
            await invoke<string>(cmd, args);

            // Construct success message
            const target = `${ip}:${port}`;
            let successMsg = "";

            if (action === 'connect') {
                successMsg = t('connect.status.connection_success', { target });
            } else if (action === 'pair') {
                successMsg = t('connect.status.pairing_success', { target });
            } else if (action === 'disconnect') {
                successMsg = t('connect.status.disconnection_success', { target });
            } else if (action === 'disconnect_all') {
                successMsg = t('connect.status.disconnected_all');
            }

            setStatusMsg({ text: successMsg || "Success", type: 'success' });

            // Clear successful inputs if needed
            if (action === 'pair') setCode("");

            // Post-action side effects
            if (action === 'connect') {
                setTimeout(() => onDeviceConnected(), 2000);
                feedback.notify('feedback.adb_connected', 'feedback.details.device', { device: ip });
            } else if (action === 'disconnect' || action === 'disconnect_all') {
                setTimeout(() => onDeviceConnected(), 1000);
            }

        } catch (e: any) {
            const errStr = String(e);
            if (errStr.toLowerCase().includes("failed to connect") || errStr.includes("unable to connect") || errStr.toLowerCase().includes("cannot connect")) {
                setStatusMsg({ text: t('connect.status.connection_failed') + `: ${ip}:${port}`, type: 'error' });
            } else if (errStr.includes("Pairing failed")) {
                setStatusMsg({ text: t('connect.status.pairing_failed') + `: ${e}`, type: 'error' });
            } else {
                setStatusMsg({ text: errStr, type: 'error' });
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full space-y-6 overflow-auto">
            <ConfirmationModal
                isOpen={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                onConfirm={async () => {
                    await openUrl('https://dashboard.ngrok.com/settings#id-verification');
                    setShowPaymentModal(false);
                }}
                title={t('connect.status.payment_required_title')}
                description={t('connect.status.payment_required_desc')}
                confirmText={t('connect.status.add_card')}
                cancelText={t('connect.status.cancel_card')}
                variant="warning"
            />

            {/* Wireless Connection Card */}
            <Section
                title={t('connect.wireless.title')}
                icon={Wifi}
                description={t('connect.wireless.desc')}
            >

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 ml-1">{t('connect.labels.ip')}</label>
                            <button
                                onClick={() => {
                                    navigator.clipboard.readText().then(text => {
                                        // Try to parse host:port or tcp://host:port
                                        let clean = text.replace('tcp://', '');
                                        const parts = clean.split(':');
                                        if (parts.length >= 2) {
                                            setIp(parts[0]);
                                            setPort(parts[1]);
                                            setStatusMsg({ text: t('connect.status.pasted'), type: 'success' });
                                        } else {
                                            setStatusMsg({ text: t('connect.status.clipboard_invalid'), type: 'error' });
                                        }
                                    }).catch(() => setStatusMsg({ text: t('connect.status.clipboard_error'), type: 'error' }));
                                }}
                                className="text-[10px] text-primary hover:underline cursor-pointer"
                                title="Paste host:port or ngrok url"
                            >
                                {t('connect.actions.paste_url') || "Paste URL"}
                            </button>
                        </div>
                        <input
                            type="text"
                            placeholder="0.tcp.ngrok.io"
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
                    <div className="flex gap-3 w-full">
                        <SplitButton
                            variant="primary"
                            disabled={loading || !ip || !port}
                            primaryAction={{
                                label: t('connect.actions.connect'),
                                onClick: () => handleAction('connect'),
                                icon: loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Link size={16} />
                            }}
                            secondaryActions={[
                                {
                                    label: t('connect.actions.pair'),
                                    onClick: () => handleAction('pair'),
                                    icon: <Wifi size={14} />,
                                    disabled: loading || !ip || !port || !code
                                }
                            ]}
                            className=""
                        />

                        <SplitButton
                            variant="danger"
                            primaryAction={{
                                label: t('connect.actions.disconnect'),
                                onClick: () => handleAction('disconnect'),
                                icon: loading ? <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> : <Unplug size={16} />,
                                disabled: loading || !ip || !port
                            }}
                            secondaryActions={[
                                {
                                    label: t('connect.actions.disconnect_all'),
                                    onClick: () => handleAction('disconnect_all'),
                                    icon: <Unplug size={14} />
                                }
                            ]}
                            disabled={loading}
                            className="ml-auto"
                        />
                    </div>
                </div>

                {/* Status Message Area */}
                {statusMsg && (
                    <div className={clsx(
                        "mt-4 p-3 rounded-lg text-sm font-mono break-all whitespace-pre-wrap animate-in slide-in-from-top-2",
                        statusMsg.type === 'error' ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50" :
                            statusMsg.type === 'success' ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-900/50" :
                                "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50"
                    )}>
                        {statusMsg.text}
                    </div>
                )}
            </Section>

            {/* Ngrok Integration Card */}
            <Section
                title={t('connect.remote.title')}
                icon={Globe}
                description={t('connect.remote.desc')}
                variant="card"
                className={clsx(
                    "transition-opacity",
                    systemCheckStatus?.missingTunnelling?.length > 0 ? "opacity-50 pointer-events-none grayscale" : ""
                )}
                status={
                    systemCheckStatus?.missingTunnelling?.length > 0 && (
                        <span className="text-xs font-bold text-red-500 bg-red-100 dark:bg-red-900/20 px-2 py-1 rounded">
                            Ngrok Not Found
                        </span>
                    )
                }
            >

                {!ngrokUrl && !ngrokLoading ? (
                    <div className="space-y-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 ml-1">{t('connect.labels.config')}</label>
                            <div className="flex items-center gap-2 p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg">
                                <span className="text-sm text-zinc-500">{t('connect.labels.expose_port')}:</span>
                                <span className="font-mono text-sm font-bold text-zinc-800 dark:text-zinc-200">5555</span>
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
                                            onClick={() => { navigator.clipboard.writeText(ngrokUrl); setNgrokStatusMsg({ text: t('connect.actions.copy'), type: 'success' }); }}
                                            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-600"
                                            title="Copy URL"
                                        >
                                            <Copy size={16} />
                                        </button>
                                    </div>
                                    <span className="text-xs text-zinc-500">{t('connect.status.forwarding')}</span>
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

                {/* Ngrok Status Message Area */}
                {ngrokStatusMsg && (
                    <div className={clsx(
                        "mt-4 p-3 rounded-lg text-sm font-mono break-all whitespace-pre-wrap animate-in slide-in-from-top-2",
                        ngrokStatusMsg.type === 'error' ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50" :
                            ngrokStatusMsg.type === 'success' ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-900/50" :
                                "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50"
                    )}>
                        {ngrokStatusMsg.text}
                    </div>
                )}
            </Section>

        </div>
    );
}

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Wifi, Link, Unplug, Globe, Copy } from "lucide-react";
import clsx from "clsx";
import { useSettings } from "@/lib/settings";
import { useTranslation } from "react-i18next";
import { feedback } from "@/lib/feedback";
import { ConfirmationModal } from "@/components/organisms/ConfirmationModal";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SplitButton } from "@/components/molecules/SplitButton";
import { Section } from "@/components/organisms/Section";
import { Alert } from "@/components/atoms/Alert";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";

interface ConnectSubTabProps {
    onDeviceConnected: () => void;
    selectedDevice?: string; // Add this prop
}

export function ConnectSubTab({ onDeviceConnected, selectedDevice }: ConnectSubTabProps) {
    const { t } = useTranslation();
    const { settings, systemCheckStatus, checkSystemVersions, isNgrokEnabled, enableNgrok } = useSettings();
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
                setStatusMsg({ text: t('connect.status.auto_ip'), type: 'success' });
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

    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showSecurityModal, setShowSecurityModal] = useState(false);
    const [isLoadingSecurity, setIsLoadingSecurity] = useState(false);

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
            // Match :digits that might be at end or followed by on-primaryspace
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

            <ConfirmationModal
                isOpen={showSecurityModal}
                onClose={() => setShowSecurityModal(false)}
                onConfirm={async () => {
                    setIsLoadingSecurity(true);
                    try {
                        enableNgrok();
                        await checkSystemVersions(); // Trigger re-check to potentially find ngrok if it was skipped
                        setShowSecurityModal(false);
                    } finally {
                        setIsLoadingSecurity(false);
                    }
                }}
                isLoading={isLoadingSecurity}
                title={t('connect.security_warning.title')}
                description={t('connect.security_warning.message')}
                confirmText={t('connect.security_warning.confirm')}
                cancelText={t('connect.security_warning.cancel')}
                variant="warning"
            />

            {/* Wireless Connection Card */}
            <Section
                title={t('connect.wireless.title')}
                icon={Wifi}
                description={t('connect.wireless.desc')}
                status={statusMsg && (
                    <Alert variant={statusMsg.type === 'error' ? 'destructive' : statusMsg.type === 'success' ? 'success' : 'info'} className="animate-in slide-in-from-top-2 animate-out slide-out-to-bottom-2">
                        {statusMsg.text}
                    </Alert>
                )}
            >

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs font-medium text-on-surface-variant/80 ml-1">{t('connect.labels.ip')}</label>
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
                            className="w-full bg-surface border border-outline-variant/30 rounded-2xl px-3 py-2 text-on-surface/80 outline-none focus:ring-2 focus:ring-primary transition-all font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-on-surface-variant/80 mb-1 ml-1">{t('connect.labels.port')}</label>
                        <input
                            type="text"
                            placeholder="5555"
                            value={port}
                            onChange={e => setPort(e.target.value)}
                            className="w-full bg-surface border border-outline-variant/30 rounded-2xl px-3 py-2 text-on-surface/80 outline-none focus:ring-2 focus:ring-primary transition-all font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-on-surface-variant/80 mb-1 ml-1">{t('connect.labels.code')}</label>
                        <input
                            type="text"
                            placeholder="123456"
                            value={code}
                            onChange={e => setCode(e.target.value)}
                            className="w-full bg-surface border border-outline-variant/30 rounded-2xl px-3 py-2 text-on-surface/80 outline-none focus:ring-2 focus:ring-primary transition-all font-mono"
                        />
                    </div>
                </div>

                <div className="flex flex-wrap gap-3 mt-4">
                    <div className="flex gap-3 w-full">
                        <SplitButton
                            variant="primary"
                            disabled={loading || !ip || !port}
                            primaryAction={{
                                label: t('connect.actions.connect'),
                                onClick: () => handleAction('connect'),
                                icon: loading ? <ExpressiveLoading size="sm" variant="circular" /> : <Link size={16} />
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
                                icon: loading ? <ExpressiveLoading size="sm" variant="circular" /> : <Unplug size={16} />,
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

            </Section>

            {/* Ngrok Integration Card */}
            <div className="relative">
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
                            <span className="text-xs font-bold text-error bg-error-container px-2 py-1 rounded">
                                Ngrok Not Found
                            </span>
                        )
                    }
                    menus={ngrokStatusMsg && (
                        <Alert variant={ngrokStatusMsg.type === 'error' ? 'destructive' : ngrokStatusMsg.type === 'success' ? 'success' : 'info'} className="animate-in slide-in-from-top-2">
                            {ngrokStatusMsg.text}
                        </Alert>
                    )}
                >
                    {!isNgrokEnabled ? (
                        <div className="space-y-4 filter blur-sm select-none opacity-50 pointer-events-none" aria-hidden="true">
                            {/* Dummy Content to show underneath blurred overlay */}
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-medium text-on-surface-variant/80 ml-1">{t('connect.labels.config')}</label>
                                <div className="flex items-center gap-2 p-3 bg-surface border border-outline-variant/30 rounded-2xl">
                                    <span className="text-sm text-on-surface-variant/80">{t('connect.labels.expose_port')}:</span>
                                    <span className="font-mono text-sm font-bold text-on-surface/80">5555</span>
                                    <span className="text-outline-variant mx-2">|</span>
                                    <span className="text-sm text-on-surface-variant/80">{t('connect.labels.token')}:</span>
                                    <span className="font-mono text-sm text-on-surface/80">••••••••</span>
                                </div>
                            </div>
                            <button className="w-full py-2 bg-purple-600 text-on-primary rounded-2xl font-medium flex items-center justify-center gap-2">
                                <Link size={18} /> {t('connect.actions.start_tunnel')}
                            </button>
                        </div>
                    ) : (
                        !ngrokUrl && !ngrokLoading ? (
                            <div className="space-y-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-medium text-on-surface-variant/80 ml-1">{t('connect.labels.config')}</label>
                                    <div className="flex items-center gap-2 p-3 bg-surface border border-outline-variant/30 rounded-2xl">
                                        <span className="text-sm text-on-surface-variant/80">{t('connect.labels.expose_port')}:</span>
                                        <span className="font-mono text-sm font-bold text-on-surface/80">5555</span>
                                        <span className="text-outline-variant mx-2">|</span>
                                        <span className="text-sm text-on-surface-variant/80">{t('connect.labels.token')}:</span>
                                        <span className="font-mono text-sm text-on-surface/80">
                                            {settings.tools.ngrokToken ? '••••••••' : <span className="text-error text-xs">{t('connect.labels.missing_token')}</span>}
                                        </span>
                                    </div>
                                </div>

                                <button
                                    onClick={handleStartNgrok}
                                    disabled={!settings.tools.ngrokToken}
                                    className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-on-primary rounded-2xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Link size={18} /> {t('connect.actions.start_tunnel')}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {ngrokLoading ? (
                                    <div className="flex flex-col items-center justify-center p-8 space-y-3">
                                        <ExpressiveLoading size="md" variant="circular" className="text-purple-500" />
                                        <span className="text-sm text-on-surface-variant/80">{t('connect.status.starting_ngrok')}</span>
                                    </div>
                                ) : (
                                    <div className="space-y-4 animate-in fade-in">
                                        <div className="bg-success-container/10 border border-success-container/20 rounded-2xl p-4 flex flex-col items-center text-center space-y-2">
                                            <span className="text-xs font-bold text-on-success-container/10 uppercase tracking-wider">{t('connect.status.tunnel_active')}</span>
                                            <div className="flex items-center gap-2 bg-on-primary px-3 py-1.5 rounded-2xl border border-success-container/20">
                                                <span className="font-mono text-lg text-on-surface/50 select-all">{ngrokUrl}</span>
                                                <button
                                                    onClick={() => { navigator.clipboard.writeText(ngrokUrl); setNgrokStatusMsg({ text: t('connect.actions.copy'), type: 'success' }); }}
                                                    className="p-1 hover:bg-surface-variant/30 rounded text-on-surface/80 hover:text-on-surface-variant/80"
                                                    title="Copy URL"
                                                >
                                                    <Copy size={16} />
                                                </button>
                                            </div>
                                            <span className="text-xs text-on-surface-variant/80">{t('connect.status.forwarding')}</span>
                                        </div>

                                        <button
                                            onClick={handleStopNgrok}
                                            className="w-full py-2 bg-error-container hover:bg-error-container/20 text-error-container/80 rounded-2xl font-medium transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Unplug size={18} /> {t('connect.actions.stop_tunnel')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )
                    )}
                </Section>

                {/* Full-section Overlay for First-time Enable */}
                {!isNgrokEnabled && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-surface/60 backdrop-blur-[3px] rounded-2xl transition-all animate-in fade-in duration-300">
                        <button
                            onClick={() => setShowSecurityModal(true)}
                            className="bg-error-container/80 hover:bg-error-container/60 text-on-surface/80 px-6 py-3 rounded-2xl shadow-lg font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                            aria-describedby="enable-remote-description"
                        >
                            <Globe size={20} />
                            {t('connect.actions.enable_remote')}
                        </button>
                        <p
                            id="enable-remote-description"
                            className="mt-3 text-sm text-on-surface-variant/80 font-medium max-w-xs text-center"
                        >
                            {t('connect.remote.desc')}
                        </p>
                    </div>
                )}
            </div>

        </div >
    );
}

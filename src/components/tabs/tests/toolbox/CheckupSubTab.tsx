import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from '@/lib/settings';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { Button } from '@/components/atoms/Button';
import { Section } from '@/components/organisms/Section';
import { Upload, ShieldCheck, CheckCircle2, XCircle, Search, FileText, ListPlus, Info, Download, Filter, FilterX, Play } from 'lucide-react';
import { Input } from '@/components/atoms/Input';
import clsx from 'clsx';
import { ExpressiveLoading } from '@/components/atoms/ExpressiveLoading';
import { toast } from 'sonner';

interface CheckupSubTabProps {
    selectedDevice: string | null;
    isTestRunning: boolean;
    allowActionsDuringTest: boolean;
}

interface PropComparison {
    key: string;
    expected: string;
    found: string;
    isMatch: boolean;
    isExtra?: boolean;
}

interface PackageInfo {
    name: string;
    path: string;
    version: string;
    is_system: boolean;
    is_disabled: boolean;
}

export const CheckupSubTab = ({ selectedDevice, isTestRunning, allowActionsDuringTest }: CheckupSubTabProps) => {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const [isLoading, setIsLoading] = useState(false);
    const [comparisons, setComparisons] = useState<PropComparison[]>([]);
    const [devicePropsCache, setDevicePropsCache] = useState<Record<string, string>>({});
    const [filterDivergent, setFilterDivergent] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Standard checks based on POS Checklist
    const [checkResults, setCheckResults] = useState<Record<string, { status: 'idle' | 'running' | 'correct' | 'incorrect', found?: string }>>({});

    const [additionalCheckResults, setAdditionalCheckResults] = useState<Record<string, { status: 'idle' | 'running' | 'done', found?: string }>>({});

    const standardChecksBase = useMemo(() => [
        {
            id: 'verified_boot',
            name: t('toolbox.checkup.checks.verified_boot', 'Verified Boot (dm-verity)'),
            command: ['shell', 'getprop', 'ro.boot.verifiedbootstate'],
            expected: (out: string) => out.trim().toLowerCase() === 'green',
            foundDisplay: (out: string) => out.trim() || t('toolbox.checkup.unknown', 'Unknown')
        },
        // {
        //     id: 'adb_default',
        //     name: t('toolbox.checkup.checks.adb_default', 'Default ADB Disabled'),
        //     command: ['shell', 'getprop', 'persist.sys.usb.config'],
        //     expected: (out: string) => !out.includes('adb'),
        //     foundDisplay: (out: string) => out.trim() || t('toolbox.checkup.none', 'None')
        // },
        {
            id: 'debuggable',
            name: t('toolbox.checkup.checks.debuggable', 'Developer Mode (ro.debuggable)'),
            command: ['shell', 'getprop', 'ro.debuggable'],
            expected: (out: string) => out.trim() === '0',
            foundDisplay: (out: string) => out.trim() === '1' ? t('toolbox.checkup.active', '1 (Active)') : t('toolbox.checkup.inactive', '0 (Inactive)')
        },
        {
            id: 'secure_os',
            name: t('toolbox.checkup.checks.secure_os', 'Secure OS (ro.secure)'),
            command: ['shell', 'getprop', 'ro.secure'],
            expected: (out: string) => out.trim() === '1',
            foundDisplay: (out: string) => out.trim() === '1' ? t('toolbox.checkup.active', '1 (Active)') : t('toolbox.checkup.inactive', '0 (Inactive)')
        },
        {
            id: 'verity_mode',
            name: t('toolbox.checkup.checks.verity_mode', 'Verity Mode'),
            command: ['shell', 'getprop', 'ro.boot.veritymode'],
            expected: (out: string) => out.trim() === 'enforcing',
            foundDisplay: (out: string) => out.trim() || t('toolbox.checkup.unknown', 'Unknown')
        },
        {
            id: 'adb_secure',
            name: t('toolbox.checkup.checks.adb_secure', 'ADB Secure'),
            command: ['shell', 'getprop', 'ro.adb.secure'],
            expected: (out: string) => out.trim() === '1',
            foundDisplay: (out: string) => out.trim() === '1' ? t('toolbox.checkup.active', '1 (Active)') : t('toolbox.checkup.inactive', '0 (Inactive)')
        },
        {
            id: 'build_tags',
            name: t('toolbox.checkup.checks.build_tags', 'Image Signature (tags)'),
            command: ['shell', 'getprop', 'ro.build.tags'],
            expected: (out: string) => out.trim().toLowerCase() === 'release-keys',
            foundDisplay: (out: string) => out.trim() || t('toolbox.checkup.unknown', 'Unknown')
        },
        {
            id: 'selinux',
            name: t('toolbox.checkup.checks.selinux', 'SELinux Status'),
            command: ['shell', 'getenforce'],
            expected: (out: string) => out.trim().toLowerCase() === 'enforcing',
            foundDisplay: (out: string) => out.trim().toLowerCase() === 'enforcing' ? t('toolbox.checkup.enforcing', 'Enforcing') : t('toolbox.checkup.permissive', 'Permissive')
        },
        {
            id: 'crypto_state',
            name: t('toolbox.checkup.checks.crypto_state', 'Device Encryption'),
            command: ['shell', 'getprop', 'ro.crypto.state'],
            expected: (out: string) => out.trim().toLowerCase() === 'encrypted',
            foundDisplay: (out: string) => out.trim().toLowerCase() === 'encrypted' ? t('toolbox.checkup.encrypted', 'Encrypted') : (out.trim().toLowerCase() === 'unencrypted' ? t('toolbox.checkup.unencrypted', 'Unencrypted') : t('toolbox.checkup.unknown', 'Unknown'))
        },
        {
            id: 'root_access',
            name: t('toolbox.checkup.checks.root_access', 'Root Access (su binary)'),
            command: ['shell', '[ -e /system/bin/su ] || [ -e /system/xbin/su ] && echo "found" || echo "not_found"'],
            expected: (out: string) => out.trim() === 'not_found',
            foundDisplay: (out: string) => out.trim() === 'found' ? t('toolbox.checkup.found', 'Found') : t('toolbox.checkup.not_found', 'Not found')
        },
        {
            id: 'developer_options',
            name: t('toolbox.checkup.checks.developer_options', 'Developer Options'),
            command: ['shell', 'settings', 'get', 'global', 'development_settings_enabled'],
            expected: (out: string) => out.trim() === '0' || out.trim() === 'null',
            foundDisplay: (out: string) => out.trim() === '1' ? t('toolbox.checkup.active', '1 (Active)') : t('toolbox.checkup.inactive', '0 (Inactive)')
        },

        {
            id: 'non_market_apps',
            name: t('toolbox.checkup.checks.non_market_apps', 'Unknown Apps Installation'),
            command: ['shell', 'settings', 'get', 'global', 'install_non_market_apps'],
            expected: (out: string) => out.trim() === '0' || out.trim() === 'null', // sometimes it's null if never set
            foundDisplay: (out: string) => out.trim() === '1' ? t('toolbox.checkup.allowed', 'Allowed (1)') : t('toolbox.checkup.blocked', 'Blocked (0)')
        }
    ], [t]);

    const standardChecks = useMemo(() => {
        return standardChecksBase.map(base => ({
            ...base,
            status: checkResults[base.id]?.status || 'idle',
            found: checkResults[base.id]?.found
        }));
    }, [standardChecksBase, checkResults]);

    const additionalChecksBase = useMemo(() => [
        {
            id: 'imei',
            name: t('toolbox.checkup.additional.imei', 'IMEI (iphonesubinfo)'),
            command: ['shell', 'service', 'call', 'iphonesubinfo', '1'],
            foundDisplay: (out: string) => {
                const matches = out.match(/'([^']+)'/g);
                if (matches) {
                    const text = matches.map(m => m.slice(1, -1)).join('');
                    const imei = text.replace(/\D/g, '');
                    return imei || t('toolbox.checkup.not_found', 'Not found');
                }
                return t('toolbox.checkup.not_found', 'Not found');
            }
        },
        {
            id: 'bluetooth_address',
            name: t('toolbox.checkup.additional.bluetooth_address', 'Bluetooth Address'),
            command: ['shell', 'settings', 'get', 'secure', 'bluetooth_address'],
            foundDisplay: (out: string) => out.trim() || t('toolbox.checkup.not_found', 'Not found')
        },
        {
            id: 'memory',
            name: t('toolbox.checkup.additional.memory', 'Memory (/proc/meminfo)'),
            command: ['shell', 'cat', '/proc/meminfo'],
            foundDisplay: (out: string) => {
                const totalMatch = out.match(/MemTotal:\s+(\d+)\s+kB/);
                const availMatch = out.match(/MemAvailable:\s+(\d+)\s+kB/);
                if (totalMatch && availMatch) {
                    const totalMb = Math.round(parseInt(totalMatch[1]) / 1024);
                    const availMb = Math.round(parseInt(availMatch[1]) / 1024);
                    return `${availMb} MB / ${totalMb} MB`;
                }
                return out.trim() || t('toolbox.checkup.not_found', 'Not found');
            }
        },
        {
            id: 'storage',
            name: t('toolbox.checkup.additional.storage', 'Data Storage (/data)'),
            command: ['shell', 'df', '/data'],
            foundDisplay: (out: string) => {
                const lines = out.trim().split('\n');
                if (lines.length > 1) {
                    const parts = lines[1].trim().split(/\s+/);
                    if (parts.length >= 5) {
                        const totalGb = (parseInt(parts[1]) / 1024 / 1024).toFixed(1);
                        const usePct = parts[4];
                        return `${usePct} used of ${totalGb} GB`;
                    }
                }
                return out.trim() || t('toolbox.checkup.not_found', 'Not found');
            }
        },
        {
            id: 'network_mode',
            name: t('toolbox.checkup.additional.network_mode', 'Preferred Network Mode'),
            command: ['shell', 'settings', 'get', 'global', 'preferred_network_mode'],
            foundDisplay: (out: string) => out.trim() || t('toolbox.checkup.not_found', 'Not found')
        }
    ], [t]);

    const additionalChecks = useMemo(() => {
        return additionalChecksBase.map(base => ({
            ...base,
            status: additionalCheckResults[base.id]?.status || 'idle',
            found: additionalCheckResults[base.id]?.found
        }));
    }, [additionalChecksBase, additionalCheckResults]);

    const disabled = isTestRunning && !allowActionsDuringTest;

    const parsePropsFile = (content: string): Record<string, string> => {
        const props: Record<string, string> = {};
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex > -1) {
                const key = trimmed.substring(0, eqIndex).trim();
                const value = trimmed.substring(eqIndex + 1).trim();
                props[key] = value;
            }
        }
        return props;
    };

    const parseDeviceProps = (output: string): Record<string, string> => {
        const props: Record<string, string> = {};
        const regex = /\[(.*?)\]: \[(.*?)\]/g;
        let match;
        while ((match = regex.exec(output)) !== null) {
            props[match[1]] = match[2];
        }
        return props;
    };

    const handleImportFile = async () => {
        if (!selectedDevice) return;
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: 'Properties', extensions: ['prop', 'txt'] }]
            });

            if (selected && typeof selected === 'string') {
                setIsLoading(true);
                const content = await readTextFile(selected);
                const expectedProps = parsePropsFile(content);

                // Fetch device props
                const deviceOutput: string = await invoke('run_adb_command', {
                    device: selectedDevice,
                    args: ['shell', 'getprop']
                });

                const deviceProps = parseDeviceProps(deviceOutput);
                setDevicePropsCache(deviceProps);

                const newComparisons: PropComparison[] = Object.keys(expectedProps).map(key => {
                    const expected = expectedProps[key];
                    const found = deviceProps[key] || '';
                    return {
                        key,
                        expected,
                        found,
                        isMatch: expected === found
                    };
                });

                setComparisons(newComparisons);
            }
        } catch (error) {
            console.error('Failed to import and check props:', error);
            // TODO: show toast error
        } finally {
            setIsLoading(false);
        }
    };

    const COMMON_PROP_PREFIXES = [
        'gsm.version.',
        'persist.sys.device_provisioned',
        'persist.sys.fuse',
        'persist.sys.usb.config',
        'persist.vendor.connsys.',
        'ro.board.',
        'ro.boot.hardware',
        'ro.boot.serialno',
        'ro.boot.vbmeta.',
        'ro.boot.verifiedbootstate',
        'ro.boot.veritymode',
        'ro.bootloader',
        'ro.build.',
        'ro.config.low_ram',
        'ro.crypto.',
        'ro.debuggable',
        'ro.hardware.',
        'ro.odm.',
        'ro.product.',
        'ro.secure',
        'ro.revision',
        'ro.serialno',
        'ro.system.',
        'ro.telephony.',
        'ro.vendor.mediatek.',
        'ro.vendor.wifi.',
        'ro.zygote',
        'sys.usb.config'
    ];

    const handleLoadRemainingProps = async () => {
        if (!selectedDevice) return;
        setIsLoading(true);
        try {
            let currentDeviceProps = devicePropsCache;
            if (!currentDeviceProps || Object.keys(currentDeviceProps).length === 0) {
                const deviceOutput: string = await invoke('run_adb_command', {
                    device: selectedDevice,
                    args: ['shell', 'getprop']
                });
                currentDeviceProps = parseDeviceProps(deviceOutput);
                setDevicePropsCache(currentDeviceProps);
            }

            const existingKeys = new Set(comparisons.map(c => c.key));
            const newComparisons: PropComparison[] = [];

            for (const [key, value] of Object.entries(currentDeviceProps)) {
                if (!existingKeys.has(key)) {
                    if (COMMON_PROP_PREFIXES.some(prefix => key.startsWith(prefix))) {
                        if (value.trim() !== '') {
                            newComparisons.push({
                                key,
                                expected: t('toolbox.checkup.not_found', 'Not found'),
                                found: value,
                                isMatch: false,
                                isExtra: true
                            });
                        }
                    }
                }
            }

            if (newComparisons.length > 0) {
                setComparisons(prev => [...prev, ...newComparisons]);
            }
        } catch (error) {
            console.error('Failed to load remaining props', error);
        } finally {
            setIsLoading(false);
        }
    };

    const runStandardChecks = async () => {
        if (!selectedDevice) return;

        // Reset status to running
        const initResults: Record<string, any> = {};
        standardChecksBase.forEach(c => initResults[c.id] = { status: 'running' });
        setCheckResults(initResults);

        // Run checks sequentially to avoid overloading the adb daemon, or Promise.all for speed.
        // Promise.all is fine for a few commands.
        const newResults: Record<string, any> = { ...initResults };
        await Promise.all(standardChecksBase.map(async (check) => {
            try {
                const output: string = await invoke('run_adb_command', {
                    device: selectedDevice,
                    args: check.command
                });

                const isMatch = check.expected(output);
                newResults[check.id] = {
                    status: isMatch ? 'correct' : 'incorrect',
                    found: check.foundDisplay(output)
                };
            } catch (error) {
                newResults[check.id] = {
                    status: 'incorrect',
                    found: t('toolbox.checkup.error_exec', 'Execution error')
                };
            }
        }));

        setCheckResults(newResults);
    };

    const runAdditionalChecks = async () => {
        if (!selectedDevice) return;

        const initResults: Record<string, any> = {};
        additionalChecksBase.forEach(c => initResults[c.id] = { status: 'running' });
        setAdditionalCheckResults(initResults);

        const newResults: Record<string, any> = { ...initResults };
        await Promise.all(additionalChecksBase.map(async (check) => {
            try {
                const output: string = await invoke('run_adb_command', {
                    device: selectedDevice,
                    args: check.command
                });

                newResults[check.id] = {
                    status: 'done',
                    found: check.foundDisplay(output)
                };
            } catch (error) {
                newResults[check.id] = {
                    status: 'done',
                    found: t('toolbox.checkup.error_exec', 'Execution error')
                };
            }
        }));

        setAdditionalCheckResults(newResults);
    };

    const generateReport = async () => {
        if (!selectedDevice) return;

        let toastId = toast.loading(t('toolbox.checkup.generating_report', 'Generating report...'));
        try {
            const pkgs = await invoke<PackageInfo[]>("get_installed_packages", { device: selectedDevice });
            const filteredPkgs = pkgs.filter(p => !p.name.startsWith('android') && !p.name.startsWith('com.android') && !p.name.startsWith('com.google'));

            let html = `<!DOCTYPE html>
<html lang="${t('language', 'en')}">
<head>
    <meta charset="UTF-8">
    <title>${t('toolbox.checkup.report_title', 'Device Checkup Report')} - ${selectedDevice}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 2rem; max-width: 1200px; margin: 0 auto; color: #333; }
        h1, h2 { color: #111; }
        .section { margin-bottom: 2rem; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
        .section-header { background: #f8f9fa; padding: 1rem; border-bottom: 1px solid #ddd; font-weight: bold; font-size: 1.1rem; }
        table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #fdfdfd; font-weight: 600; color: #555; }
        .success { color: #16a34a; font-weight: 500; }
        .error { color: #dc2626; font-weight: 500; }
        .warning { color: #d97706; font-weight: 500; }
        .info { color: #2563eb; font-weight: 500; }
        code { background: #f1f5f9; padding: 0.2rem 0.4rem; border-radius: 4px; font-family: monospace; font-size: 0.85em; }
    </style>
</head>
<body>
    ${settings.customLogoLight ? `<img src="${settings.customLogoLight}" alt="Logo" style="max-height: 48px; margin-bottom: 1rem;" />` : ''}
    <h1>${t('toolbox.checkup.report_title', 'Device Checkup Report')}</h1>
    <p><strong>Device UDID:</strong> <code>${selectedDevice}</code><br><strong>Date:</strong> ${new Date().toLocaleString()}</p>
`;

            if (comparisons.length > 0) {
                html += `
                <div class="section">
                    <div class="section-header">${t('toolbox.checkup.prop_compare', '.prop Compare')}</div>
                    <table>
                        <thead>
                            <tr>
                                <th>Key</th>
                                <th>${t('toolbox.checkup.expected', 'Expected')}</th>
                                <th>${t('toolbox.checkup.found', 'Found')}</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                comparisons.filter(c => !c.isExtra).forEach(c => {
                    html += `
                            <tr>
                                <td><code>${c.key}</code></td>
                                <td><code>${c.expected}</code></td>
                                <td><code class="${c.isMatch ? 'success' : 'error'}">${c.found || '-'}</code></td>
                                <td class="${c.isMatch ? 'success' : 'error'}">${c.isMatch ? t('toolbox.checkup.match', 'Match') : t('toolbox.checkup.mismatch', 'Mismatch')}</td>
                            </tr>
                    `;
                });
                html += `</tbody></table></div>`;

                const extraProps = comparisons.filter(c => c.isExtra);
                if (extraProps.length > 0) {
                    html += `
                    <div class="section">
                        <div class="section-header">${t('toolbox.checkup.additional_checks', 'Extra Base Props')}</div>
                        <table>
                            <thead>
                                <tr>
                                    <th>Key</th>
                                    <th>${t('toolbox.checkup.found', 'Found')}</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;
                    extraProps.forEach(c => {
                        html += `
                                <tr>
                                    <td><code>${c.key}</code></td>
                                    <td><code class="warning">${c.found}</code></td>
                                </tr>
                        `;
                    });
                    html += `</tbody></table></div>`;
                }
            }

            html += `
            <div class="section">
                <div class="section-header">${t('toolbox.checkup.standard_checks', 'Standard Checks')}</div>
                <table>
                    <thead>
                        <tr>
                            <th>Check</th>
                            <th>${t('toolbox.checkup.found', 'Found')}</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            standardChecks.forEach(c => {
                let statusText = '-';
                let statusClass = '';
                if (c.status === 'correct') { statusText = t('toolbox.checkup.status_correct', 'Correct'); statusClass = 'success'; }
                else if (c.status === 'incorrect') { statusText = t('toolbox.checkup.status_incorrect', 'Incorrect'); statusClass = 'error'; }

                html += `
                        <tr>
                            <td><strong>${c.name}</strong><br><code>${c.command.join(' ')}</code></td>
                            <td><code class="${statusClass}">${c.found || '-'}</code></td>
                            <td class="${statusClass}">${statusText}</td>
                        </tr>
                `;
            });
            html += `</tbody></table></div>`;

            html += `
            <div class="section">
                <div class="section-header">${t('toolbox.checkup.additional_checks', 'Additional Checks')}</div>
                <table>
                    <thead>
                        <tr>
                            <th>Check</th>
                            <th>${t('toolbox.checkup.found', 'Found')}</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            additionalChecks.forEach(c => {
                html += `
                        <tr>
                            <td><strong>${c.name}</strong><br><code>${c.command.join(' ')}</code></td>
                            <td><code class="info">${c.found || '-'}</code></td>
                        </tr>
                `;
            });
            html += `</tbody></table></div>`;

            html += `
            <div class="section">
                <div class="section-header">${t('toolbox.checkup.installed_packages', 'Installed Packages')}</div>
                <table>
                    <thead>
                        <tr>
                            <th>${t('toolbox.checkup.package_name', 'Package')}</th>
                            <th>${t('toolbox.checkup.version', 'Version')}</th>
                            <th>Type</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            filteredPkgs.forEach(p => {
                html += `
                        <tr>
                            <td><code>${p.name}</code></td>
                            <td><code>${p.version || '-'}</code></td>
                            <td><span class="${p.is_system ? 'warning' : 'info'}">${p.is_system ? 'System' : 'User'}</span></td>
                        </tr>
                `;
            });
            html += `</tbody></table></div>`;
            html += `</body></html>`;

            const filePath = await save({
                filters: [{ name: 'HTML Report', extensions: ['html'] }],
                defaultPath: `report_${selectedDevice.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.html`
            });

            if (filePath) {
                await writeTextFile(filePath, html);
                toast.success(t('toolbox.checkup.report_saved', 'Report saved successfully!'), { id: toastId });
            } else {
                toast.dismiss(toastId);
            }
        } catch (error) {
            console.error('Failed to generate report', error);
            toast.error(t('toolbox.checkup.report_error', 'Failed to generate report'), { id: toastId });
        }
    };

    const filteredComparisons = comparisons.filter(c => {
        if (filterDivergent && c.isMatch) return false;
        if (searchQuery && !c.key.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    const matchCount = comparisons.filter(c => c.isMatch).length;

    if (!selectedDevice) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-on-surface-variant/60 p-4 text-center">
                <ShieldCheck size={48} className="mb-4 opacity-50" />
                <p>{t('toolbox.checkup.select_device', 'Select a device for the checkup')}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden bg-surface p-4 gap-4">

            <div className="flex-1 min-h-0 flex flex-wrap gap-6 overflow-y-auto pb-2">

                {/* Props Comparison Panel */}
                <Section
                    title=".prop Compare"
                    icon={FileText}
                    className="flex-[2] min-w-[350px] flex flex-col min-h-[400px] xl:min-h-0 overflow-hidden"
                    contentClassName="flex-1 overflow-y-auto pr-2 min-h-0"
                    actions={
                        <div className="flex flex-wrap items-center gap-2">
                            {selectedDevice && (
                                <Button
                                    variant="outline"
                                    tooltipPosition="left"
                                    onClick={handleLoadRemainingProps}
                                    disabled={disabled || isLoading}
                                    className="relative h-9 w-9 p-0 flex items-center justify-center shrink-0 rounded-md"
                                    title={t('toolbox.checkup.load_remaining', 'Load remaining base props')}
                                >
                                    <ListPlus size={16} />
                                </Button>
                            )}
                            <Button
                                variant="primary"
                                onClick={handleImportFile}
                                disabled={disabled || isLoading}
                                className="flex items-center gap-2 h-9 px-3"
                                title={t('toolbox.checkup.upload_prop', 'Import')}
                            >
                                <Upload size={16} />
                                <span className="hidden sm:inline">{t('toolbox.checkup.upload_prop', 'Import')}</span>
                            </Button>
                        </div>
                    }
                >
                    <div className="flex items-center justify-end gap-2 mb-4">
                        {comparisons.length > 0 && (
                            <span className="text-xs px-2 h-9 flex items-center justify-center bg-primary/10 text-primary rounded-full font-medium whitespace-nowrap">
                                {matchCount} / {comparisons.length} {t('toolbox.checkup.matches', 'matches')}
                            </span>
                        )}
                        <Button
                            variant={filterDivergent ? "primary" : "ghost"}
                            size="sm"
                            tooltipPosition="left"
                            onClick={() => setFilterDivergent(!filterDivergent)}
                            className={clsx("relative h-9 w-9 p-0 flex items-center justify-center shrink-0 rounded-md", filterDivergent && "bg-error/10 text-error hover:bg-error/20 hover:text-error")}
                            title={filterDivergent ? t('toolbox.checkup.show_all', 'Show all') : t('toolbox.checkup.show_divergent', 'Show only divergences')}
                        >
                            {filterDivergent ? <FilterX size={16} /> : <Filter size={16} />}
                        </Button>
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('toolbox.checkup.search_placeholder', 'Search key...')}
                                className="pl-9 h-9 text-sm w-36 sm:w-48"
                            />
                        </div>
                        {selectedDevice && (
                            <Button
                                variant="outline"
                                tooltipPosition="left"
                                onClick={generateReport}
                                disabled={disabled || isLoading}
                                className="relative h-9 w-9 p-0 flex items-center justify-center shrink-0 rounded-md"
                                title={t('toolbox.checkup.generate_report', 'Generate Report')}
                            >
                                <Download size={16} />
                            </Button>
                        )}
                    </div>
                    <div className="flex-1 h-full min-h-0 bg-surface-variant/10 rounded-xl border border-outline-variant/30 overflow-hidden">
                        <div className="h-full overflow-y-auto overflow-x-auto custom-scrollbar">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-full text-on-surface-variant/60 gap-3 min-h-[200px]">
                                    <ExpressiveLoading variant="circular" size="md" />
                                    <span>{t('toolbox.checkup.fetching', 'Fetching properties...')}</span>
                                </div>
                            ) : comparisons.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-on-surface-variant/40 p-8 text-center min-h-[200px]">
                                    <Upload size={40} className="mb-3 opacity-50" />
                                    <p className="text-sm max-w-[250px]">{t('toolbox.checkup.upload_prop_desc', 'Import a .prop file to compare.')}</p>
                                </div>
                            ) : (
                                <table className="w-full min-w-[400px] text-left border-collapse text-sm table-fixed">
                                    <thead className="bg-surface-variant/30 backdrop-blur-md sticky top-0 shadow-sm z-10 text-on-surface-variant">
                                        <tr>
                                            <th className="p-3 font-medium border-b border-outline-variant/30 w-4/12 md:w-5/12">Key</th>
                                            <th className="p-3 font-medium border-b border-outline-variant/30 w-3/12">{t('toolbox.checkup.expected', 'Expected')}</th>
                                            <th className="p-3 font-medium border-b border-outline-variant/30 w-3/12">{t('toolbox.checkup.found', 'Found')}</th>
                                            <th className="p-3 font-medium border-b border-outline-variant/30 w-2/12 md:w-1/12 text-center min-w-[60px]">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredComparisons.map(c => (
                                            <tr key={c.key} className="border-b border-outline-variant/10 hover:bg-surface-variant/20 transition-colors">
                                                <td className="p-3 font-mono text-[11px] text-on-surface break-words leading-relaxed">{c.key}</td>
                                                <td className="p-3 font-mono text-[11px] text-on-surface-variant break-words leading-relaxed">{c.expected}</td>
                                                <td className={clsx(
                                                    "p-3 font-mono text-[11px] break-words leading-relaxed",
                                                    c.isMatch ? "text-success" : (c.isExtra ? "text-warning" : "text-error font-semibold")
                                                )}>
                                                    {c.found || <span className="italic opacity-50">{t('toolbox.checkup.not_found', 'Not found')}</span>}
                                                </td>
                                                <td className="p-3 text-center align-middle">
                                                    {c.isMatch
                                                        ? <CheckCircle2 size={16} className="text-success mx-auto drop-shadow-sm" />
                                                        : (c.isExtra
                                                            ? <Info size={16} className="text-warning mx-auto drop-shadow-sm" />
                                                            : <XCircle size={16} className="text-error mx-auto drop-shadow-sm" />
                                                        )
                                                    }
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredComparisons.length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="p-8 text-center text-on-surface-variant/50 italic">
                                                    {t('toolbox.checkup.no_results', 'No results found.')}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </Section>

                {/* Standard Checks Panel */}
                <Section
                    title={t('toolbox.checkup.standard_checks', 'Standard Checklist')}
                    icon={ShieldCheck}
                    className="flex-1 min-w-[280px] flex flex-col min-h-[400px] xl:min-h-0 overflow-hidden"
                    contentClassName="flex-1 overflow-y-auto pr-2 space-y-3 min-h-0"
                    actions={
                        <Button
                            variant="secondary"
                            tooltipPosition="left"
                            title={t('toolbox.checkup.run_checks', 'Run Checks')}
                            onClick={runStandardChecks}
                            disabled={disabled || standardChecks.some(c => c.status === 'running')}
                            className="relative h-9 w-9 p-0 flex items-center justify-center shrink-0 rounded-md"
                        >
                            <Play size={16} className={clsx(standardChecks.some(c => c.status === 'running') && "animate-spin")} />
                        </Button>
                    }
                >
                    {standardChecks.map(check => (
                        <div key={check.id} className="flex flex-col p-4 rounded-xl border border-outline-variant/30 bg-surface-variant/10 backdrop-blur-md hover:bg-surface-variant/20 transition-all shadow-sm text-sm">
                            <div className="flex justify-between items-center mb-1 gap-2">
                                <span className="font-medium text-on-surface leading-tight drop-shadow-sm">{check.name}</span>
                                {check.status === 'running' && <ExpressiveLoading variant="circular" size="sm" />}
                                {check.status === 'correct' && <CheckCircle2 size={18} className="text-success shrink-0 drop-shadow-sm" />}
                                {check.status === 'incorrect' && <XCircle size={18} className="text-error shrink-0 drop-shadow-sm" />}
                            </div>
                            {check.found && (
                                <div className="flex justify-between items-center text-xs mt-3 pt-2 border-t border-outline-variant/20">
                                    <span className="text-on-surface-variant/80 font-medium">{t('toolbox.checkup.found', 'Found')}:</span>
                                    <span className={clsx(
                                        "font-mono px-2 py-1 rounded-md shadow-inner",
                                        check.status === 'correct' ? "bg-success/15 text-success" : "bg-error/15 text-error"
                                    )}>
                                        {check.found}
                                    </span>
                                </div>
                            )}
                        </div>
                    ))}
                </Section>

                {/* Additional Checks */}
                <Section
                    title={t('toolbox.checkup.additional_checks', 'Additional Checks')}
                    icon={ListPlus}
                    className="flex-1 min-w-[280px] flex flex-col min-h-[400px] xl:min-h-0 overflow-hidden"
                    contentClassName="flex-1 overflow-y-auto pr-2 space-y-3 min-h-0"
                    actions={
                        <Button
                            variant="secondary"
                            tooltipPosition="left"
                            title={t('toolbox.checkup.run_additional_checks', 'Run Additional Checks')}
                            onClick={runAdditionalChecks}
                            disabled={disabled || additionalChecks.some(c => c.status === 'running')}
                            className="relative h-9 w-9 p-0 flex items-center justify-center shrink-0 rounded-md"
                        >
                            <Play size={16} className={clsx(additionalChecks.some(c => c.status === 'running') && "animate-spin")} />
                        </Button>
                    }
                >
                    {additionalChecks.map(check => (
                        <div key={check.id} className="flex flex-col p-4 rounded-xl border border-outline-variant/30 bg-surface-variant/10 backdrop-blur-md hover:bg-surface-variant/20 transition-all shadow-sm text-sm">
                            <div className="flex justify-between items-center mb-1 gap-2">
                                <span className="font-medium text-on-surface leading-tight drop-shadow-sm">{check.name}</span>
                                {check.status === 'running' && <ExpressiveLoading variant="circular" size="sm" />}
                                {check.status === 'done' && <Info size={18} className="text-primary shrink-0 drop-shadow-sm" />}
                            </div>
                            {check.found && (
                                <div className="flex justify-between items-center text-xs mt-3 pt-2 border-t border-outline-variant/20">
                                    <span className="text-on-surface-variant/80 font-medium">{t('toolbox.checkup.found', 'Found')}:</span>
                                    <span className="font-mono px-2 py-1 rounded-md shadow-inner bg-primary/15 text-primary break-all max-w-[70%] text-right">
                                        {check.found}
                                    </span>
                                </div>
                            )}
                        </div>
                    ))}
                </Section>

            </div>
        </div>
    );
}

import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from '@/lib/settings';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { tempDir, join } from '@tauri-apps/api/path';
import { Button } from '@/components/atoms/Button';
import { Upload, ShieldCheck, CheckCircle2, XCircle, Search, FileText, ListPlus, Info, Download, Filter, FilterX, Play } from 'lucide-react';
import { Section } from '@/components/organisms/Section';
import { Modal } from '@/components/organisms/Modal';
import { ActionCard } from '@/components/atoms/ActionCard';
import { TagInput } from '@/components/atoms/TagInput';
import { Input } from '@/components/atoms/Input';
import { Textarea } from '@/components/atoms/Textarea';
import { SplitButton } from '@/components/molecules/SplitButton';
import { askAgent } from '@/lib/ai/agentService';
import { motion } from 'framer-motion';
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

    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [isAiVerifyModalOpen, setIsAiVerifyModalOpen] = useState(false);
    const [aiRequirementsPrompt, setAiRequirementsPrompt] = useState("");
    const [isAiVerifying, setIsAiVerifying] = useState(false);
    const [reportPropsCompare, setReportPropsCompare] = useState<'all' | 'divergent' | 'none'>(() => {
        return (localStorage.getItem('checkup_reportPropsCompare') as any) || 'all';
    });
    const [reportShowPropsBase, setReportShowPropsBase] = useState(() => {
        return localStorage.getItem('checkup_reportShowPropsBase') !== 'false';
    });
    const [reportShowStandardChecks, setReportShowStandardChecks] = useState(() => {
        return localStorage.getItem('checkup_reportShowStandardChecks') !== 'false';
    });
    const [reportShowAdditionalChecks, setReportShowAdditionalChecks] = useState(() => {
        return localStorage.getItem('checkup_reportShowAdditionalChecks') !== 'false';
    });
    const [reportShowPackages, setReportShowPackages] = useState(() => {
        return localStorage.getItem('checkup_reportShowPackages') !== 'false';
    });
    const [packageFilterMode, setPackageFilterMode] = useState<'exclude' | 'include'>(() => {
        return (localStorage.getItem('checkup_packageFilterMode') as any) || 'exclude';
    });
    const [packageFilterPrefixes, setPackageFilterPrefixes] = useState<string[]>(() => {
        const stored = localStorage.getItem('checkup_packageFilterPrefixes');
        return stored ? JSON.parse(stored) : ['android', 'com.android', 'com.google'];
    });
    const [propsFilterMode, setPropsFilterMode] = useState<'exclude' | 'include'>(() => {
        return (localStorage.getItem('checkup_propsFilterMode') as any) || 'exclude';
    });
    const [propsFilterPrefixes, setPropsFilterPrefixes] = useState<string[]>(() => {
        const stored = localStorage.getItem('checkup_propsFilterPrefixes');
        return stored ? JSON.parse(stored) : ['ro.soc.model'];
    });

    useEffect(() => {
        localStorage.setItem('checkup_reportPropsCompare', reportPropsCompare);
        localStorage.setItem('checkup_reportShowPropsBase', String(reportShowPropsBase));
        localStorage.setItem('checkup_reportShowStandardChecks', String(reportShowStandardChecks));
        localStorage.setItem('checkup_reportShowAdditionalChecks', String(reportShowAdditionalChecks));
        localStorage.setItem('checkup_reportShowPackages', String(reportShowPackages));
        localStorage.setItem('checkup_packageFilterMode', packageFilterMode);
        localStorage.setItem('checkup_packageFilterPrefixes', JSON.stringify(packageFilterPrefixes));
        localStorage.setItem('checkup_propsFilterMode', propsFilterMode);
        localStorage.setItem('checkup_propsFilterPrefixes', JSON.stringify(propsFilterPrefixes));
    }, [
        reportPropsCompare, reportShowPropsBase, reportShowStandardChecks,
        reportShowAdditionalChecks, reportShowPackages, packageFilterMode, packageFilterPrefixes,
        propsFilterMode, propsFilterPrefixes
    ]);

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
            name: t('toolbox.checkup.additional.imei', 'IMEI'),
            command: ['shell', 'service call iphonesubinfo 1; service call iphonesubinfo 3; service call iphonesubinfo 4; getprop ro.ril.oem.imei; getprop ro.ril.oem.imei1; getprop persist.radio.imei; getprop ro.serialno'],
            foundDisplay: (out: string) => {
                // 1. Try to find a plain 14-17 digit number (from getprops)
                const regex = /(?:^|[^\d])(\d{14,17})(?:[^\d]|$)/g;
                let match;
                while ((match = regex.exec(out)) !== null) {
                    const candidate = match[1];
                    if (!candidate.startsWith('000000')) {
                        return candidate;
                    }
                }

                // 2. Parse parcels individually if they exist
                // Split the output by "Result: Parcel" so we handle each command's output separately
                const chunks = out.split('Parcel');
                for (const chunk of chunks) {
                    const matches = chunk.match(/'([^']+)'/g);
                    if (matches) {
                        const text = matches.map(m => m.slice(1, -1)).join('');
                        const imei = text.replace(/\D/g, '');
                        if (imei.length >= 14 && imei.length <= 17 && !imei.startsWith('000000')) {
                            return imei;
                        }
                    }
                }

                // 3. Fallback: if somehow it's just a long string of numbers (original behavior fallback)
                const matchesAll = out.match(/'([^']+)'/g);
                if (matchesAll) {
                    const text = matchesAll.map(m => m.slice(1, -1)).join('');
                    const imei = text.replace(/\D/g, '');
                    if (imei.length >= 14 && imei.length <= 17 && !imei.startsWith('000000')) {
                        return imei;
                    } else if (imei.length > 17 && !imei.startsWith('000000')) {
                        // Return the first 15 digits just in case it concatenated multiple same IMEIs
                        return imei.substring(0, 15);
                    }
                }

                // 4. Fallback for Android 10+ devices (like Octa400) where IMEI is blocked for Shell UID
                if (out.includes('fffffff') || out.includes('Permission Denial') || out.includes('SecurityException')) {
                    return t('toolbox.checkup.additional.imei_blocked', 'Blocked by OS (Shell Restriction)');
                }

                // If not found and not explicitly blocked by a known error, just return not found
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
            id: 'wifi_mac_address',
            name: t('toolbox.checkup.additional.wifi_mac_address', 'Wi-Fi MAC Address'),
            command: ['shell', 'ip', 'addr', 'show', 'wlan0'],
            foundDisplay: (out: string) => {
                const match = out.match(/link\/ether\s+([0-9a-fA-F:]+)/);
                return match ? match[1] : t('toolbox.checkup.not_found', 'Not found');
            }
        },
        {
            id: 'wifi_ip_address',
            name: t('toolbox.checkup.additional.wifi_ip_address', 'Wi-Fi IP Address'),
            command: ['shell', 'ip', 'addr', 'show', 'wlan0'],
            foundDisplay: (out: string) => {
                const match = out.match(/inet\s+([0-9.]+)/);
                return match ? match[1] : t('toolbox.checkup.not_found', 'Not found');
            }
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

    const handleImportFile = async (append = false) => {
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

                let currentDeviceProps = devicePropsCache;
                if (!currentDeviceProps || Object.keys(currentDeviceProps).length === 0) {
                    const deviceOutput: string = await invoke('run_adb_command', {
                        device: selectedDevice,
                        args: ['shell', 'getprop']
                    });
                    currentDeviceProps = parseDeviceProps(deviceOutput);
                    setDevicePropsCache(currentDeviceProps);
                }

                const newComparisons: PropComparison[] = Object.keys(expectedProps).map(key => {
                    const expected = expectedProps[key];
                    const found = currentDeviceProps[key] || '';
                    return {
                        key,
                        expected,
                        found,
                        isMatch: expected === found
                    };
                });

                if (append) {
                    setComparisons(prev => {
                        const merged = [...prev];
                        for (const nc of newComparisons) {
                            const existingIdx = merged.findIndex(c => c.key === nc.key);
                            if (existingIdx >= 0) {
                                merged[existingIdx] = nc;
                            } else {
                                merged.push(nc);
                            }
                        }
                        return merged;
                    });
                } else {
                    setComparisons(newComparisons);
                }
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
        'ro.soc.model',
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

    const buildHtmlReport = async (): Promise<string | null> => {
        if (!selectedDevice) return null;
        try {
            let filteredPkgs: PackageInfo[] = [];
            if (reportShowPackages) {
                const pkgs = await invoke<PackageInfo[]>("get_installed_packages", { device: selectedDevice });
                filteredPkgs = pkgs.filter(p => {
                    const matchesPrefix = packageFilterPrefixes.some(prefix => p.name.startsWith(prefix));
                    if (packageFilterMode === 'include') return matchesPrefix;
                    return !matchesPrefix; // 'exclude'
                });
            }

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
        table { width: 100%; border-collapse: collapse; font-size: 0.9rem; table-layout: fixed; }
        th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #eee; word-wrap: break-word; overflow-wrap: break-word; }
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

            if (standardChecks.length > 0 && reportShowStandardChecks) {
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
            }

            if (comparisons.length > 0 && reportPropsCompare !== 'none') {
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
                const propsToRender = reportPropsCompare === 'divergent'
                    ? comparisons.filter(c => !c.isExtra && !c.isMatch)
                    : comparisons.filter(c => !c.isExtra);

                propsToRender.forEach(c => {
                    html += `
                            <tr>
                                <td><code>${c.key}</code></td>
                                <td><code>${c.expected}</code></td>
                                <td><code class="${c.isMatch ? 'success' : 'error'}">${c.found || '-'}</code></td>
                                <td class="${c.isMatch ? 'success' : 'error'}">${c.isMatch ? t('toolbox.checkup.status_correct', 'Correct') : t('toolbox.checkup.status_incorrect', 'Incorrect')}</td>
                            </tr>
                    `;
                });
                html += `</tbody></table></div>`;
            }

            if (reportShowPackages) {
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
            }

            if (additionalChecks.length > 0 && reportShowAdditionalChecks) {
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
            }

            if (comparisons.length > 0) {
                let extraProps = comparisons.filter(c => c.isExtra);

                if (propsFilterPrefixes.length > 0) {
                    extraProps = extraProps.filter(c => {
                        const matchesPrefix = propsFilterPrefixes.some(prefix => c.key.startsWith(prefix));
                        if (propsFilterMode === 'include') return matchesPrefix;
                        return !matchesPrefix;
                    });
                }

                if (extraProps.length > 0 && reportShowPropsBase) {
                    html += `
                    <div class="section">
                        <div class="section-header">${t('toolbox.checkup.extra_props', 'Extra Base Props')}</div>
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

            html += `</body></html>`;
            return html;
        } catch (error) {
            console.error('Failed to build HTML report', error);
            return null;
        }
    };

    const generateReport = async () => {
        if (!selectedDevice) return;
        setIsReportModalOpen(false);

        let toastId = toast.loading(t('toolbox.checkup.generating_report', 'Generating report...'));
        try {
            const html = await buildHtmlReport();
            if (!html) throw new Error("Failed to build HTML");

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

    const verifyReportWithAI = async () => {
        if (!selectedDevice || !aiRequirementsPrompt.trim()) return;
        setIsAiVerifyModalOpen(false);
        setIsReportModalOpen(false);

        let toastId = toast.loading(t('toolbox.checkup.report.ai_verifying', 'AI is verifying the report...'));
        setIsAiVerifying(true);
        try {
            const html = await buildHtmlReport();
            if (!html) throw new Error("Failed to build base HTML for AI");

            const aiSystemInstruction = `You are an expert QA and automation specialist.
The user will provide you with a set of requirements (which could be release notes, expected behaviors, or key-value constraints) and an HTML report of a device checkup.
Your task is to:
1. Analyze the requirements.
2. Compare them against the data provided in the HTML report.
3. Determine if the device's state meets the new requirements.
4. Modify the HTML report directly to reflect your analysis. You may add new columns (e.g., "AI Verdict", "Expected (Updated)"), change the row colors/classes (e.g., from error to success or vice-versa), and update the Status text.
5. EXTREMELY IMPORTANT: Because the HTML is very large, you MUST NOT return the entire HTML string, or it will be truncated by output limits. Instead, you must return a JSON object containing a list of EXACT string replacements to apply to the HTML.

The structure must be EXACTLY this JSON:
{
  "replacements": [
    {
      "search": "exact string snippet from the original HTML to replace",
      "replace": "the new string snippet with your modifications"
    }
  ]
}

Make sure the "search" string EXACTLY matches the original HTML (including any tabs or newlines if you copy them) so the string replacement works. Do NOT include markdown code blocks or any text outside the JSON. Return ONLY the JSON object.`;

            let aiPrompt = `USER REQUIREMENTS:
${aiRequirementsPrompt}

CURRENT HTML REPORT:
${html}`;

            if ((settings.aiProvider === 'claude-code' || settings.aiProvider === 'antigravity-cli') && aiPrompt.length > 7000) {
                const tmp = await tempDir();
                const tmpPath = await join(tmp, `checkup_prompt_${Date.now()}.txt`);
                await writeTextFile(tmpPath, aiPrompt);
                aiPrompt = `Please read my requirements and the HTML report from this temporary file: ${tmpPath}`;
                console.log("[verifyReportWithAI] Prompt exceeded CLI limits. Wrote to file:", tmpPath);
            }

            console.log("[verifyReportWithAI] Triggering AI with prompt length:", aiPrompt.length);
            console.log("[verifyReportWithAI] Requirements prompt:", aiRequirementsPrompt);

            const response = await askAgent(aiPrompt, [], aiSystemInstruction, settings);
            console.log("[verifyReportWithAI] AI Response received:", response);
            let modifiedHtml = html;
            
            try {
                const responseData = typeof response.response === 'string' ? JSON.parse(response.response) : response.response;
                if (responseData && Array.isArray(responseData.replacements)) {
                    for (const patch of responseData.replacements) {
                        if (patch.search && patch.replace) {
                            modifiedHtml = modifiedHtml.replace(patch.search, patch.replace);
                        }
                    }
                } else if (responseData && responseData.reply) {
                    // Fallback in case AI ignored the instructions and sent the full HTML anyway
                    modifiedHtml = responseData.reply;
                }
            } catch (e) {
                console.warn("[verifyReportWithAI] Failed to parse replacements, using fallback raw response.", e);
                modifiedHtml = typeof response.response === 'string' ? response.response : JSON.stringify(response.response);
            }

            // Clean up any potential markdown formatting the AI might have still included
            if (modifiedHtml.startsWith('\`\`\`html')) {
                modifiedHtml = modifiedHtml.replace(/^\`\`\`html/, '').replace(/\`\`\`$/, '');
            } else if (modifiedHtml.startsWith('\`\`\`')) {
                modifiedHtml = modifiedHtml.replace(/^\`\`\`/, '').replace(/\`\`\`$/, '');
            }

            const filePath = await save({
                filters: [{ name: 'HTML Report', extensions: ['html'] }],
                defaultPath: `report_${selectedDevice.replace(/[^a-zA-Z0-9]/g, '_')}_verified_${new Date().toISOString().split('T')[0]}.html`
            });

            if (filePath) {
                await writeTextFile(filePath, modifiedHtml);
                toast.success(t('toolbox.checkup.report_saved', 'Report saved successfully!'), { id: toastId });
            } else {
                toast.dismiss(toastId);
            }

        } catch (error) {
            console.error('[verifyReportWithAI] Failed to verify report with AI:', error);
            console.error('[verifyReportWithAI] Error details:', JSON.stringify(error, null, 2));
            toast.error(t('toolbox.checkup.report_error', 'Failed to generate report'), { id: toastId });
        } finally {
            setIsAiVerifying(false);
            setAiRequirementsPrompt("");
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-surface p-4 gap-4">

            <div className="flex-1 min-h-0 flex flex-wrap gap-6 overflow-y-auto">

                {/* Props Comparison Panel */}
                <Section
                    title={t('toolbox.checkup.prop_compare', '.prop Compare')}
                    icon={FileText}
                    className="flex-[2] min-w-[350px] flex flex-col min-h-[400px] xl:min-h-0 overflow-hidden"
                    contentClassName="flex-1 flex flex-col min-h-0 pr-2"
                    actions={
                        <div className="flex flex-wrap items-center gap-2">
                            <SplitButton
                                variant="primary"
                                disabled={disabled || isLoading}
                                primaryAction={{
                                    label: t('toolbox.checkup.upload_prop', 'Import'),
                                    icon: <Upload size={16} />,
                                    onClick: () => handleImportFile(false)
                                }}
                                secondaryActions={[
                                    {
                                        label: t('toolbox.checkup.upload_additional_prop', 'Additional .prop file'),
                                        icon: <ListPlus size={16} />,
                                        onClick: () => handleImportFile(true)
                                    },
                                    {
                                        label: t('toolbox.checkup.load_remaining', 'Load remaining base props'),
                                        icon: <FileText size={16} />,
                                        onClick: handleLoadRemainingProps,
                                        disabled: !selectedDevice
                                    }
                                ]}
                            />
                        </div>
                    }
                >
                    <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
                        <div className="flex items-center gap-2">
                            {selectedDevice && (
                                <Button
                                    variant="outline"
                                    tooltipPosition="right"
                                    onClick={() => setIsReportModalOpen(true)}
                                    disabled={disabled || isLoading}
                                    className="relative h-9 w-9 p-0 flex items-center justify-center shrink-0 rounded-md"
                                    title={t('toolbox.checkup.generate_report', 'Generate Report')}
                                >
                                    <Download size={16} />
                                </Button>
                            )}
                            <Button
                                variant={filterDivergent ? "primary" : "ghost"}
                                size="sm"
                                tooltipPosition="right"
                                onClick={() => setFilterDivergent(!filterDivergent)}
                                className={clsx("relative h-9 w-9 p-0 flex items-center justify-center shrink-0 rounded-md", filterDivergent && "bg-error/10 text-error hover:bg-error/20 hover:text-error")}
                                title={filterDivergent ? t('toolbox.checkup.show_all', 'Show all') : t('toolbox.checkup.show_divergent', 'Show only divergences')}
                            >
                                {filterDivergent ? <FilterX size={16} /> : <Filter size={16} />}
                            </Button>
                        </div>
                        <div className="flex items-center gap-2">
                            {comparisons.length > 0 && (
                                <span className="text-xs px-2 h-9 flex items-center justify-center text-on-surface rounded-full font-medium whitespace-nowrap">
                                    {matchCount} / {comparisons.length} {t('toolbox.checkup.matches', 'matches')}
                                </span>
                            )}
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={t('toolbox.checkup.search_placeholder', 'Search key...')}
                                    className="pl-9 h-9 text-sm w-36 sm:w-48"
                                />
                            </div>
                        </div>
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
                                                        ? <span data-tooltip={`adb shell getprop ${c.key}`} data-position="left"><CheckCircle2 size={16} className="text-success mx-auto drop-shadow-sm" /></span>
                                                        : (c.isExtra
                                                            ? <span data-tooltip={`adb shell getprop ${c.key}`} data-position="left"><Info size={16} className="text-warning mx-auto drop-shadow-sm" /></span>
                                                            : <span data-tooltip={`adb shell getprop ${c.key}`} data-position="left"><XCircle size={16} className="text-error mx-auto drop-shadow-sm" /></span>
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
                                {check.status === 'running' && <span data-tooltip={`adb shell ${check.command}`} data-position="left"><ExpressiveLoading variant="circular" size="sm" /></span>}
                                {check.status === 'correct' && <span data-tooltip={`adb shell ${check.command}`} data-position="left"><CheckCircle2 size={18} className="text-success shrink-0 drop-shadow-sm cursor-help" /></span>}
                                {check.status === 'incorrect' && <span data-tooltip={`adb shell ${check.command}`} data-position="left"><XCircle size={18} className="text-error shrink-0 drop-shadow-sm cursor-help" /></span>}
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
                                {check.status === 'running' && <span data-tooltip={`adb ${check.command.join(' ')}`} data-position="left"><ExpressiveLoading variant="circular" size="sm" /></span>}
                                {check.status === 'done' && <span data-tooltip={`adb ${check.command.join(' ')}`} data-position="left"><Info size={18} className="text-primary shrink-0 drop-shadow-sm cursor-help" /></span>}
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

            {/* Report Configuration Modal */}
            <Modal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                title={t('toolbox.checkup.report.config_title', 'Report Configuration')}
                className="max-w-4xl w-[90vw]"
            >
                <div className="flex flex-col gap-6 max-h-[70vh] overflow-y-auto pr-2">
                    <div>
                        <h3 className="text-sm font-semibold text-on-surface mb-3">{t('toolbox.checkup.prop_compare', '.prop Compare')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <ActionCard
                                orientation="horizontal"
                                title={t('toolbox.checkup.report.all', 'All results')}
                                description={t('toolbox.checkup.report.all_desc', 'Show both matching and divergent .prop values')}
                                selected={reportPropsCompare === 'all'}
                                onClick={() => setReportPropsCompare('all')}
                            />
                            <ActionCard
                                orientation="horizontal"
                                title={t('toolbox.checkup.report.divergent', 'Only divergent')}
                                description={t('toolbox.checkup.report.divergent_desc', 'Show only mismatched .prop values')}
                                selected={reportPropsCompare === 'divergent'}
                                onClick={() => setReportPropsCompare('divergent')}
                            />
                            <ActionCard
                                orientation="horizontal"
                                title={t('toolbox.checkup.report.none', 'None')}
                                description={t('toolbox.checkup.report.none_desc', 'Do not show .prop comparisons')}
                                selected={reportPropsCompare === 'none'}
                                onClick={() => setReportPropsCompare('none')}
                            />
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-semibold text-on-surface mb-3">{t('toolbox.checkup.report.inclusions', 'Inclusions')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <ActionCard
                                orientation="horizontal"
                                title={t('toolbox.checkup.report.show_standard_checks', 'Show Standard Checks')}
                                description={t('toolbox.checkup.report.show_standard_checks_desc', 'Include the results of the standard checks if executed')}
                                selected={reportShowStandardChecks}
                                onClick={() => setReportShowStandardChecks(!reportShowStandardChecks)}
                            />
                            <ActionCard
                                orientation="horizontal"
                                title={t('toolbox.checkup.report.show_additional_checks', 'Show Additional Checks')}
                                description={t('toolbox.checkup.report.show_additional_checks_desc', 'Include the results of the additional checks if executed')}
                                selected={reportShowAdditionalChecks}
                                onClick={() => setReportShowAdditionalChecks(!reportShowAdditionalChecks)}
                            />
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-semibold text-on-surface mb-3">{t('toolbox.checkup.report.package_filter_mode', 'Package Filter Mode')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <ActionCard
                                orientation="horizontal"
                                title={t('toolbox.checkup.report.package_filter_mode_exclude', 'Show all except...')}
                                description={t('toolbox.checkup.report.package_filter_mode_exclude_desc', 'Show all packages, excluding those that start with the prefixes below')}
                                selected={packageFilterMode === 'exclude' && reportShowPackages}
                                onClick={() => { setPackageFilterMode('exclude'); setReportShowPackages(true); }}
                            />
                            <ActionCard
                                orientation="horizontal"
                                title={t('toolbox.checkup.report.package_filter_mode_include', 'Show ONLY...')}
                                description={t('toolbox.checkup.report.package_filter_mode_include_desc', 'Show ONLY the packages that start with the prefixes below')}
                                selected={packageFilterMode === 'include' && reportShowPackages}
                                onClick={() => { setPackageFilterMode('include'); setReportShowPackages(true); }}
                            />
                            <ActionCard
                                orientation="horizontal"
                                title={t('toolbox.checkup.report.package_filter_none', 'None')}
                                description={t('toolbox.checkup.report.package_filter_none_desc', 'No packages will be shown')}
                                selected={!reportShowPackages}
                                onClick={() => setReportShowPackages(!reportShowPackages)}
                            />
                        </div>
                    </div>
                    {reportShowPackages && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="bg-surface-variant/30 p-4 rounded-xl border border-outline-variant/30 flex flex-col gap-4"
                        >
                            <div>
                                <TagInput
                                    label={t('toolbox.checkup.report.package_prefixes', 'Package Prefixes (e.g. com.android)')}
                                    tags={packageFilterPrefixes}
                                    onChange={setPackageFilterPrefixes}
                                    placeholder={t('toolbox.checkup.report.add_prefix', 'Add prefix...')}
                                />
                            </div>
                        </motion.div>
                    )}

                    <div>
                        <h3 className="text-sm font-semibold text-on-surface mb-3">{t('toolbox.checkup.report.props_filter_mode', 'Props Filter Mode')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <ActionCard
                                orientation="horizontal"
                                title={t('toolbox.checkup.report.props_filter_mode_exclude', 'Show all except...')}
                                description={t('toolbox.checkup.report.props_filter_mode_exclude_desc', 'Show all props, excluding those that start with the prefixes below')}
                                selected={propsFilterMode === 'exclude' && reportShowPropsBase}
                                onClick={() => { setPropsFilterMode('exclude'); setReportShowPropsBase(true); }}
                            />
                            <ActionCard
                                orientation="horizontal"
                                title={t('toolbox.checkup.report.props_filter_mode_include', 'Show ONLY...')}
                                description={t('toolbox.checkup.report.props_filter_mode_include_desc', 'Show ONLY the props that start with the prefixes below')}
                                selected={propsFilterMode === 'include' && reportShowPropsBase}
                                onClick={() => { setPropsFilterMode('include'); setReportShowPropsBase(true); }}
                            />
                            <ActionCard
                                orientation="horizontal"
                                title={t('toolbox.checkup.report.props_none', 'None')}
                                description={t('toolbox.checkup.report.props_none_desc', 'No props will be shown')}
                                selected={!reportShowPropsBase}
                                onClick={() => setReportShowPropsBase(!reportShowPropsBase)}
                            />
                        </div>
                    </div>
                    {reportShowPropsBase && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="bg-surface-variant/30 p-4 rounded-xl border border-outline-variant/30 flex flex-col gap-4"
                        >
                            <div>
                                <TagInput
                                    label={t('toolbox.checkup.report.props_prefixes', 'Props Prefixes (e.g. hw)')}
                                    tags={propsFilterPrefixes}
                                    onChange={setPropsFilterPrefixes}
                                    placeholder={t('toolbox.checkup.report.add_prefix', 'Add prefix...')}
                                />
                            </div>
                        </motion.div>
                    )}
                </div>

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-outline-variant/30">
                    <Button variant="ghost" onClick={() => setIsReportModalOpen(false)}>
                        {t('toolbox.checkup.report.cancel', 'Cancel')}
                    </Button>
                    <SplitButton
                        variant="primary"
                        primaryAction={{
                            label: t('toolbox.checkup.report.generate', 'Generate Report'),
                            onClick: generateReport
                        }}
                        secondaryActions={[
                            {
                                label: t('toolbox.checkup.report.verify_with_ai', 'Verify with AI'),
                                onClick: () => setIsAiVerifyModalOpen(true)
                            }
                        ]}
                    />
                </div>
            </Modal>

            {/* AI Verify Modal */}
            <Modal
                isOpen={isAiVerifyModalOpen}
                onClose={() => setIsAiVerifyModalOpen(false)}
                title={t('toolbox.checkup.report.ai_verify_title', 'Verify with AI')}
                className="max-w-3xl w-[90vw]"
            >
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-on-surface-variant">
                        {t('toolbox.checkup.report.ai_verify_desc', 'Enter the new requirements or release notes. The AI will analyze the current report data against these requirements and generate a new modified report.')}
                    </p>
                    <Textarea
                        value={aiRequirementsPrompt}
                        onChange={(e) => setAiRequirementsPrompt(e.target.value)}
                        placeholder={t('toolbox.checkup.report.ai_prompt_placeholder', 'Example: The expected screen resolution is now 1080x1920. The application version should be greater than 2.0.0...')}
                        className="min-h-[200px]"
                        disabled={isAiVerifying}
                    />
                </div>
                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-outline-variant/30">
                    <Button variant="ghost" onClick={() => setIsAiVerifyModalOpen(false)} disabled={isAiVerifying}>
                        {t('toolbox.checkup.report.cancel', 'Cancel')}
                    </Button>
                    <Button variant="primary" onClick={verifyReportWithAI} disabled={isAiVerifying || !aiRequirementsPrompt.trim()}>
                        {isAiVerifying ? t('toolbox.checkup.report.ai_verifying', 'Verifying...') : t('toolbox.checkup.report.start_verification', 'Start Verification')}
                    </Button>
                </div>
            </Modal>
        </div>
    );
};

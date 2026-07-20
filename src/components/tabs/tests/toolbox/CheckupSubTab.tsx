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
import { getReportVerificationPrompt } from '@/lib/dashboard/prompts';

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

interface PackageComparison {
    name: string;
    goldenVersion?: string;
    deviceVersion?: string;
    isMatch: boolean;
    isMissing: boolean;
    isExtra: boolean;
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
    const [isSearchFocused, setIsSearchFocused] = useState(false);

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
    const [reportStandardChecks, setReportStandardChecks] = useState<'all' | 'divergent' | 'none'>(() => {
        const val = localStorage.getItem('checkup_reportStandardChecks');
        if (val) return val as any;
        return localStorage.getItem('checkup_reportShowStandardChecks') === 'false' ? 'none' : 'all';
    });
    const [reportAdditionalChecks, setReportAdditionalChecks] = useState<'all' | 'divergent' | 'none'>(() => {
        const val = localStorage.getItem('checkup_reportAdditionalChecks');
        if (val) return val as any;
        return localStorage.getItem('checkup_reportShowAdditionalChecks') === 'false' ? 'none' : 'all';
    });
    const [reportPackages, setReportPackages] = useState<'all' | 'divergent' | 'none'>(() => {
        const val = localStorage.getItem('checkup_reportPackages');
        if (val) return val as any;
        return localStorage.getItem('checkup_reportShowPackages') === 'false' ? 'none' : 'all';
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

    const [isBasePropsModalOpen, setIsBasePropsModalOpen] = useState(false);
    const [basePropsPrefixes, setBasePropsPrefixes] = useState<string[]>(() => {
        const stored = localStorage.getItem('checkup_basePropsPrefixes');
        return stored ? JSON.parse(stored) : [
            'gsm.version.', 'persist.sys.device_provisioned', 'persist.sys.fuse', 'persist.sys.usb.config',
            'persist.vendor.connsys.', 'ro.board.', 'ro.boot.hardware', 'ro.boot.serialno', 'ro.boot.vbmeta.',
            'ro.boot.verifiedbootstate', 'ro.boot.veritymode', 'ro.bootloader', 'ro.build.', 'ro.config.low_ram',
            'ro.crypto.', 'ro.debuggable', 'ro.hardware.', 'ro.odm.', 'ro.product.', 'ro.secure', 'ro.revision',
            'ro.serialno', 'ro.soc.model', 'ro.system.', 'ro.telephony.', 'ro.vendor.mediatek.', 'ro.vendor.wifi.',
            'ro.zygote', 'sys.usb.config'
        ];
    });

    useEffect(() => {
        localStorage.setItem('checkup_reportPropsCompare', reportPropsCompare);
        localStorage.setItem('checkup_reportShowPropsBase', String(reportShowPropsBase));
        localStorage.setItem('checkup_reportStandardChecks', reportStandardChecks);
        localStorage.setItem('checkup_reportAdditionalChecks', reportAdditionalChecks);
        localStorage.setItem('checkup_reportPackages', reportPackages);
        localStorage.setItem('checkup_packageFilterMode', packageFilterMode);
        localStorage.setItem('checkup_packageFilterPrefixes', JSON.stringify(packageFilterPrefixes));
        localStorage.setItem('checkup_propsFilterMode', propsFilterMode);
        localStorage.setItem('checkup_propsFilterPrefixes', JSON.stringify(propsFilterPrefixes));
        localStorage.setItem('checkup_basePropsPrefixes', JSON.stringify(basePropsPrefixes));
    }, [
        reportPropsCompare, reportShowPropsBase, reportStandardChecks,
        reportAdditionalChecks, reportPackages, packageFilterMode, packageFilterPrefixes,
        propsFilterMode, propsFilterPrefixes, basePropsPrefixes
    ]);

    // Standard checks based on POS Checklist
    const [checkResults, setCheckResults] = useState<Record<string, { status: 'idle' | 'running' | 'correct' | 'incorrect', found?: string, goldenExpected?: string, isGoldenMatch?: boolean }>>({});

    const [additionalCheckResults, setAdditionalCheckResults] = useState<Record<string, { status: 'idle' | 'running' | 'done', found?: string, goldenExpected?: string, isGoldenMatch?: boolean }>>({});
    const [packageComparisons, setPackageComparisons] = useState<PackageComparison[]>([]);

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


    const handleImportGoldenFile = async () => {
        if (!selectedDevice) return;
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: 'JSON Golden File', extensions: ['json'] }]
            });

            if (selected && typeof selected === 'string') {
                setIsLoading(true);
                const fileContent = await readTextFile(selected);
                const goldenData = JSON.parse(fileContent);

                // Fetch device properties
                let currentDeviceProps = devicePropsCache;
                if (!currentDeviceProps || Object.keys(currentDeviceProps).length === 0) {
                    const deviceOutput: string = await invoke('run_adb_command', {
                        device: selectedDevice,
                        args: ['shell', 'getprop']
                    });
                    currentDeviceProps = parseDeviceProps(deviceOutput);
                    setDevicePropsCache(currentDeviceProps);
                }

                // 1. Process Properties
                if (goldenData.properties) {
                    const expectedProps = goldenData.properties;
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
                    setComparisons(newComparisons);
                }

                // Run Live Checks for Comparison
                const newStandardResults: Record<string, any> = {};
                if (goldenData.standard_checks) {
                    await Promise.all(standardChecksBase.map(async (check) => {
                        if (goldenData.standard_checks[check.id]) {
                            const goldenCheck = goldenData.standard_checks[check.id];
                            try {
                                const output: string = await invoke('run_adb_command', {
                                    device: selectedDevice,
                                    args: check.command
                                });
                                const isMatch = check.expected(output);
                                const foundDisplay = check.foundDisplay(output);
                                newStandardResults[check.id] = {
                                    status: isMatch ? 'correct' : 'incorrect',
                                    found: foundDisplay,
                                    goldenExpected: goldenCheck.found,
                                    isGoldenMatch: goldenCheck.found === foundDisplay
                                };
                            } catch (error) {
                                newStandardResults[check.id] = {
                                    status: 'incorrect',
                                    found: t('toolbox.checkup.error_exec', 'Execution error'),
                                    goldenExpected: goldenCheck.found,
                                    isGoldenMatch: false
                                };
                            }
                        }
                    }));
                    setCheckResults(newStandardResults);
                }

                const newAdditionalResults: Record<string, any> = {};
                if (goldenData.additional_checks) {
                    await Promise.all(additionalChecksBase.map(async (check) => {
                        if (goldenData.additional_checks[check.id]) {
                            const goldenCheck = goldenData.additional_checks[check.id];
                            try {
                                const output: string = await invoke('run_adb_command', {
                                    device: selectedDevice,
                                    args: check.command
                                });
                                const foundDisplay = check.foundDisplay(output);
                                newAdditionalResults[check.id] = {
                                    status: 'done',
                                    found: foundDisplay,
                                    goldenExpected: goldenCheck.found,
                                    isGoldenMatch: goldenCheck.found === foundDisplay
                                };
                            } catch (error) {
                                newAdditionalResults[check.id] = {
                                    status: 'done',
                                    found: t('toolbox.checkup.error_exec', 'Execution error'),
                                    goldenExpected: goldenCheck.found,
                                    isGoldenMatch: false
                                };
                            }
                        }
                    }));
                    setAdditionalCheckResults(newAdditionalResults);
                }

                // Packages Compare
                if (goldenData.installed_packages) {
                    const pkgs = await invoke<PackageInfo[]>("get_installed_packages", { device: selectedDevice });
                    const goldenPkgs: any[] = goldenData.installed_packages;

                    const devicePkgsMap = new Map(pkgs.map(p => [p.name, p]));
                    const goldenPkgsMap = new Map(goldenPkgs.map(p => [p.name, p]));

                    const pkgComps: PackageComparison[] = [];

                    for (const gPkg of goldenPkgs) {
                        const dPkg = devicePkgsMap.get(gPkg.name);
                        pkgComps.push({
                            name: gPkg.name,
                            goldenVersion: gPkg.version,
                            deviceVersion: dPkg?.version,
                            isMatch: dPkg?.version === gPkg.version,
                            isMissing: !dPkg,
                            isExtra: false
                        });
                    }

                    for (const dPkg of pkgs) {
                        if (!goldenPkgsMap.has(dPkg.name)) {
                            pkgComps.push({
                                name: dPkg.name,
                                deviceVersion: dPkg.version,
                                isMatch: false,
                                isMissing: false,
                                isExtra: true
                            });
                        }
                    }

                    setPackageComparisons(pkgComps);
                }

                toast.success(t('toolbox.checkup.golden_file_imported', 'Golden file imported successfully!'), { id: 'golden-import' });
            }
        } catch (error) {
            console.error('Failed to import golden file:', error);
            toast.error(t('toolbox.checkup.golden_file_import_error', 'Failed to import golden file'), { id: 'golden-import-error' });
        } finally {
            setIsLoading(false);
        }
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
                    if (basePropsPrefixes.some(prefix => key.startsWith(prefix))) {
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

    const buildHtmlReport = async (aiMode: boolean = false): Promise<string | null> => {
        if (!selectedDevice) return null;
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

            const deviceName = currentDeviceProps['ro.product.model'] || currentDeviceProps['ro.product.marketname'] || 'Unknown Device';

            let filteredPkgs: PackageInfo[] = [];

            if (reportPackages !== 'none') {

                const pkgs = await invoke<PackageInfo[]>("get_installed_packages", { device: selectedDevice });
                filteredPkgs = pkgs.filter(p => {
                    if (packageFilterPrefixes.length === 0) return packageFilterMode === 'exclude';
                    const matchesPrefix = packageFilterPrefixes.some(prefix => p.name.startsWith(prefix));
                    if (packageFilterMode === 'include') return matchesPrefix;
                    return !matchesPrefix; // 'exclude'
                });
            }

            let html = `<!DOCTYPE html>
<html lang="${t('language', 'en')}">
<head>
    <meta charset="UTF-8">
    <title>${t('toolbox.checkup.report_title', 'Device Checkup Report')} - ${deviceName} - ${selectedDevice}</title>
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
    <div style="display: flex; align-items: center; justify-content: space-between;">
        <h1>${t('toolbox.checkup.report_title', 'Device Checkup Report')}</h1>
        <div><strong>${t('toolbox.checkup.device_name', 'Device Name')}:</strong> ${deviceName}<br><strong>${t('toolbox.checkup.device_udid', 'Device UDID')}:</strong> <code>${selectedDevice}</code><br><strong>${t('toolbox.checkup.date', 'Date')}:</strong> ${new Date().toLocaleString()}</div>
    </div>
    <!-- HEADER_END -->
`;

            let standardChecksToRender = standardChecks;
            if (reportStandardChecks === 'divergent' || aiMode) {
                standardChecksToRender = standardChecks.filter(c => {
                    if (checkResults[c.id]?.goldenExpected !== undefined) {
                        return !checkResults[c.id]?.isGoldenMatch;
                    }
                    return c.status !== 'correct';
                });
            }

            if (standardChecksToRender.length > 0 && reportStandardChecks !== 'none') {
                html += `
                <div class="section">
                    <div class="section-header">${t('toolbox.checkup.standard_checks', 'Standard Checks')}</div>
                    <table>
                        <thead>
                            <tr>
                                <th>${t('toolbox.checkup.check', 'Check')}</th>
                                <th>${t('toolbox.checkup.found', 'Found')}</th>
                                <th>${t('toolbox.checkup.status', 'Status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                standardChecksToRender.forEach(c => {
                    let statusText = '-';
                    let statusClass = '';

                    if (checkResults[c.id]?.goldenExpected !== undefined) {
                        const isMatch = checkResults[c.id]?.isGoldenMatch;
                        statusText = isMatch ? t('toolbox.checkup.status_match', 'Match') : t('toolbox.checkup.status_mismatch', 'Mismatch');
                        statusClass = isMatch ? 'success' : 'error';
                    } else {
                        if (c.status === 'correct') { statusText = t('toolbox.checkup.status_correct', 'Correct'); statusClass = 'success'; }
                        else if (c.status === 'incorrect') { statusText = t('toolbox.checkup.status_incorrect', 'Incorrect'); statusClass = 'error'; }
                    }

                    html += `
                        <tr>
                            <td><strong>${c.name}</strong><br><code>${c.command.join(' ')}</code></td>
                            <td>
                                ${checkResults[c.id]?.goldenExpected !== undefined ? `<div>${t('toolbox.checkup.golden', 'Golden')}: <code>${checkResults[c.id]?.goldenExpected}</code></div>` : ''}
                                <div>${t('toolbox.checkup.found', 'Found')}: <code class="${statusClass}">${c.found || '-'}</code></div>
                            </td>
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
                                <th>${t('toolbox.checkup.key', 'Key')}</th>
                                <th>${t('toolbox.checkup.expected', 'Expected')}</th>
                                <th>${t('toolbox.checkup.found', 'Found')}</th>
                                <th>${t('toolbox.checkup.status', 'Status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                let propsToRender = reportPropsCompare === 'divergent'
                    ? comparisons.filter(c => !c.isExtra && !c.isMatch)
                    : comparisons.filter(c => !c.isExtra);

                if (aiMode) {
                    propsToRender = propsToRender.filter(c => !c.isMatch);
                }

                propsToRender.forEach(c => {
                    html += `
                            <tr>
                                <td><code>${c.key}</code></td>
                                <td><code>${c.expected}</code></td>
                                <td><code class="${c.isMatch ? 'success' : 'error'}">${c.found || '-'}</code></td>
                                <td class="${c.isMatch ? 'success' : 'error'}">${c.isMatch ? t('toolbox.checkup.status_match', 'Match') : t('toolbox.checkup.status_mismatch', 'Mismatch')}</td>
                            </tr>
                    `;
                });
                html += `</tbody></table></div>`;
            }


            if (packageComparisons.length > 0 && reportPackages !== 'none') {
                let filteredComps = packageComparisons.filter(p => {
                    if (packageFilterPrefixes.length === 0) return packageFilterMode === 'exclude';
                    const matchesPrefix = packageFilterPrefixes.some(prefix => p.name.startsWith(prefix));
                    if (packageFilterMode === 'include') return matchesPrefix;
                    return !matchesPrefix;
                });

                if (reportPackages === 'divergent' || aiMode) {
                    filteredComps = filteredComps.filter(c => !c.isMatch);
                }

                if (filteredComps.length > 0) {
                    html += `
                    <div class="section">
                    <div class="section-header">${t('toolbox.checkup.packages_compare', 'Packages Compare')}</div>
                    <table>
                    <thead>
                    <tr>
                    <th>${t('toolbox.checkup.package_name', 'Package')}</th>
                    <th>${t('toolbox.checkup.golden', 'Golden')}</th>
                    <th>${t('toolbox.checkup.device', 'Device')}</th>
                    <th>${t('toolbox.checkup.status', 'Status')}</th>
                    </tr>
                    </thead>
                    <tbody>
                    `;
                    filteredComps.forEach(p => {
                        html += `
                        <tr>
                        <td><code>${p.name}</code></td>
                        <td><code>${p.goldenVersion || '-'}</code></td>
                        <td><code class="${p.isMatch ? 'success' : 'error'}">${p.deviceVersion || '-'}</code></td>
                        <td class="${p.isMatch ? 'success' : 'error'}">${p.isMatch ? t('toolbox.checkup.status_match', 'Match') : (p.isMissing ? t('toolbox.checkup.status_missing', 'Missing') : t('toolbox.checkup.status_extra', 'Extra'))}</td>
                        </tr>
                        `;
                    });
                    html += `</tbody></table></div>`;
                }
            } else if (reportPackages !== 'none') {

                html += `
                <div class="section">
                <div class="section-header">${t('toolbox.checkup.installed_packages', 'Installed Packages')}</div>
                <table>
                <thead>
                <tr>
                <th>${t('toolbox.checkup.package_name', 'Package')}</th>
                <th>${t('toolbox.checkup.version', 'Version')}</th>
                <th>${t('toolbox.checkup.type', 'Type')}</th>
                </tr>
                </thead>
                <tbody>
                `;
                filteredPkgs.forEach(p => {
                    html += `
                    <tr>
                    <td><code>${p.name}</code></td>
                    <td><code>${p.version || '-'}</code></td>
                    <td><span class="${p.is_system ? 'warning' : 'info'}">${p.is_system ? t('toolbox.checkup.system', 'System') : t('toolbox.checkup.user', 'User')}</span></td>
                    </tr>
                    `;
                });
                html += `</tbody></table></div>`;
            }

            let additionalChecksToRender = additionalChecks;
            if (reportAdditionalChecks === 'divergent' || aiMode) {
                additionalChecksToRender = additionalChecks.filter(c => {
                    if (additionalCheckResults[c.id]?.goldenExpected !== undefined) {
                        return !additionalCheckResults[c.id]?.isGoldenMatch;
                    }
                    // For AI mode, if no golden expected, we should send it. But for divergent filter, maybe not. 
                    // Let's keep it simple: if 'divergent' or 'aiMode', no golden means we DO send it, because it might be a finding, or we want the AI to analyze it. Wait, the user said: "Apenas divergentes', onde apenas os itens com status incorreto são exibidos." and "A IA deve receber apenas itens com status incorreto ou sem base de comparação."
                    return true;
                });
            }

            if (additionalChecksToRender.length > 0 && reportAdditionalChecks !== 'none') {
                html += `
                            <div class="section">
                                <div class="section-header">${t('toolbox.checkup.additional_checks', 'Additional Checks')}</div>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>${t('toolbox.checkup.check', 'Check')}</th>
                                            <th>${t('toolbox.checkup.found', 'Found')}</th>
                                            <th>${t('toolbox.checkup.status', 'Status')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                            `;
                additionalChecksToRender.forEach(c => {
                    let statusText = '-';
                    let statusClass = 'info';

                    if (additionalCheckResults[c.id]?.goldenExpected !== undefined) {
                        const isMatch = additionalCheckResults[c.id]?.isGoldenMatch;
                        statusText = isMatch ? t('toolbox.checkup.status_match', 'Match') : t('toolbox.checkup.status_mismatch', 'Mismatch');
                        statusClass = isMatch ? 'success' : 'warning';
                    }

                    html += `
                                    <tr>
                                        <td><strong>${c.name}</strong><br><code>${c.command.join(' ')}</code></td>
                                        <td>
                                            ${additionalCheckResults[c.id]?.goldenExpected !== undefined ? `<div>${t('toolbox.checkup.golden', 'Golden')}: <code>${additionalCheckResults[c.id]?.goldenExpected}</code></div>` : ''}
                                            <div>${t('toolbox.checkup.found', 'Found')}: <code>${c.found || '-'}</code></div>
                                        </td>
                                        <td class="${statusClass}">${statusText}</td>
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
                                    <th>${t('toolbox.checkup.key', 'Key')}</th>
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

    const generateGoldenFile = async () => {
        if (!selectedDevice) return;

        let toastId = toast.loading(t('toolbox.checkup.golden_file.generating', 'Generating golden file...'));
        try {
            // Fetch everything we need
            let currentDeviceProps = devicePropsCache;
            if (!currentDeviceProps || Object.keys(currentDeviceProps).length === 0) {
                const deviceOutput: string = await invoke('run_adb_command', {
                    device: selectedDevice,
                    args: ['shell', 'getprop']
                });
                currentDeviceProps = parseDeviceProps(deviceOutput);
                setDevicePropsCache(currentDeviceProps);
            }

            const capturedProps: Record<string, string> = {};
            const newComparisons: PropComparison[] = [];
            Object.keys(currentDeviceProps).forEach(key => {
                if (basePropsPrefixes.some(prefix => key.startsWith(prefix))) {
                    capturedProps[key] = currentDeviceProps[key];
                    newComparisons.push({
                        key,
                        expected: currentDeviceProps[key],
                        found: currentDeviceProps[key],
                        isMatch: true
                    });
                }
            });
            setComparisons(newComparisons);

            // Run standard checks if not already run
            const newStandardResults: Record<string, any> = { ...checkResults };
            await Promise.all(standardChecksBase.map(async (check) => {
                if (newStandardResults[check.id]?.status !== 'correct' && newStandardResults[check.id]?.status !== 'incorrect') {
                    try {
                        const output: string = await invoke('run_adb_command', {
                            device: selectedDevice,
                            args: check.command
                        });
                        const isMatch = check.expected(output);
                        newStandardResults[check.id] = {
                            status: isMatch ? 'correct' : 'incorrect',
                            found: check.foundDisplay(output)
                        };
                    } catch (error) {
                        newStandardResults[check.id] = {
                            status: 'incorrect',
                            found: t('toolbox.checkup.error_exec', 'Execution error')
                        };
                    }
                }
            }));
            setCheckResults(newStandardResults);

            // Run additional checks if not already run
            const newAdditionalResults: Record<string, any> = { ...additionalCheckResults };
            await Promise.all(additionalChecksBase.map(async (check) => {
                if (newAdditionalResults[check.id]?.status !== 'done') {
                    try {
                        const output: string = await invoke('run_adb_command', {
                            device: selectedDevice,
                            args: check.command
                        });
                        newAdditionalResults[check.id] = {
                            status: 'done',
                            found: check.foundDisplay(output)
                        };
                    } catch (error) {
                        newAdditionalResults[check.id] = {
                            status: 'done',
                            found: t('toolbox.checkup.error_exec', 'Execution error')
                        };
                    }
                }
            }));
            setAdditionalCheckResults(newAdditionalResults);

            const pkgs = await invoke<PackageInfo[]>("get_installed_packages", { device: selectedDevice });

            const newPkgComps: PackageComparison[] = pkgs.map(p => ({
                name: p.name,
                goldenVersion: p.version,
                deviceVersion: p.version,
                isMatch: true,
                isMissing: false,
                isExtra: false
            }));
            setPackageComparisons(newPkgComps);

            const goldenData = {
                device: selectedDevice,
                timestamp: new Date().toISOString(),
                properties: capturedProps,
                standard_checks: standardChecksBase.reduce((acc: any, check) => {
                    acc[check.id] = {
                        name: check.name,
                        command: check.command.join(' '),
                        status: newStandardResults[check.id]?.status,
                        found: newStandardResults[check.id]?.found
                    };
                    return acc;
                }, {}),
                additional_checks: additionalChecksBase.reduce((acc: any, check) => {
                    acc[check.id] = {
                        name: check.name,
                        command: check.command.join(' '),
                        found: newAdditionalResults[check.id]?.found
                    };
                    return acc;
                }, {}),
                installed_packages: pkgs.map(p => ({
                    name: p.name,
                    version: p.version,
                    is_system: p.is_system
                }))
            };

            const filePath = await save({
                filters: [{ name: 'JSON Golden File', extensions: ['json'] }],
                defaultPath: `golden_${selectedDevice.replace(/[^a-zA-Z0-9]/g, '_')}.json`
            });

            if (filePath) {
                await writeTextFile(filePath, JSON.stringify(goldenData, null, 2));
                toast.success(t('toolbox.checkup.golden_file.saved', 'Golden file saved successfully!'), { id: toastId });
            } else {
                toast.dismiss(toastId);
            }
        } catch (error) {
            console.error('Failed to generate golden file', error);
            toast.error(t('toolbox.checkup.golden_file.error', 'Failed to generate golden file'), { id: toastId });
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
            const html = await buildHtmlReport(true);
            if (!html) throw new Error("Failed to build base HTML for AI");

            const aiSystemInstruction = getReportVerificationPrompt(settings.language || 'en-US');

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

                // Fetch the HTML content, either from our custom property or the standard 'reply' property
                let aiHtmlContent = responseData.ai_section_html || responseData.reply;

                if (aiHtmlContent) {
                    // Clean up any potential markdown formatting
                    if (aiHtmlContent.startsWith('```html')) {
                        aiHtmlContent = aiHtmlContent.replace(/^```html\n?/, '').replace(/\n?```$/, '');
                    } else if (aiHtmlContent.startsWith('```')) {
                        aiHtmlContent = aiHtmlContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
                    }

                    const insertPoint = modifiedHtml.indexOf('<!-- HEADER_END -->');
                    if (insertPoint !== -1) {
                        modifiedHtml = modifiedHtml.slice(0, insertPoint + 19) + '\n\n<div class="section" style="padding: 1rem; background-color: #f8f9fa; border-left: 4px solid #2563eb; margin-top: 1rem;"><strong>' + t('toolbox.checkup.ai_analysis', 'AI Analysis') + ':</strong><br/><br/>' + aiHtmlContent + '</div>\n\n' + modifiedHtml.slice(insertPoint + 19);
                    } else {
                        // Fallback
                        modifiedHtml = aiHtmlContent + modifiedHtml;
                    }
                }
            } catch (e) {
                console.warn("[verifyReportWithAI] Failed to parse ai_section_html, injecting fallback raw response.", e);
                let rawResponse = typeof response.response === 'string' ? response.response : JSON.stringify(response.response);

                const insertPoint = modifiedHtml.indexOf('<!-- HEADER_END -->');
                if (insertPoint !== -1) {
                    modifiedHtml = modifiedHtml.slice(0, insertPoint + 19) + '\n\n<div class="section"><div class="section-header">AI Verification Output</div><p>Failed to parse structured response. Raw output:</p><pre>' + rawResponse + '</pre></div>\n\n' + modifiedHtml.slice(insertPoint + 19);
                } else {
                    modifiedHtml = rawResponse + modifiedHtml;
                }
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

                <Section
                    title={t('toolbox.checkup.check_os', 'Check OS')}
                    icon={ShieldCheck}
                    className="flex-[4] min-w-full flex flex-col min-h-0 overflow-hidden"
                    contentClassName="flex-1 flex flex-col md:flex-row gap-4 min-h-0 p-2 overflow-x-auto"
                    menus={
                        <>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={generateGoldenFile}
                                aria-label={t('toolbox.checkup.generate_golden_file', 'Generate Golden File')}
                                title={t('toolbox.checkup.generate_golden_file', 'Generate Golden File')}
                                tooltipPosition='left'
                                disabled={disabled}
                            >
                                <Download size={16} />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleImportGoldenFile}
                                aria-label={t('toolbox.checkup.import_golden_file', 'Import Golden File')}
                                title={t('toolbox.checkup.import_golden_file', 'Import Golden File')}
                                tooltipPosition='left'
                                disabled={disabled}
                            >
                                <FileText size={16} />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsBasePropsModalOpen(true)}
                                aria-label={t('toolbox.checkup.base_props.config_title', 'Base Props Configuration')}
                                title={t('toolbox.checkup.base_props.config_title', 'Base Props Configuration')}
                                tooltipPosition='left'
                                disabled={disabled}
                            >
                                <ListPlus size={16} />
                            </Button>
                        </>
                    }
                    actions={
                        <div className="flex flex-wrap items-center gap-2">
                            {selectedDevice && (
                                <Button
                                    variant="primary"
                                    disabled={disabled || isLoading}
                                    onClick={() => setIsReportModalOpen(true)}
                                    title={t('toolbox.checkup.generate_report', 'Generate Report')}
                                    aria-label={t('toolbox.checkup.generate_report', 'Generate Report')}
                                    tooltipPosition='left'
                                    size="sm"
                                    className="flex items-center gap-2"
                                >
                                    <FileText size={16} />
                                    {t('toolbox.checkup.generate_report', 'Generate Report')}
                                </Button>
                            )}
                        </div>
                    }
                >
                    <div className="flex-1 flex flex-col md:flex-row gap-4 w-full h-full min-h-[400px]">

                        {/* Props Comparison Panel */}
                        <Section
                            title={t('toolbox.checkup.prop_compare', '.prop Compare')}
                            icon={FileText}
                            className="flex-[2] min-w-[350px] flex flex-col min-h-[400px] xl:min-h-0 overflow-hidden"
                            contentClassName="flex-1 flex flex-col min-h-0 pr-2"
                            actions={
                                <>
                                    <div className="relative">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 z-10 pointer-events-none" />
                                        <Input
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            onFocus={() => setIsSearchFocused(true)}
                                            onBlur={() => setIsSearchFocused(false)}
                                            placeholder={isSearchFocused ? t('toolbox.checkup.search_placeholder', 'Search key...') : ''}
                                            className={`pl-9 h-9 text-sm transition-all duration-300 ${isSearchFocused ? "w-36 sm:w-48" : "w-10 cursor-pointer"}`}
                                        />
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <SplitButton
                                            variant="primary"
                                            disabled={disabled || isLoading}
                                            primaryAction={{
                                                label: isSearchFocused ? "" : t('toolbox.checkup.upload_prop', 'Import'),
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
                                </>
                            }
                            menus={
                                <>
                                    <div className="flex items-center gap-2">
                                        {comparisons.length > 0 && (
                                            <span className="text-xs px-2 h-9 flex items-center justify-center text-on-surface rounded-full font-medium whitespace-nowrap">
                                                {matchCount} / {comparisons.length}
                                            </span>
                                        )}
                                    </div>
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
                                </>
                            }
                        >
                            <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
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
                                        {checkResults[check.id]?.goldenExpected !== undefined ? (
                                            checkResults[check.id]?.isGoldenMatch
                                                ? <span data-tooltip={`adb shell ${check.command}`} data-position="left"><CheckCircle2 size={18} className="text-success shrink-0 drop-shadow-sm cursor-help" /></span>
                                                : <span data-tooltip={`adb shell ${check.command}`} data-position="left"><XCircle size={18} className="text-error shrink-0 drop-shadow-sm cursor-help" /></span>
                                        ) : (
                                            <>
                                                {check.status === 'correct' && <span data-tooltip={`adb shell ${check.command}`} data-position="left"><CheckCircle2 size={18} className="text-success shrink-0 drop-shadow-sm cursor-help" /></span>}
                                                {check.status === 'incorrect' && <span data-tooltip={`adb shell ${check.command}`} data-position="left"><XCircle size={18} className="text-error shrink-0 drop-shadow-sm cursor-help" /></span>}
                                            </>
                                        )}
                                    </div>
                                    {check.found && (
                                        <div className="flex justify-between items-center text-xs mt-3 pt-2 border-t border-outline-variant/20">
                                            <div className="flex flex-col gap-1 w-full">
                                                {checkResults[check.id]?.goldenExpected && (
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-on-surface-variant/80 font-medium text-[10px] uppercase tracking-wider">{t('toolbox.checkup.golden', 'Golden')}:</span>
                                                        <span className="font-mono px-2 py-[2px] rounded text-[11px] bg-surface-variant text-on-surface-variant break-all max-w-[70%] text-right opacity-80">
                                                            {checkResults[check.id]?.goldenExpected}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between items-center">
                                                    <span className="text-on-surface-variant/80 font-medium">{t('toolbox.checkup.found', 'Found')}:</span>
                                                    <span className={clsx(
                                                        "font-mono px-2 py-1 rounded-md shadow-inner text-[11px] break-all max-w-[70%] text-right",
                                                        checkResults[check.id]?.goldenExpected !== undefined
                                                            ? (checkResults[check.id]?.isGoldenMatch ? "bg-success/15 text-success" : "bg-error/15 text-error")
                                                            : (check.status === 'correct' ? "bg-success/15 text-success" : "bg-error/15 text-error")
                                                    )}>
                                                        {check.found}
                                                    </span>
                                                </div>
                                            </div>
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
                                        {additionalCheckResults[check.id]?.goldenExpected !== undefined ? (
                                            additionalCheckResults[check.id]?.isGoldenMatch
                                                ? <span data-tooltip={`adb ${check.command.join(' ')}`} data-position="left"><CheckCircle2 size={18} className="text-success shrink-0 drop-shadow-sm cursor-help" /></span>
                                                : <span data-tooltip={`adb ${check.command.join(' ')}`} data-position="left"><Info size={18} className="text-warning shrink-0 drop-shadow-sm cursor-help" /></span>
                                        ) : (
                                            check.status === 'done' && <span data-tooltip={`adb ${check.command.join(' ')}`} data-position="left"><Info size={18} className="text-primary shrink-0 drop-shadow-sm cursor-help" /></span>
                                        )}
                                    </div>
                                    {check.found && (
                                        <div className="flex justify-between items-center text-xs mt-3 pt-2 border-t border-outline-variant/20">
                                            <div className="flex flex-col gap-1 w-full">
                                                {additionalCheckResults[check.id]?.goldenExpected && (
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-on-surface-variant/80 font-medium text-[10px] uppercase tracking-wider">{t('toolbox.checkup.golden', 'Golden')}:</span>
                                                        <span className="font-mono px-2 py-[2px] rounded text-[11px] bg-surface-variant text-on-surface-variant break-all max-w-[70%] text-right opacity-80">
                                                            {additionalCheckResults[check.id]?.goldenExpected}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between items-center">
                                                    <span className="text-on-surface-variant/80 font-medium">{t('toolbox.checkup.found', 'Found')}:</span>
                                                    <span className={clsx(
                                                        "font-mono px-2 py-1 rounded-md shadow-inner text-[11px] break-all max-w-[70%] text-right",
                                                        additionalCheckResults[check.id]?.goldenExpected !== undefined
                                                            ? (additionalCheckResults[check.id]?.isGoldenMatch ? "bg-success/15 text-success" : "bg-warning/15 text-warning")
                                                            : "bg-primary/15 text-primary"
                                                    )}>
                                                        {check.found}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </Section>
                    </div>
                </Section>
                {/* Package Comparisons Panel */}
                {packageComparisons.length > 0 && (
                    <Section
                        title={t('toolbox.checkup.packages_compare', 'Packages Compare')}
                        icon={ShieldCheck}
                        className="col-span-1 md:col-span-2 xl:col-span-1 flex-1 min-w-[280px] flex flex-col min-h-[400px] xl:min-h-0 overflow-hidden"
                        contentClassName="flex flex-col h-full overflow-hidden p-0"
                        actions={
                            <Button
                                variant="secondary"
                                tooltipPosition="left"
                                title={t('toolbox.checkup.clear', 'Clear')}
                                onClick={() => setPackageComparisons([])}
                                className="relative h-9 w-9 p-0 flex items-center justify-center shrink-0 rounded-md"
                            >
                                <XCircle size={16} />
                            </Button>
                        }
                    >
                        <div className="flex-1 h-full min-h-0 bg-surface-variant/10 rounded-xl border border-outline-variant/30 overflow-hidden m-4 mt-0">
                            <div className="h-full overflow-y-auto overflow-x-auto custom-scrollbar">
                                <table className="w-full min-w-[400px] text-left border-collapse text-sm table-fixed">
                                    <thead className="bg-surface-variant/30 backdrop-blur-md sticky top-0 shadow-sm z-10 text-on-surface-variant">
                                        <tr>
                                            <th className="p-3 font-medium border-b border-outline-variant/30 w-5/12">{t('toolbox.checkup.package_name', 'Package')}</th>
                                            <th className="p-3 font-medium border-b border-outline-variant/30 w-3/12">{t('toolbox.checkup.golden', 'Golden')}</th>
                                            <th className="p-3 font-medium border-b border-outline-variant/30 w-3/12">{t('toolbox.checkup.device', 'Device')}</th>
                                            <th className="p-3 font-medium border-b border-outline-variant/30 w-1/12 text-center">{t('toolbox.checkup.status', 'Status')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {packageComparisons.map(c => (
                                            <tr key={c.name} className="border-b border-outline-variant/10 hover:bg-surface-variant/20 transition-colors">
                                                <td className="p-3 font-mono text-[11px] text-on-surface break-words">{c.name}</td>
                                                <td className="p-3 font-mono text-[11px] text-on-surface-variant break-words">{c.goldenVersion || '-'}</td>
                                                <td className={clsx(
                                                    "p-3 font-mono text-[11px] break-words",
                                                    c.isMatch ? "text-success" : (c.isExtra ? "text-warning" : "text-error font-semibold")
                                                )}>
                                                    {c.deviceVersion || <span className="italic opacity-50">{t('toolbox.checkup.status_missing', 'Missing')}</span>}
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
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </Section>
                )}

            </div>

            {/* Base Props Configuration Modal */}
            <Modal
                isOpen={isBasePropsModalOpen}
                onClose={() => setIsBasePropsModalOpen(false)}
                title={t('toolbox.checkup.base_props.config_title', 'Base Props Configuration')}
                className="max-w-2xl w-[90vw]"
            >
                <div className="flex flex-col gap-6 max-h-[70vh] overflow-y-auto pr-2">
                    <p className="text-sm text-on-surface-variant">
                        {t('toolbox.checkup.base_props.config_desc', 'Configure the prefixes used to fetch base properties for the golden file and the properties comparison list.')}
                    </p>
                    <div className="bg-surface-variant/30 p-4 rounded-xl border border-outline-variant/30 flex flex-col gap-4">
                        <TagInput
                            label={t('toolbox.checkup.base_props.prefixes', 'Prefixes (e.g. ro.build)')}
                            tags={basePropsPrefixes}
                            onChange={setBasePropsPrefixes}
                            placeholder={t('toolbox.checkup.base_props.add_prefix', 'Add prefix...')}
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-outline-variant/30">
                    <Button variant="primary" onClick={() => setIsBasePropsModalOpen(false)}>
                        {t('common.done', 'Done')}
                    </Button>
                </div>
            </Modal>

            {/* Report Configuration Modal */}
            <Modal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                title={t('toolbox.checkup.report.config_title', 'Report Configuration')}
                className="max-w-4xl w-[90vw]"
            >
                <div className="flex flex-col gap-8 max-h-[70vh] overflow-y-auto pr-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <ActionCard
                            orientation="vertical"
                            title={t('toolbox.checkup.report.prop_compare_title', 'Show .prop Comparison')}
                            description={t('toolbox.checkup.report.prop_compare_desc', 'Show .prop comparison results if executed')}
                            selected={reportPropsCompare !== 'none'}
                            onClick={() => setReportPropsCompare(prev => prev === 'none' ? 'all' : 'none')}
                        >
                            {reportPropsCompare !== 'none' && (
                                <Button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={reportPropsCompare === 'divergent'}
                                    onClick={(e) => { e.stopPropagation(); setReportPropsCompare(reportPropsCompare === 'divergent' ? 'all' : 'divergent'); }}
                                    className="flex items-center gap-2.5 text-left focus:outline-none select-none cursor-pointer group bg-transparent shadow-none hover:bg-transparent p-0 h-auto mt-2"
                                >
                                    <div className={clsx(
                                        "w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 cursor-pointer",
                                        reportPropsCompare === 'divergent'
                                            ? "bg-primary border-primary text-on-primary"
                                            : "border-outline-variant/30 bg-surface/50 group-hover:border-outline"
                                    )}>
                                        {reportPropsCompare === 'divergent' && (
                                            <div className="w-2 h-2 bg-on-primary rounded-2xl animate-in zoom-in-50 duration-200" />
                                        )}
                                    </div>
                                    <span className="text-sm text-on-surface-variant font-medium select-none cursor-pointer">
                                        {t('toolbox.checkup.report.only_divergent', 'Show only values that do not match')}
                                    </span>
                                </Button>
                            )}
                        </ActionCard>

                        <ActionCard
                            orientation="vertical"
                            title={t('toolbox.checkup.report.standard_checks_title_alt', 'Show Standard Checks')}
                            description={t('toolbox.checkup.report.standard_checks_desc', 'Show standard checks results if executed')}
                            selected={reportStandardChecks !== 'none'}
                            onClick={() => setReportStandardChecks(prev => prev === 'none' ? 'all' : 'none')}
                        >
                            {reportStandardChecks !== 'none' && (
                                <Button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={reportStandardChecks === 'divergent'}
                                    onClick={(e) => { e.stopPropagation(); setReportStandardChecks(reportStandardChecks === 'divergent' ? 'all' : 'divergent'); }}
                                    className="flex items-center gap-2.5 text-left focus:outline-none select-none cursor-pointer group bg-transparent shadow-none hover:bg-transparent p-0 h-auto mt-2"
                                >
                                    <div className={clsx(
                                        "w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 cursor-pointer",
                                        reportStandardChecks === 'divergent'
                                            ? "bg-primary border-primary text-on-primary"
                                            : "border-outline-variant/30 bg-surface/50 group-hover:border-outline"
                                    )}>
                                        {reportStandardChecks === 'divergent' && (
                                            <div className="w-2 h-2 bg-on-primary rounded-2xl animate-in zoom-in-50 duration-200" />
                                        )}
                                    </div>
                                    <span className="text-sm text-on-surface-variant font-medium select-none cursor-pointer">
                                        {t('toolbox.checkup.report.only_divergent', 'Show only values that do not match')}
                                    </span>
                                </Button>
                            )}
                        </ActionCard>

                        <ActionCard
                            orientation="vertical"
                            title={t('toolbox.checkup.report.additional_checks_title_alt', 'Show Additional Checks')}
                            description={t('toolbox.checkup.report.additional_checks_desc', 'Show additional checks results if executed')}
                            selected={reportAdditionalChecks !== 'none'}
                            onClick={() => setReportAdditionalChecks(prev => prev === 'none' ? 'all' : 'none')}
                        >
                            {reportAdditionalChecks !== 'none' && (
                                <Button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={reportAdditionalChecks === 'divergent'}
                                    onClick={(e) => { e.stopPropagation(); setReportAdditionalChecks(reportAdditionalChecks === 'divergent' ? 'all' : 'divergent'); }}
                                    className="flex items-center gap-2.5 text-left focus:outline-none select-none cursor-pointer group bg-transparent shadow-none hover:bg-transparent p-0 h-auto mt-2"
                                >
                                    <div className={clsx(
                                        "w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 cursor-pointer",
                                        reportAdditionalChecks === 'divergent'
                                            ? "bg-primary border-primary text-on-primary"
                                            : "border-outline-variant/30 bg-surface/50 group-hover:border-outline"
                                    )}>
                                        {reportAdditionalChecks === 'divergent' && (
                                            <div className="w-2 h-2 bg-on-primary rounded-2xl animate-in zoom-in-50 duration-200" />
                                        )}
                                    </div>
                                    <span className="text-sm text-on-surface-variant font-medium select-none cursor-pointer">
                                        {t('toolbox.checkup.report.only_divergent', 'Show only values that do not match')}
                                    </span>
                                </Button>
                            )}
                        </ActionCard>
                    </div>

                    <div>
                        <h3 className="text-sm font-semibold text-on-surface mb-3">{t('toolbox.checkup.report.advanced_filters', 'Advanced Filters')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <ActionCard
                                orientation="vertical"
                                title={t('toolbox.checkup.report.packages_title_alt', 'Show Packages')}
                                description={t('toolbox.checkup.report.packages_desc', 'Show packages results if executed')}
                                selected={reportPackages !== 'none'}
                                onClick={() => setReportPackages(prev => prev === 'none' ? 'all' : 'none')}
                            >
                                {reportPackages !== 'none' && (
                                    <div className="flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                                        <Button
                                            type="button"
                                            role="checkbox"
                                            aria-checked={reportPackages === 'divergent'}
                                            onClick={(e) => { e.stopPropagation(); setReportPackages(reportPackages === 'divergent' ? 'all' : 'divergent'); }}
                                            className="flex items-center gap-2.5 text-left focus:outline-none select-none cursor-pointer group bg-transparent shadow-none hover:bg-transparent p-0 h-auto mt-2"
                                        >
                                            <div className={clsx(
                                                "w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 cursor-pointer",
                                                reportPackages === 'divergent'
                                                    ? "bg-primary border-primary text-on-primary"
                                                    : "border-outline-variant/30 bg-surface/50 group-hover:border-outline"
                                            )}>
                                                {reportPackages === 'divergent' && (
                                                    <div className="w-2 h-2 bg-on-primary rounded-2xl animate-in zoom-in-50 duration-200" />
                                                )}
                                            </div>
                                            <span className="text-sm text-on-surface-variant font-medium select-none cursor-pointer">
                                                {t('toolbox.checkup.report.only_divergent', 'Show only values that do not match')}
                                            </span>
                                        </Button>
                                        <div className="grid grid-cols-2 gap-2 mt-4">
                                            <Button
                                                variant={packageFilterMode === 'exclude' ? 'primary' : 'outline'}
                                                size="sm"
                                                onClick={() => setPackageFilterMode('exclude')}
                                            >
                                                {t('toolbox.checkup.report.btn_exclude', 'Show all except...')}
                                            </Button>
                                            <Button
                                                variant={packageFilterMode === 'include' ? 'primary' : 'outline'}
                                                size="sm"
                                                onClick={() => setPackageFilterMode('include')}
                                            >
                                                {t('toolbox.checkup.report.btn_include', 'Show ONLY...')}
                                            </Button>
                                        </div>
                                        <TagInput
                                            label=""
                                            tags={packageFilterPrefixes}
                                            onChange={setPackageFilterPrefixes}
                                            placeholder={t('toolbox.checkup.report.add_prefix', 'Add prefix...')}
                                        />
                                    </div>
                                )}
                            </ActionCard>

                            <ActionCard
                                orientation="vertical"
                                title={t('toolbox.checkup.report.extra_props_title', 'Show Extra Properties')}
                                description={t('toolbox.checkup.report.extra_props_desc', 'Show device extra properties')}
                                selected={reportShowPropsBase}
                                onClick={() => setReportShowPropsBase(!reportShowPropsBase)}
                            >
                                {reportShowPropsBase && (
                                    <div className="flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                                        <div className="grid grid-cols-2 gap-2 mt-4">
                                            <Button
                                                variant={propsFilterMode === 'exclude' ? 'primary' : 'outline'}
                                                size="sm"
                                                onClick={() => setPropsFilterMode('exclude')}
                                            >
                                                {t('toolbox.checkup.report.btn_exclude', 'Show all except...')}
                                            </Button>
                                            <Button
                                                variant={propsFilterMode === 'include' ? 'primary' : 'outline'}
                                                size="sm"
                                                onClick={() => setPropsFilterMode('include')}
                                            >
                                                {t('toolbox.checkup.report.btn_include', 'Show ONLY...')}
                                            </Button>
                                        </div>
                                        <TagInput
                                            label=""
                                            tags={propsFilterPrefixes}
                                            onChange={setPropsFilterPrefixes}
                                            placeholder={t('toolbox.checkup.report.add_prefix', 'Add prefix...')}
                                        />
                                    </div>
                                )}
                            </ActionCard>
                        </div>
                    </div>
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

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from '@/lib/settings';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile, readFile } from '@tauri-apps/plugin-fs';
import { tempDir, join } from '@tauri-apps/api/path';
import { Button } from '@/components/atoms/Button';
import {
    Upload, ShieldCheck, CheckCircle2, XCircle, Search, FileText,
    ListPlus, Info, Download, Filter, FilterX, Play, Plus, Trash2,
    Edit3, Tv, Smartphone, Image as ImageIcon, RefreshCw,
    Layers, CheckSquare, ChevronRight, ChevronDown,
    SlidersHorizontal, Eye, AlertTriangle, FileCheck, Clock, RotateCcw
} from 'lucide-react';
import { Section } from '@/components/organisms/Section';
import { Modal } from '@/components/organisms/Modal';
import { TagInput } from '@/components/atoms/TagInput';
import { Input } from '@/components/atoms/Input';
import { Textarea } from '@/components/atoms/Textarea';
import { SplitButton } from '@/components/molecules/SplitButton';
import { askAgent } from '@/lib/ai/agentService';
import { getReportVerificationPrompt } from '@/lib/dashboard/prompts';
import clsx from 'clsx';
import { ExpressiveLoading } from '@/components/atoms/ExpressiveLoading';
import { toast } from 'sonner';
import { useCompanion } from '@/hooks/useCompanion';
import { FileSavedFeedback } from '@/components/molecules/FileSavedFeedback';
import { addTemporaryReport } from '@/lib/reportsCache';

export function matchesFilterPattern(text: string, pattern: string): boolean {
    if (!text || !pattern) return false;
    const trimmed = pattern.trim();
    if (!trimmed) return false;
    if (trimmed.includes('*')) {
        const regexStr = '^' + trimmed
            .split('*')
            .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('.*') + '$';
        try {
            return new RegExp(regexStr, 'i').test(text);
        } catch (e) {
            return text.toLowerCase().includes(trimmed.toLowerCase());
        }
    }
    return text.startsWith(trimmed) || text.includes(trimmed);
}

export function extractTextsFromXml(xmlOrJsonString: string): string[] {
    if (!xmlOrJsonString) return [];
    const texts: string[] = [];
    const seen = new Set<string>();

    const addText = (val: any) => {
        if (typeof val === 'string') {
            const trimmed = val.trim();
            if (trimmed.length > 0 && !seen.has(trimmed)) {
                seen.add(trimmed);
                texts.push(trimmed);
            }
        }
    };

    const trimmedInput = xmlOrJsonString.trim();

    // 1. Check if input is JSON (from Companion /xml or /ui-tree REST API)
    if (trimmedInput.startsWith('{') || trimmedInput.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmedInput);

            // If JSON contains nested raw XML string (e.g. { xml: "..." })
            if (typeof parsed.xml === 'string' && parsed.xml.trim().length > 0) {
                return extractTextsFromXml(parsed.xml);
            }

            // Recursive JSON walker for Companion UI Tree node objects
            const extractFromJson = (obj: any) => {
                if (!obj || typeof obj !== 'object') return;
                if (Array.isArray(obj)) {
                    obj.forEach(extractFromJson);
                    return;
                }
                for (const key of Object.keys(obj)) {
                    const val = obj[key];
                    const lowerKey = key.toLowerCase();
                    if (lowerKey === 'text' || lowerKey === 'contentdesc' || lowerKey === 'content-desc' || lowerKey === 'contentdescription' || lowerKey === 'label' || lowerKey === 'title' || lowerKey === 'value' || lowerKey === 'name') {
                        addText(val);
                    }
                    if (typeof val === 'object') {
                        extractFromJson(val);
                    }
                }
            };

            extractFromJson(parsed);
            if (texts.length > 0) return texts;
        } catch (_) {
            // Not JSON, continue to XML
        }
    }

    // 2. DOMParser for standard XML (uiautomator dump or Companion raw XML)
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlOrJsonString, 'text/xml');
        const allElements = doc.getElementsByTagName('*');
        for (let i = 0; i < allElements.length; i++) {
            const el = allElements[i];
            const textAttr = el.getAttribute('text');
            const descAttr = el.getAttribute('content-desc');
            const labelAttr = el.getAttribute('label');
            const titleAttr = el.getAttribute('title');

            if (textAttr) addText(textAttr);
            if (descAttr) addText(descAttr);
            if (labelAttr) addText(labelAttr);
            if (titleAttr) addText(titleAttr);
        }
    } catch (_) { }

    return texts;
}

export interface UiTextCheckConfig {
    id: string;
    name: string;
    activity: string;
    delayMs?: number;
    enabled: boolean;
    expectedTexts?: string[];
    foundTexts?: string[];
    isGoldenMatch?: boolean;
    status?: 'idle' | 'running' | 'done';
}

export function toPersistableUiTextCheck(check: UiTextCheckConfig): UiTextCheckConfig {
    return {
        id: check.id,
        name: check.name,
        activity: check.activity,
        delayMs: check.delayMs,
        enabled: check.enabled,
        expectedTexts: check.expectedTexts
    };
}

export interface PropComparison {
    key: string;
    expected: string;
    found: string;
    isMatch: boolean;
    isExtra?: boolean;
}

export interface PackageComparison {
    name: string;
    goldenVersion?: string;
    deviceVersion?: string;
    isMatch: boolean;
    isMissing: boolean;
    isExtra: boolean;
}

export interface PackageInfo {
    name: string;
    version: string;
    is_system: boolean;
}

export interface ManualCheckItem {
    id: string;
    name: string;
    type: 'text' | 'image';
    valueText?: string;
    valueImageBase64?: string;
    status: 'pass' | 'fail' | 'na';
    notes?: string;
}

export interface CompanionBddSuite {
    id: string;
    name: string;
    targetPackage: string;
    lastModified: number;
    lastReport?: {
        reportId: string;
        suiteName: string;
        targetPackage: string;
        startTime: number;
        endTime: number;
        totalScenarios: number;
        passedScenarios: number;
        failedScenarios: number;
        testCases: Array<{
            name: string;
            status: string;
            durationMs: number;
            steps: Array<{
                keyword: string;
                args: string[];
                status: string;
                durationMs: number;
                errorMessage?: string;
            }>;
        }>;
        logs: string[];
    };
}

interface CheckupCacheEntry {
    comparisons: PropComparison[];
    devicePropsCache: Record<string, string>;
    checkResults: Record<string, any>;
    additionalCheckResults: Record<string, any>;
    packageComparisons: PackageComparison[];
    devicePackages?: PackageInfo[];
    uiTextChecks?: UiTextCheckConfig[];
    interactiveTestResults?: Record<string, boolean | null>;
    manualChecks?: ManualCheckItem[];
    companionBddSuites?: CompanionBddSuite[];
    verifiedSections?: Record<string, boolean>;
}

const checkupCacheMap = new Map<string, CheckupCacheEntry>();

async function callCompanionRest<T = any>(endpoint: string, method = 'GET', payload?: any): Promise<T | null> {
    try {
        const rawJson = await invoke<string>('trigger_companion_action', {
            port: 9876,
            endpoint,
            method,
            payload: payload ? JSON.stringify(payload) : undefined
        });
        return JSON.parse(rawJson) as T;
    } catch (_) {
        try {
            const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
            const res = await fetch(`http://127.0.0.1:9876${cleanEndpoint}`, {
                method,
                headers: payload ? { 'Content-Type': 'application/json; charset=utf-8' } : undefined,
                body: payload ? JSON.stringify(payload) : undefined
            });
            if (res.ok) return (await res.json()) as T;
        } catch (_) {}
        return null;
    }
}

const normalizePropVal = (v: string | undefined | null): string => {
    if (v === undefined || v === null) return '';
    const trimmed = String(v).trim();
    return (trimmed === '-' || trimmed === 'null' || trimmed === 'undefined') ? '' : trimmed;
};

interface CheckupSubTabProps {
    selectedDevice: string | null;
    isTestRunning?: boolean;
    allowActionsDuringTest?: boolean;
}

export const CheckupSubTab = ({ selectedDevice, isTestRunning, allowActionsDuringTest }: CheckupSubTabProps) => {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const { status: companionStatus } = useCompanion(selectedDevice);
    const cachedCheckup = selectedDevice ? checkupCacheMap.get(selectedDevice) : undefined;

    const [isLoading, setIsLoading] = useState(false);
    const [comparisons, setComparisons] = useState<PropComparison[]>(() => cachedCheckup?.comparisons ?? []);
    const [devicePropsCache, setDevicePropsCache] = useState<Record<string, string>>(() => cachedCheckup?.devicePropsCache ?? {});
    const [filterDivergent, setFilterDivergent] = useState(false);
    const [onlyFailures] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearchFocused, setIsSearchFocused] = useState(false);

    // Packages & Apps state
    const [devicePackages, setDevicePackages] = useState<PackageInfo[]>(() => cachedCheckup?.devicePackages ?? []);
    const [isLoadingPackages, setIsLoadingPackages] = useState(false);
    const [packageSearchQuery, setPackageSearchQuery] = useState("");
    const [packageComparisons, setPackageComparisons] = useState<PackageComparison[]>(() => cachedCheckup?.packageComparisons ?? []);

    // Section Verification ("Conferido") state
    const [verifiedSections, setVerifiedSections] = useState<Record<string, boolean>>(() => {
        return cachedCheckup?.verifiedSections ?? {
            props: false,
            packages: false,
            standardChecks: false,
            additionalChecks: false,
            companionBdd: false,
            manualChecks: false,
            uiTextChecks: false,
            interactiveTests: false
        };
    });

    const toggleSectionVerified = (sectionKey: string) => {
        setVerifiedSections(prev => {
            const next = { ...prev, [sectionKey]: !prev[sectionKey] };
            return next;
        });
    };

    // Manual Checks state
    const [manualChecks, setManualChecks] = useState<ManualCheckItem[]>(() => {
        if (cachedCheckup?.manualChecks) return cachedCheckup.manualChecks;
        const stored = localStorage.getItem('checkup_manualChecks');
        return stored ? JSON.parse(stored) : [];
    });
    const [isManualCheckModalOpen, setIsManualCheckModalOpen] = useState(false);
    const [editingManualCheck, setEditingManualCheck] = useState<ManualCheckItem | null>(null);
    const [manualCheckName, setManualCheckName] = useState('');
    const [manualCheckType, setManualCheckType] = useState<'text' | 'image'>('text');
    const [manualCheckValueText, setManualCheckValueText] = useState('');
    const [manualCheckValueImage, setManualCheckValueImage] = useState<string | undefined>(undefined);
    const [manualCheckStatus, setManualCheckStatus] = useState<'pass' | 'fail' | 'na'>('pass');
    const [manualCheckNotes, setManualCheckNotes] = useState('');
    const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);

    useEffect(() => {
        localStorage.setItem('checkup_manualChecks', JSON.stringify(manualChecks));
    }, [manualChecks]);

    // Companion BDD Tests state
    const [companionBddSuites, setCompanionBddSuites] = useState<CompanionBddSuite[]>(() => cachedCheckup?.companionBddSuites ?? []);
    const [isLoadingCompanionTests, setIsLoadingCompanionTests] = useState(false);
    const [expandedSuiteId, setExpandedSuiteId] = useState<string | null>(null);

    // Report configuration & Analyst Name
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [isAiVerifyModalOpen, setIsAiVerifyModalOpen] = useState(false);
    const [aiRequirementsPrompt, setAiRequirementsPrompt] = useState("");
    const [isAiVerifying, setIsAiVerifying] = useState(false);
    const [reportAnalystName, setReportAnalystName] = useState(() => {
        return localStorage.getItem('checkup_reportAnalystName') || '';
    });
    const [reportResult, setReportResult] = useState<'approved' | 'rejected' | 'pending'>(() => {
        return (localStorage.getItem('checkup_reportResult') as any) || 'approved';
    });
    const [reportComments, setReportComments] = useState<string>(() => {
        return localStorage.getItem('checkup_reportComments') || '';
    });

    const [reportPropsCompare, setReportPropsCompare] = useState<'all' | 'divergent' | 'none'>(() => {
        return (localStorage.getItem('checkup_reportPropsCompare') as any) || 'all';
    });
    const [reportShowPropsBase] = useState(() => {
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
    const [reportShowCompanionBdd, setReportShowCompanionBdd] = useState<'all' | 'divergent' | 'none'>(() => {
        const val = localStorage.getItem('checkup_reportShowCompanionBdd');
        if (val === 'divergent' || val === 'all' || val === 'none') return val;
        return val === 'false' ? 'none' : 'all';
    });
    const [reportShowManualChecks, setReportShowManualChecks] = useState<'all' | 'divergent' | 'none'>(() => {
        const val = localStorage.getItem('checkup_reportShowManualChecks');
        if (val === 'divergent' || val === 'all' || val === 'none') return val;
        return val === 'false' ? 'none' : 'all';
    });
    const [reportShowUiTexts, setReportShowUiTexts] = useState<'all' | 'divergent' | 'none'>(() => {
        const val = localStorage.getItem('checkup_reportShowUiTexts');
        if (val === 'divergent' || val === 'all' || val === 'none') return val;
        return val === 'false' ? 'none' : 'all';
    });
    const [reportShowInteractiveTests, setReportShowInteractiveTests] = useState<'all' | 'divergent' | 'none'>(() => {
        const val = localStorage.getItem('checkup_reportShowInteractiveTests');
        if (val === 'divergent' || val === 'all' || val === 'none') return val;
        return val === 'false' ? 'none' : 'all';
    });

    const [packageFilterMode, setPackageFilterMode] = useState<'exclude' | 'include'>(() => {
        return (localStorage.getItem('checkup_packageFilterMode') as any) || 'exclude';
    });
    const [packageFilterPrefixes, setPackageFilterPrefixes] = useState<string[]>(() => {
        const stored = localStorage.getItem('checkup_packageFilterPrefixes');
        return stored ? JSON.parse(stored) : ['android', 'com.android', 'com.google'];
    });
    const [propsFilterMode] = useState<'exclude' | 'include'>(() => {
        return (localStorage.getItem('checkup_propsFilterMode') as any) || 'exclude';
    });
    const [propsFilterPrefixes] = useState<string[]>(() => {
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

    const [lastSavedReport, setLastSavedReport] = useState<string | null>(null);

    useEffect(() => {
        localStorage.setItem('checkup_reportAnalystName', reportAnalystName);
        localStorage.setItem('checkup_reportPropsCompare', reportPropsCompare);
        localStorage.setItem('checkup_reportShowPropsBase', String(reportShowPropsBase));
        localStorage.setItem('checkup_reportStandardChecks', reportStandardChecks);
        localStorage.setItem('checkup_reportAdditionalChecks', reportAdditionalChecks);
        localStorage.setItem('checkup_reportPackages', reportPackages);
        localStorage.setItem('checkup_reportShowCompanionBdd', reportShowCompanionBdd);
        localStorage.setItem('checkup_reportShowManualChecks', reportShowManualChecks);
        localStorage.setItem('checkup_reportShowUiTexts', reportShowUiTexts);
        localStorage.setItem('checkup_reportShowInteractiveTests', reportShowInteractiveTests);
        localStorage.setItem('checkup_packageFilterMode', packageFilterMode);
        localStorage.setItem('checkup_packageFilterPrefixes', JSON.stringify(packageFilterPrefixes));
        localStorage.setItem('checkup_propsFilterMode', propsFilterMode);
        localStorage.setItem('checkup_propsFilterPrefixes', JSON.stringify(propsFilterPrefixes));
        localStorage.setItem('checkup_basePropsPrefixes', JSON.stringify(basePropsPrefixes));
    }, [
        reportAnalystName, reportPropsCompare, reportShowPropsBase, reportStandardChecks,
        reportAdditionalChecks, reportPackages, reportShowCompanionBdd, reportShowManualChecks,
        reportShowUiTexts, reportShowInteractiveTests, packageFilterMode, packageFilterPrefixes,
        propsFilterMode, propsFilterPrefixes, basePropsPrefixes
    ]);

    // Standard checks based on POS Checklist
    const [checkResults, setCheckResults] = useState<Record<string, { status: 'idle' | 'running' | 'correct' | 'incorrect', found?: string, goldenExpected?: string, isGoldenMatch?: boolean }>>(() => cachedCheckup?.checkResults ?? {});
    const [additionalCheckResults, setAdditionalCheckResults] = useState<Record<string, { status: 'idle' | 'running' | 'done', found?: string, goldenExpected?: string, isGoldenMatch?: boolean }>>(() => cachedCheckup?.additionalCheckResults ?? {});
    const [interactiveTestResults, setInteractiveTestResults] = useState<Record<string, boolean | null>>(() => cachedCheckup?.interactiveTestResults ?? {});

    // UI Text / Screen Checks state
    const [uiTextChecks, setUiTextChecks] = useState<UiTextCheckConfig[]>(() => {
        if (cachedCheckup?.uiTextChecks) return cachedCheckup.uiTextChecks;
        const stored = localStorage.getItem('checkup_uiTextChecks');
        if (stored) {
            try {
                const parsed: UiTextCheckConfig[] = JSON.parse(stored);
                return parsed.map(c => ({ ...toPersistableUiTextCheck(c), status: 'idle' as const }));
            } catch (_) { }
        }
        return [
            {
                id: 'ui_test',
                name: 'UI Test',
                activity: 'com.android.settings',
                delayMs: 1500,
                enabled: true
            }
        ];
    });

    const [isUiCheckModalOpen, setIsUiCheckModalOpen] = useState(false);
    const [editingUiCheck, setEditingUiCheck] = useState<UiTextCheckConfig | null>(null);
    const [uiCheckNameInput, setUiCheckNameInput] = useState('');
    const [uiCheckActivityInput, setUiCheckActivityInput] = useState('');
    const [uiCheckDelayInput, setUiCheckDelayInput] = useState('1500');
    const [expandedUiCheckIds, setExpandedUiCheckIds] = useState<Set<string>>(new Set());

    const toggleExpandUiCheck = (id: string) => {
        setExpandedUiCheckIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    useEffect(() => {
        localStorage.setItem('checkup_uiTextChecks', JSON.stringify(uiTextChecks.map(toPersistableUiTextCheck)));
    }, [uiTextChecks]);

    // Fetch installed packages from ADB
    const fetchInstalledPackages = useCallback(async () => {
        if (!selectedDevice) return;
        setIsLoadingPackages(true);
        try {
            const pkgs = await invoke<PackageInfo[]>("get_installed_packages", { device: selectedDevice });
            setDevicePackages(pkgs);
        } catch (e) {
            console.error("Failed to fetch packages:", e);
        } finally {
            setIsLoadingPackages(false);
        }
    }, [selectedDevice]);

    // Fetch companion BDD suites and execution reports
    const fetchCompanionBddTests = useCallback(async () => {
        if (!selectedDevice) return;
        setIsLoadingCompanionTests(true);
        try {
            try {
                await invoke('start_companion_forward', { device: selectedDevice, localPort: 9876, remotePort: 9876 });
            } catch (_) {}

            let data = await callCompanionRest<{ status: string; suites: any[] }>('/rrt/suites');
            if (!data || data.status !== 'ok' || !Array.isArray(data.suites) || data.suites.length === 0) {
                data = await callCompanionRest<{ status: string; suites: any[] }>('/bdd/suites');
            }
            if (data && data.status === 'ok' && Array.isArray(data.suites) && data.suites.length > 0) {
                setCompanionBddSuites(data.suites);
                return;
            }

            // Fallback via ADB to list files if REST is unavailable
            try {
                const output: string = await invoke('run_adb_command', {
                    device: selectedDevice,
                    args: ['shell', 'ls', '/data/data/com.lucasdeeiroz.robotrunner/files/rrt_suites']
                });
                if (output && !output.includes('No such file') && !output.includes('not found') && !output.includes('Permission denied')) {
                    const fileNames = output.split(/\s+/).filter(f => f.startsWith('suite_') || f.startsWith('report_'));
                    const suites: CompanionBddSuite[] = [];
                    for (const file of fileNames) {
                        try {
                            const content: string = await invoke('run_adb_command', {
                                device: selectedDevice,
                                args: ['shell', 'cat', `/data/data/com.lucasdeeiroz.robotrunner/files/rrt_suites/${file}`]
                            });
                            const parsed = JSON.parse(content);
                            suites.push({
                                id: parsed.id || file,
                                name: parsed.name || parsed.suiteName || file,
                                targetPackage: parsed.targetPackage || '',
                                lastModified: parsed.lastModified || parsed.endTime || Date.now(),
                                lastReport: parsed.lastReport || (parsed.testCases ? parsed : undefined)
                            });
                        } catch (_) { }
                    }
                    if (suites.length > 0) setCompanionBddSuites(suites);
                }
            } catch (_) { }
        } catch (e) {
            console.error("Failed to sync Companion BDD tests:", e);
        } finally {
            setIsLoadingCompanionTests(false);
        }
    }, [selectedDevice]);

    // Initial load on device change
    useEffect(() => {
        if (selectedDevice) {
            fetchInstalledPackages();
            fetchCompanionBddTests();
        }
    }, [selectedDevice, fetchInstalledPackages, fetchCompanionBddTests]);

    // Auto-sync Companion specs & tests
    useEffect(() => {
        if (selectedDevice) {
            const syncCompanionSpecs = async () => {
                try {
                    try {
                        await invoke('start_companion_forward', { device: selectedDevice, localPort: 9876, remotePort: 9876 });
                    } catch (_) {}

                    const c = await callCompanionRest<any>('/device/info');
                    if (c && c.status === 'ok') {
                        const newProps: Record<string, string> = {};
                        if (c.manufacturer) newProps['ro.product.manufacturer'] = c.manufacturer;
                        if (c.model) newProps['ro.product.model'] = c.model;
                        if (c.brand) newProps['ro.product.brand'] = c.brand;
                        if (c.androidVersion) newProps['ro.build.version.release'] = c.androidVersion;
                        if (c.sdkInt) newProps['ro.build.version.sdk'] = String(c.sdkInt);
                        if (c.serial) newProps['ro.serialno'] = c.serial;
                        if (c.specs && typeof c.specs === 'object') {
                            for (const [k, v] of Object.entries(c.specs)) {
                                if (v !== undefined && v !== null && String(v).trim() !== '') {
                                    newProps[k] = String(v);
                                }
                            }
                        }
                        setDevicePropsCache(prev => ({ ...prev, ...newProps }));

                        // Map battery & storage into additional check results if present
                        if (c.battery && typeof c.battery === 'object' && c.battery.level !== undefined) {
                            setAdditionalCheckResults(prev => ({
                                ...prev,
                                battery: {
                                    status: 'done',
                                    found: `${c.battery.level >= 0 ? `${c.battery.level}%` : 'N/A'} (${c.battery.isCharging ? 'Charging' : 'Discharging'}, ${c.battery.voltage || 0}V, ${c.battery.temperature || 0}°C, ${c.battery.health || 'Good'})`
                                }
                            }));
                        }
                    }
                } catch (_) { }

                try {
                    const results = await callCompanionRest<Record<string, boolean | null>>('/hardware/interactive-tests');
                    if (results && typeof results === 'object' && Object.keys(results).length > 0) {
                        setInteractiveTestResults(prev => ({ ...prev, ...results }));
                    }
                } catch (_) { }
            };
            syncCompanionSpecs();
            const interval = setInterval(syncCompanionSpecs, 10000);
            return () => clearInterval(interval);
        }
    }, [selectedDevice]);

    // Push additional specs to Companion
    useEffect(() => {
        if (selectedDevice && Object.keys(additionalCheckResults).length > 0) {
            const payload: Record<string, string> = {};
            for (const [key, result] of Object.entries(additionalCheckResults)) {
                if (result.status === 'done' && result.found && result.found !== t('toolbox.checkup.not_found', 'Not found')) {
                    payload[key] = result.found;
                }
            }
            if (Object.keys(payload).length > 0) {
                callCompanionRest('/hardware/additional-specs', 'POST', payload)
                    .catch((e: unknown) => console.error("Failed to push specs to Companion", e));
            }
        }
    }, [additionalCheckResults, selectedDevice, t]);

    // Sync cache on change
    useEffect(() => {
        if (selectedDevice) {
            checkupCacheMap.set(selectedDevice, {
                comparisons,
                devicePropsCache,
                checkResults,
                additionalCheckResults,
                packageComparisons,
                devicePackages,
                uiTextChecks,
                interactiveTestResults,
                manualChecks,
                companionBddSuites,
                verifiedSections
            });
        }
    }, [
        selectedDevice, comparisons, devicePropsCache, checkResults,
        additionalCheckResults, packageComparisons, devicePackages,
        uiTextChecks, interactiveTestResults, manualChecks,
        companionBddSuites, verifiedSections
    ]);

    const runSingleUiTextCheck = async (check: UiTextCheckConfig) => {
        if (!selectedDevice) return;
        setUiTextChecks(prev => prev.map(c => c.id === check.id ? { ...c, status: 'running' } : c));
        try {
            if (check.activity && check.activity.trim()) {
                const rawAct = check.activity.trim();
                const safeAct = rawAct.includes('$') ? rawAct.replace(/\$/g, '\\$') : rawAct;
                const args = rawAct.startsWith('am start')
                    ? ['shell', ...rawAct.split(/\s+/)]
                    : (rawAct.startsWith('shell ') ? rawAct.split(/\s+/) : ['shell', 'am', 'start', '-n', safeAct]);
                await invoke('run_adb_command', { device: selectedDevice, args });
                await new Promise(r => setTimeout(r, check.delayMs || 1500));
            }

            let xmlContent = '';
            try {
                const text: string = await invoke('fetch_companion_ui_tree', { port: 9876 });
                if (text && (text.includes('nodes') || text.includes('text') || text.includes('status'))) {
                    xmlContent = text;
                }
            } catch (_) { }

            if (!xmlContent) {
                const dumpPath = '/sdcard/window_dump.xml';
                try {
                    await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'uiautomator', 'dump', dumpPath] });
                } catch (e) { }
                xmlContent = await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'cat', dumpPath] });
            }

            const extractedTexts = extractTextsFromXml(xmlContent);
            let isGoldenMatch: boolean | undefined = undefined;

            if (check.expectedTexts && check.expectedTexts.length > 0) {
                const expectedNormalized = check.expectedTexts.map(t => t.replace(/\s+/g, ' ').trim());
                const foundNormalized = extractedTexts.map(t => t.replace(/\s+/g, ' ').trim());
                const exactOrderMatch = expectedNormalized.length === foundNormalized.length &&
                    expectedNormalized.every((val, idx) => val === foundNormalized[idx]);
                const setMatch = expectedNormalized.length === foundNormalized.length &&
                    [...expectedNormalized].sort().every((val, idx) => val === [...foundNormalized].sort()[idx]);
                isGoldenMatch = exactOrderMatch || setMatch;
            }

            setUiTextChecks(prev => prev.map(c => c.id === check.id ? {
                ...c,
                foundTexts: extractedTexts,
                isGoldenMatch,
                status: 'done'
            } : c));

            // Auto-expand this check card so user immediately sees results
            setExpandedUiCheckIds(prev => new Set(prev).add(check.id));
        } catch (error) {
            console.error('Failed to run UI text check:', error);
            setUiTextChecks(prev => prev.map(c => c.id === check.id ? { ...c, status: 'idle' } : c));
            toast.error(t('toolbox.checkup.ui_check_error', 'Failed to run UI text check'), { id: 'ui-check-error' });
        }
    };

    const runAllUiTextChecks = async () => {
        if (!selectedDevice) return;
        for (const check of uiTextChecks) {
            if (check.enabled) {
                await runSingleUiTextCheck(check);
            }
        }
    };

    const isGoldenLoaded = useMemo(() => {
        return comparisons.length > 0 ||
            packageComparisons.some(p => p.goldenVersion !== undefined) ||
            Object.values(checkResults).some(r => r.goldenExpected !== undefined) ||
            Object.values(additionalCheckResults).some(r => r.goldenExpected !== undefined) ||
            uiTextChecks.some(c => c.expectedTexts && c.expectedTexts.length > 0);
    }, [comparisons, packageComparisons, checkResults, additionalCheckResults, uiTextChecks]);

    const handleClearGolden = () => {
        setComparisons([]);
        setPackageComparisons([]);
        setCheckResults(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(k => {
                if (next[k]) {
                    delete next[k].goldenExpected;
                    delete next[k].isGoldenMatch;
                }
            });
            return next;
        });
        setAdditionalCheckResults(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(k => {
                if (next[k]) {
                    delete next[k].goldenExpected;
                    delete next[k].isGoldenMatch;
                }
            });
            return next;
        });
        setUiTextChecks(prev => prev.map(c => ({
            ...c,
            expectedTexts: [],
            isGoldenMatch: undefined
        })));
        setFilterDivergent(false);
        setReportPropsCompare(prev => prev === 'divergent' ? 'all' : prev);
        setReportPackages(prev => prev === 'divergent' ? 'all' : prev);
        setReportStandardChecks(prev => prev === 'divergent' ? 'all' : prev);
        setReportAdditionalChecks(prev => prev === 'divergent' ? 'all' : prev);
        setReportShowCompanionBdd(prev => prev === 'divergent' ? 'all' : prev);
        setReportShowManualChecks(prev => prev === 'divergent' ? 'all' : prev);
        setReportShowUiTexts(prev => prev === 'divergent' ? 'all' : prev);
        setReportShowInteractiveTests(prev => prev === 'divergent' ? 'all' : prev);
        toast.success(t('toolbox.checkup.golden_cleared', 'Golden comparison cleared'), { id: 'golden-clear' });
    };

    // Standard Checks definitions
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
            expected: (out: string) => out.trim().toLowerCase() === 'enforcing',
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
            command: ['shell', 'sh', '-c', 'which su 2>/dev/null || echo "not found"'],
            expected: (out: string) => !out.trim() || out.includes('not found') || out.includes('permission denied') || out.toLowerCase().includes('no su'),
            foundDisplay: (out: string) => (!out.trim() || out.includes('not found') || out.includes('permission denied') || out.toLowerCase().includes('no su')) ? t('toolbox.checkup.not_found', 'Not found') : t('toolbox.checkup.found', 'Found')
        },
        {
            id: 'developer_options',
            name: t('toolbox.checkup.checks.developer_options', 'Developer Options'),
            command: ['shell', 'settings', 'get', 'global', 'development_settings_enabled'],
            expected: (out: string) => out.trim() === '0' || out.trim() === 'null' || !out.trim(),
            foundDisplay: (out: string) => out.trim() === '1' ? t('toolbox.checkup.active', '1 (Active)') : t('toolbox.checkup.inactive', '0 (Inactive)')
        },
        {
            id: 'non_market_apps',
            name: t('toolbox.checkup.checks.non_market_apps', 'Unknown Apps Installation'),
            command: ['shell', 'settings', 'get', 'secure', 'install_non_market_apps'],
            expected: (out: string) => out.trim() === '0',
            foundDisplay: (out: string) => out.trim() === '1' ? t('toolbox.checkup.allowed', 'Allowed (1)') : t('toolbox.checkup.blocked', 'Blocked (0)')
        }
    ], [t]);

    const standardChecks = useMemo(() => {
        return standardChecksBase.map(check => ({
            ...check,
            status: checkResults[check.id]?.status || 'idle',
            found: checkResults[check.id]?.found
        }));
    }, [standardChecksBase, checkResults]);

    // Additional Checks definitions
    const additionalChecksBase = useMemo(() => [
        {
            id: 'imei',
            name: t('toolbox.checkup.additional.imei', 'IMEI'),
            command: ['shell', 'dumpsys', 'iphonesubinfo'],
            foundDisplay: (out: string) => {
                const match = out.match(/Device ID = (\d+)/i) || out.match(/IMEI[ =:]+(\d+)/i);
                if (match) return match[1];
                if (out.includes('SecurityException') || out.includes('Permission Denial') || out.includes('requires READ_PRIVILEGED_PHONE_STATE')) {
                    return t('toolbox.checkup.additional.imei_blocked', 'Blocked by OS (Shell Restriction)');
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
            id: 'wifi_mac_address',
            name: t('toolbox.checkup.additional.wifi_mac_address', 'Wi-Fi MAC Address'),
            command: ['shell', 'ip', 'addr', 'show', 'wlan0'],
            foundDisplay: (out: string) => {
                const match = out.match(/link\/ether\s+([0-9a-fA-F:]{17})/i);
                return match ? match[1] : t('toolbox.checkup.not_found', 'Not found');
            }
        },
        {
            id: 'wifi_ip_address',
            name: t('toolbox.checkup.additional.wifi_ip_address', 'Wi-Fi IP Address'),
            command: ['shell', 'ip', 'addr', 'show', 'wlan0'],
            foundDisplay: (out: string) => {
                const match = out.match(/inet\s+([0-9.]+)\/\d+/i);
                return match ? match[1] : t('toolbox.checkup.not_found', 'Not found');
            }
        },
        {
            id: 'memory',
            name: t('toolbox.checkup.additional.memory', 'Memory (/proc/meminfo)'),
            command: ['shell', 'cat', '/proc/meminfo'],
            foundDisplay: (out: string) => {
                const memTotalMatch = out.match(/MemTotal:\s+(\d+\s+kB)/i);
                const memFreeMatch = out.match(/MemFree:\s+(\d+\s+kB)/i);
                const memAvailMatch = out.match(/MemAvailable:\s+(\d+\s+kB)/i);
                if (memTotalMatch) {
                    const total = memTotalMatch[1];
                    const avail = memAvailMatch ? memAvailMatch[1] : (memFreeMatch ? memFreeMatch[1] : '');
                    return avail ? `${total} (Avail: ${avail})` : total;
                }
                return out.trim() || t('toolbox.checkup.not_found', 'Not found');
            }
        },
        {
            id: 'storage',
            name: t('toolbox.checkup.additional.storage', 'Data Storage (/data)'),
            command: ['shell', 'df', '-h', '/data'],
            foundDisplay: (out: string) => {
                const lines = out.trim().split('\n');
                if (lines.length > 1) {
                    const parts = lines[1].trim().split(/\s+/);
                    if (parts.length >= 5) {
                        return `Size: ${parts[1]}, Used: ${parts[2]} (${parts[4]}), Free: ${parts[3]}`;
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
        },
        {
            id: 'device_owner',
            name: t('toolbox.checkup.additional.device_owner', 'Device Owner'),
            command: ['shell', 'dumpsys', 'device_policy'],
            foundDisplay: (out: string) => {
                if (out.includes('SecurityException') || out.includes('Permission Denial')) {
                    return t('toolbox.checkup.additional.imei_blocked', 'Blocked by OS (Shell Restriction)');
                }
                const lines = out.split('\n');
                let inDoSection = false;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line.startsWith('Device Owner:') || line.startsWith('Device Owner (')) {
                        inDoSection = true;
                        const inlineVal = line.replace(/^Device Owner:?\s*/i, '').trim();
                        if (inlineVal && inlineVal !== 'null' && inlineVal !== 'None' && inlineVal !== '(none)') {
                            return inlineVal;
                        }
                        continue;
                    }
                    if (inDoSection) {
                        if (!line || line.startsWith('Profile Owner') || line.startsWith('User ') || line.startsWith('Current User')) {
                            break;
                        }
                        if (line.toLowerCase() === 'null' || line.toLowerCase() === 'none' || line.toLowerCase() === '(none)') {
                            return t('toolbox.checkup.not_configured', 'Not configured');
                        }
                        if (line.includes('admin=') || line.includes('package=')) {
                            const adminMatch = line.match(/admin=ComponentInfo\{([^}]+)\}/i) || line.match(/package=([a-zA-Z0-9._]+)/i) || line.match(/admin=([^\s]+)/i);
                            return adminMatch ? adminMatch[1] : line;
                        }
                    }
                }
                const matchAdmin = out.match(/Device Owner:[\s\S]*?admin=ComponentInfo\{([^}]+)\}/i);
                if (matchAdmin) return matchAdmin[1];

                return t('toolbox.checkup.not_configured', 'Not configured');
            }
        }
    ], [t]);

    const additionalChecks = useMemo(() => {
        return additionalChecksBase.map(check => ({
            ...check,
            status: additionalCheckResults[check.id]?.status || 'idle',
            found: additionalCheckResults[check.id]?.found
        }));
    }, [additionalChecksBase, additionalCheckResults]);

    const displayedStandardChecks = useMemo(() => {
        if (!filterDivergent) return standardChecks;
        return standardChecks.filter(c => {
            if (checkResults[c.id]?.goldenExpected !== undefined) {
                return !checkResults[c.id]?.isGoldenMatch;
            }
            return c.status === 'incorrect';
        });
    }, [standardChecks, checkResults, filterDivergent]);

    const displayedAdditionalChecks = useMemo(() => {
        if (!filterDivergent) return additionalChecks;
        return additionalChecks.filter(c => {
            if (additionalCheckResults[c.id]?.goldenExpected !== undefined) {
                return !additionalCheckResults[c.id]?.isGoldenMatch;
            }
            return false;
        });
    }, [additionalChecks, additionalCheckResults, filterDivergent]);

    const parseDeviceProps = (output: string): Record<string, string> => {
        const props: Record<string, string> = {};
        const regex = /\[(.*?)\]: \[(.*?)\]/g;
        let match;
        while ((match = regex.exec(output)) !== null) {
            props[match[1]] = match[2];
        }
        return props;
    };

    const fetchDeviceProperties = useCallback(async (targetDevice: string): Promise<Record<string, string>> => {
        const companionProps: Record<string, string> = {};
        try {
            const c = await callCompanionRest<any>('/device/info');
            if (c && c.status === 'ok') {
                if (c.manufacturer) companionProps['ro.product.manufacturer'] = c.manufacturer;
                if (c.model) companionProps['ro.product.model'] = c.model;
                if (c.brand) companionProps['ro.product.brand'] = c.brand;
                if (c.androidVersion) companionProps['ro.build.version.release'] = c.androidVersion;
                if (c.sdkInt) companionProps['ro.build.version.sdk'] = String(c.sdkInt);
                if (c.serial) companionProps['ro.serialno'] = c.serial;
                if (c.specs && typeof c.specs === 'object') {
                    for (const [k, v] of Object.entries(c.specs)) {
                        if (v !== undefined && v !== null && String(v).trim() !== '') {
                            companionProps[k] = String(v);
                        }
                    }
                }
            }
        } catch (_) { }

        try {
            const deviceOutput: string = await invoke('run_adb_command', {
                device: targetDevice,
                args: ['shell', 'getprop']
            });
            const adbProps = parseDeviceProps(deviceOutput);
            return { ...adbProps, ...companionProps };
        } catch (_) {
            return companionProps;
        }
    }, [companionStatus]);

    const handleLoadRemainingProps = async () => {
        if (!selectedDevice) return;
        setIsLoading(true);
        try {
            const allProps = await fetchDeviceProperties(selectedDevice);

            // Filter properties strictly matching basePropsPrefixes
            const filteredBaseProps: Record<string, string> = {};
            for (const [k, v] of Object.entries(allProps)) {
                const isBase = basePropsPrefixes.some(prefix => matchesFilterPattern(k, prefix));
                if (isBase) {
                    filteredBaseProps[k] = v;
                }
            }

            // Strictly set devicePropsCache to the filtered base properties (pruning all non-matching properties)
            setDevicePropsCache(filteredBaseProps);

            // If golden comparison is active, also synchronize comparisons strictly against filtered base props
            if (comparisons.length > 0) {
                const expectedMap = new Map<string, string>();
                comparisons.forEach(c => {
                    if (c.expected && c.expected !== '-') {
                        expectedMap.set(c.key, c.expected);
                    }
                });

                const allKeys = Array.from(new Set([...Array.from(expectedMap.keys()), ...Object.keys(filteredBaseProps)]));
                const newComparisons: PropComparison[] = allKeys.map(key => {
                    const expected = expectedMap.get(key) || '';
                    const found = filteredBaseProps[key] || '';
                    const normExp = normalizePropVal(expected);
                    const normFnd = normalizePropVal(found);
                    const isMatch = normExp === normFnd;
                    const isExtra = !normExp && Boolean(normFnd);
                    return {
                        key,
                        expected: expected || '-',
                        found: found || '-',
                        isMatch,
                        isExtra
                    };
                });
                setComparisons(newComparisons);
            }
            toast.success(t('toolbox.checkup.base_props_loaded', 'Base device properties loaded successfully!'), { id: 'base-props-loaded' });
        } catch (error) {
            console.error('Failed to load device properties:', error);
            toast.error(t('toolbox.checkup.error_fetch', 'Failed to fetch device properties'), { id: 'base-props-error' });
        } finally {
            setIsLoading(false);
        }
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

                // Fetch device properties (including companion sync)
                const fullProps = await fetchDeviceProperties(selectedDevice);
                const expectedProps = goldenData.properties || {};

                // Filter device properties strictly matching user-configured basePropsPrefixes OR explicitly present in golden
                const relevantDeviceProps: Record<string, string> = {};
                for (const [k, v] of Object.entries(fullProps)) {
                    const isBase = basePropsPrefixes.some(prefix => matchesFilterPattern(k, prefix));
                    const isExpected = k in expectedProps;
                    if (isBase || isExpected) {
                        relevantDeviceProps[k] = v;
                    }
                }

                // Strictly set current device properties
                setDevicePropsCache(relevantDeviceProps);

                // 1. Process Properties (Full union of golden properties and relevant device properties)
                if (goldenData.properties) {
                    const allKeys = Array.from(new Set([...Object.keys(expectedProps), ...Object.keys(relevantDeviceProps)]));
                    const newComparisons: PropComparison[] = allKeys.map(key => {
                        const expected = expectedProps[key] || '';
                        const found = relevantDeviceProps[key] || '';
                        const normExp = normalizePropVal(expected);
                        const normFnd = normalizePropVal(found);
                        const isMatch = normExp === normFnd;
                        const isExtra = !normExp && Boolean(normFnd);
                        return {
                            key,
                            expected: expected || '-',
                            found: found || '-',
                            isMatch,
                            isExtra
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
                                if (check.id === 'root_access') {
                                    const notFoundDisplay = t('toolbox.checkup.not_found', 'Not found');
                                    newStandardResults[check.id] = {
                                        status: 'correct',
                                        found: notFoundDisplay,
                                        goldenExpected: goldenCheck.found,
                                        isGoldenMatch: goldenCheck.found === notFoundDisplay
                                    };
                                } else {
                                    newStandardResults[check.id] = {
                                        status: 'incorrect',
                                        found: t('toolbox.checkup.error_exec', 'Execution error'),
                                        goldenExpected: goldenCheck.found,
                                        isGoldenMatch: false
                                    };
                                }
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
                    setDevicePackages(pkgs);
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

                // UI Text Checks Compare
                if (goldenData.ui_text_checks) {
                    const goldenUiChecks: any[] = goldenData.ui_text_checks;
                    setUiTextChecks(prev => {
                        const mergedChecks = [...prev];
                        goldenUiChecks.forEach(goldenCheck => {
                            const existingIndex = mergedChecks.findIndex(c => c.id === goldenCheck.id || c.name === goldenCheck.name);
                            if (existingIndex >= 0) {
                                mergedChecks[existingIndex] = {
                                    ...mergedChecks[existingIndex],
                                    expectedTexts: goldenCheck.expectedTexts || [],
                                    isGoldenMatch: undefined,
                                    status: 'idle'
                                };
                            } else {
                                mergedChecks.push({
                                    id: goldenCheck.id || `ui_check_${Date.now()}`,
                                    name: goldenCheck.name,
                                    activity: goldenCheck.activity,
                                    delayMs: goldenCheck.delayMs || 1500,
                                    enabled: goldenCheck.enabled !== undefined ? goldenCheck.enabled : true,
                                    expectedTexts: goldenCheck.expectedTexts || [],
                                    foundTexts: [],
                                    status: 'idle'
                                });
                            }
                        });
                        return mergedChecks;
                    });
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

    const runStandardChecks = async () => {
        if (!selectedDevice) return;
        setCheckResults(prev => {
            const next = { ...prev };
            standardChecksBase.forEach(check => {
                next[check.id] = { status: 'running' };
            });
            return next;
        });

        const newResults: Record<string, any> = {};
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
                if (check.id === 'root_access') {
                    newResults[check.id] = {
                        status: 'correct',
                        found: t('toolbox.checkup.not_found', 'Not found')
                    };
                } else {
                    newResults[check.id] = {
                        status: 'incorrect',
                        found: t('toolbox.checkup.error_exec', 'Execution error')
                    };
                }
            }
        }));

        setCheckResults(newResults);
    };

    const runAdditionalChecks = async () => {
        if (!selectedDevice) return;
        setAdditionalCheckResults(prev => {
            const next = { ...prev };
            additionalChecksBase.forEach(check => {
                next[check.id] = { status: 'running' };
            });
            return next;
        });

        const newResults: Record<string, any> = {};
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

    // Manual Checks helpers
    const handlePickManualImage = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }]
            });
            if (selected && typeof selected === 'string') {
                const bytes = await readFile(selected);
                let binary = '';
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const base64 = btoa(binary);
                const ext = selected.split('.').pop()?.toLowerCase() || 'png';
                const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : (ext === 'webp' ? 'image/webp' : 'image/png');
                const dataUrl = `data:${mime};base64,${base64}`;
                setManualCheckValueImage(dataUrl);
            }
        } catch (e) {
            console.error("Failed to load image file:", e);
            toast.error(t('toolbox.checkup.image_load_error', 'Failed to load image file'));
        }
    };

    const openAddManualCheck = () => {
        setEditingManualCheck(null);
        setManualCheckName('');
        setManualCheckType('text');
        setManualCheckValueText('');
        setManualCheckValueImage(undefined);
        setManualCheckStatus('pass');
        setManualCheckNotes('');
        setIsManualCheckModalOpen(true);
    };

    const openEditManualCheck = (item: ManualCheckItem) => {
        setEditingManualCheck(item);
        setManualCheckName(item.name);
        setManualCheckType(item.type);
        setManualCheckValueText(item.valueText || '');
        setManualCheckValueImage(item.valueImageBase64);
        setManualCheckStatus(item.status);
        setManualCheckNotes(item.notes || '');
        setIsManualCheckModalOpen(true);
    };

    const saveManualCheck = () => {
        if (!manualCheckName.trim()) {
            toast.error(t('toolbox.checkup.manual_check_name_required', 'Check name is required'));
            return;
        }
        if (editingManualCheck) {
            setManualChecks(prev => prev.map(c => c.id === editingManualCheck.id ? {
                ...c,
                name: manualCheckName.trim(),
                type: manualCheckType,
                valueText: manualCheckType === 'text' ? manualCheckValueText.trim() : undefined,
                valueImageBase64: manualCheckType === 'image' ? manualCheckValueImage : undefined,
                status: manualCheckStatus,
                notes: manualCheckNotes.trim() || undefined
            } : c));
        } else {
            const newItem: ManualCheckItem = {
                id: `manual_${Date.now()}`,
                name: manualCheckName.trim(),
                type: manualCheckType,
                valueText: manualCheckType === 'text' ? manualCheckValueText.trim() : undefined,
                valueImageBase64: manualCheckType === 'image' ? manualCheckValueImage : undefined,
                status: manualCheckStatus,
                notes: manualCheckNotes.trim() || undefined
            };
            setManualChecks(prev => [...prev, newItem]);
        }
        setIsManualCheckModalOpen(false);
    };

    const deleteManualCheck = (id: string) => {
        setManualChecks(prev => prev.filter(c => c.id !== id));
    };

    const buildHtmlReport = async (aiMode: boolean = false): Promise<string | null> => {
        if (!selectedDevice) return null;
        try {
            let currentDeviceProps = devicePropsCache;
            if (!currentDeviceProps || Object.keys(currentDeviceProps).length === 0) {
                const fullProps = await fetchDeviceProperties(selectedDevice);
                const filtered: Record<string, string> = {};
                for (const [k, v] of Object.entries(fullProps)) {
                    if (basePropsPrefixes.some(prefix => matchesFilterPattern(k, prefix))) {
                        filtered[k] = v;
                    }
                }
                currentDeviceProps = filtered;
                setDevicePropsCache(filtered);
            }

            const deviceName = currentDeviceProps['ro.product.model'] || currentDeviceProps['ro.product.marketname'] || 'Unknown Device';

            let filteredPkgs: PackageInfo[] = [];
            if (reportPackages !== 'none') {
                const pkgs = devicePackages.length > 0 ? devicePackages : await invoke<PackageInfo[]>("get_installed_packages", { device: selectedDevice });
                filteredPkgs = pkgs.filter(p => {
                    if (packageFilterPrefixes.length === 0) return packageFilterMode === 'exclude';
                    const matchesPrefix = packageFilterPrefixes.some(prefix => matchesFilterPattern(p.name, prefix));
                    if (packageFilterMode === 'include') return matchesPrefix;
                    return !matchesPrefix;
                });
            }

            const resultLabel = reportResult === 'approved'
                ? t('toolbox.checkup.report.approved', 'Approved')
                : reportResult === 'rejected'
                    ? t('toolbox.checkup.report.rejected', 'Rejected')
                    : t('toolbox.checkup.report.pending', 'Pending');

            let html = `<!DOCTYPE html>
<html lang="${t('language', 'en')}">
<head>
    <meta charset="UTF-8">
    <meta name="report-result" content="${reportResult}">
    <meta name="report-analyst" content="${reportAnalystName}">
    <meta name="report-comments" content="${reportComments.trim().replace(/"/g, '&quot;')}">
    <title>${t('toolbox.checkup.report_title', 'Device Checkup Report')} - ${deviceName} - ${selectedDevice}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 2rem; max-width: 1200px; margin: 0 auto; color: #333; }
        h1, h2 { color: #111; }
        .section { margin-bottom: 2rem; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
        .section-header { background: #f8f9fa; padding: 1rem; border-bottom: 1px solid #ddd; font-weight: bold; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center; }
        table { width: 100%; border-collapse: collapse; font-size: 0.9rem; table-layout: fixed; }
        th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #eee; word-wrap: break-word; overflow-wrap: break-word; }
        th { background: #fdfdfd; font-weight: 600; color: #555; }
        .success { color: #16a34a; font-weight: 500; }
        .error { color: #dc2626; font-weight: 500; }
        .warning { color: #d97706; font-weight: 500; }
        .info { color: #2563eb; font-weight: 500; }
        .badge-verified { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
        .badge-result { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .badge-result-approved { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
        .badge-result-rejected { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
        .badge-result-pending { background: #fef3c7; color: #b45309; border: 1px solid #fcd34d; }
        .badge-compliant-summary { font-size: 0.78rem; font-weight: 600; padding: 2px 8px; border-radius: 6px; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
        code { background: #f1f5f9; padding: 0.2rem 0.4rem; border-radius: 4px; font-family: monospace; font-size: 0.85em; }
        .manual-img { max-height: 140px; max-width: 240px; object-fit: contain; border-radius: 6px; border: 1px solid #ddd; display: block; margin-top: 4px; }
        .header-box { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 2px solid #eaeaea; }
    </style>
</head>
<body>
    ${settings.customLogoLight ? `<img src="${settings.customLogoLight}" alt="Logo" style="max-height: 48px; margin-bottom: 1rem;" />` : ''}
    <div class="header-box">
        <div style="flex: 1; min-width: 0; margin-right: 1.5rem;">
            <h1 style="margin: 0 0 0.5rem 0;">${t('toolbox.checkup.report_title', 'Device Checkup Report')}</h1>
            <div style="font-size: 0.9rem; color: #666;">
                <strong>${t('toolbox.checkup.report.analyst', 'Analyst')}:</strong> <span style="font-weight: 600; color: #111;">${reportAnalystName || 'N/A'}</span> &bull; 
                <strong>${t('toolbox.checkup.date', 'Date')}:</strong> ${new Date().toLocaleString()}
            </div>
            <div style="display: flex; gap: 1.5rem; align-items: flex-start; margin-top: 8px; padding: 10px 14px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                <div style="flex-shrink: 0;">
                    <strong style="display: block; font-size: 0.72rem; text-transform: uppercase; color: #64748b; margin-bottom: 3px;">${t('toolbox.checkup.report.result', 'Final Result')}</strong>
                    <span class="badge-result badge-result-${reportResult}">${resultLabel}</span>
                </div>
                <div style="flex: 1; min-width: 0;">
                    <strong style="display: block; font-size: 0.72rem; text-transform: uppercase; color: #64748b; margin-bottom: 3px;">${t('toolbox.checkup.report.comments', 'Comments / Observations')}</strong>
                    <div style="font-size: 0.85rem; color: #334155; white-space: pre-wrap;">${reportComments.trim() ? reportComments.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;') : '<em style="color: #94a3b8;">' + t('toolbox.checkup.report.no_comments', 'No comments recorded.') + '</em>'}</div>
                </div>
            </div>
        </div>
        <div style="text-align: right; font-size: 0.9rem; flex-shrink: 0;">
            <strong>${t('toolbox.checkup.device_name', 'Device Name')}:</strong> ${deviceName}<br>
            <strong>${t('toolbox.checkup.device_udid', 'Device UDID')}:</strong> <code>${selectedDevice}</code><br>
            <div style="margin-top: 6px;"><span class="badge-verified">&#10004; ${t('toolbox.checkup.all_sections_verified', 'All Included Sections Attested & Verified')}</span></div>
        </div>
    </div>
    <!-- HEADER_END -->
`;

            // 1. Device Properties (if enabled)
            if (reportPropsCompare !== 'none') {
                if (comparisons.length > 0) {
                    const compliantPropCount = comparisons.filter(c => c.isMatch).length;
                    let propsToRender = reportPropsCompare === 'divergent' || aiMode
                        ? comparisons.filter(c => !c.isMatch)
                        : comparisons;

                    if (propsToRender.length > 0) {
                        html += `
                        <div class="section">
                            <div class="section-header">
                                <span>${t('toolbox.checkup.prop_compare', '.prop Compare')}</span>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    ${reportPropsCompare === 'divergent' ? `<span class="badge-compliant-summary">&#10003; ${compliantPropCount} ${t('toolbox.checkup.report.compliant_hidden', 'matching items')}</span>` : ''}
                                    <span class="badge-verified">&#10004; ${t('toolbox.checkup.verified', 'Conferido')}</span>
                                </div>
                            </div>
                            <table>
                                <thead>
                                    <tr>
                                        <th style="width: 35%;">${t('toolbox.checkup.key', 'Key')}</th>
                                        <th style="width: 30%;">${t('toolbox.checkup.expected', 'Expected')}</th>
                                        <th style="width: 25%;">${t('toolbox.checkup.found', 'Found')}</th>
                                        <th style="width: 10%;">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                        `;
                        propsToRender.forEach(c => {
                            let statusText = t('toolbox.checkup.status_mismatch', 'Mismatch');
                            if (c.isMatch) {
                                statusText = t('toolbox.checkup.status_match', 'Match');
                            } else if (c.isExtra) {
                                statusText = t('toolbox.checkup.status_extra', 'Extra');
                            } else if (!c.found) {
                                statusText = t('toolbox.checkup.status_missing', 'Missing');
                            }

                            html += `
                                <tr>
                                    <td><code>${c.key}</code></td>
                                    <td><code>${c.expected}</code></td>
                                    <td><code class="${c.isMatch ? 'success' : (c.isExtra ? 'warning' : 'error')}">${c.found || '-'}</code></td>
                                    <td class="${c.isMatch ? 'success' : (c.isExtra ? 'warning' : 'error')}">${statusText}</td>
                                </tr>
                            `;
                        });
                        html += `</tbody></table></div>`;
                    }
                } else {
                    const filteredEntries = Object.entries(currentDeviceProps).filter(([k]) =>
                        basePropsPrefixes.some(prefix => matchesFilterPattern(k, prefix))
                    );
                    if (filteredEntries.length > 0) {
                        html += `
                        <div class="section">
                            <div class="section-header">
                                <span>${t('toolbox.checkup.prop_compare', 'Device Properties')}</span>
                                <span class="badge-verified">&#10004; ${t('toolbox.checkup.verified', 'Conferido')}</span>
                            </div>
                            <table>
                                <thead>
                                    <tr>
                                        <th style="width: 40%;">${t('toolbox.checkup.key', 'Key')}</th>
                                        <th style="width: 60%;">${t('toolbox.checkup.found', 'Value')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                        `;
                        filteredEntries.forEach(([key, val]) => {
                            html += `
                                <tr>
                                    <td><code>${key}</code></td>
                                    <td><code>${val}</code></td>
                                </tr>
                            `;
                        });
                        html += `</tbody></table></div>`;
                    }
                }
            }

            // 2. Installed Packages (if enabled)
            if (reportPackages !== 'none') {
                if (packageComparisons.length > 0 && packageComparisons.some(p => p.goldenVersion !== undefined)) {
                    let filteredComps = packageComparisons.filter(p => {
                        if (packageFilterPrefixes.length === 0) return packageFilterMode === 'exclude';
                        const matchesPrefix = packageFilterPrefixes.some(prefix => matchesFilterPattern(p.name, prefix));
                        if (packageFilterMode === 'include') return matchesPrefix;
                        return !matchesPrefix;
                    });

                    const compliantPkgCount = filteredComps.filter(c => c.isMatch).length;

                    if (reportPackages === 'divergent' || aiMode) {
                        filteredComps = filteredComps.filter(c => !c.isMatch);
                    }

                    if (filteredComps.length > 0) {
                        html += `
                        <div class="section">
                            <div class="section-header">
                                <span>${t('toolbox.checkup.packages_compare', 'Packages Compare')}</span>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    ${reportPackages === 'divergent' ? `<span class="badge-compliant-summary">&#10003; ${compliantPkgCount} ${t('toolbox.checkup.report.compliant_hidden', 'matching items')}</span>` : ''}
                                    <span class="badge-verified">&#10004; ${t('toolbox.checkup.verified', 'Conferido')}</span>
                                </div>
                            </div>
                            <table>
                                <thead>
                                    <tr>
                                        <th>${t('toolbox.checkup.package_name', 'Package')}</th>
                                        <th>${t('toolbox.checkup.expected', 'Expected')}</th>
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
                } else if (filteredPkgs.length > 0) {
                    html += `
                    <div class="section">
                        <div class="section-header">
                            <span>${t('toolbox.checkup.installed_packages', 'Installed Packages')}</span>
                            <span class="badge-verified">&#10004; ${t('toolbox.checkup.verified', 'Conferido')}</span>
                        </div>
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
                                <td>${p.is_system ? t('toolbox.checkup.system', 'System') : t('toolbox.checkup.user', 'User')}</td>
                            </tr>
                        `;
                    });
                    html += `</tbody></table></div>`;
                }
            }

            // 3. Standard Checks (if enabled)
            let standardChecksToRender = standardChecks;
            const compliantStandardCount = standardChecks.filter(c => {
                if (checkResults[c.id]?.goldenExpected !== undefined) {
                    return checkResults[c.id]?.isGoldenMatch;
                }
                return c.status === 'correct';
            }).length;

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
                    <div class="section-header">
                        <span>${t('toolbox.checkup.standard_checks', 'Standard Checks')}</span>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            ${reportStandardChecks === 'divergent' ? `<span class="badge-compliant-summary">&#10003; ${compliantStandardCount} ${t('toolbox.checkup.report.compliant_hidden', 'matching items')}</span>` : ''}
                            <span class="badge-verified">&#10004; ${t('toolbox.checkup.verified', 'Conferido')}</span>
                        </div>
                    </div>
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
                                ${checkResults[c.id]?.goldenExpected !== undefined ? `<div>${t('toolbox.checkup.expected', 'Expected')}: <code>${checkResults[c.id]?.goldenExpected}</code></div>` : ''}
                                <div>${t('toolbox.checkup.found', 'Found')}: <code class="${statusClass}">${c.found || '-'}</code></div>
                            </td>
                            <td class="${statusClass}">${statusText}</td>
                        </tr>
                    `;
                });
                html += `</tbody></table></div>`;
            }

            // 4. Additional Checks (if enabled)
            let additionalChecksToRender = additionalChecks;
            const compliantAdditionalCount = additionalChecks.filter(c => {
                if (additionalCheckResults[c.id]?.goldenExpected !== undefined) {
                    return additionalCheckResults[c.id]?.isGoldenMatch;
                }
                return true;
            }).length;

            if (reportAdditionalChecks === 'divergent' || aiMode) {
                additionalChecksToRender = additionalChecks.filter(c => {
                    if (additionalCheckResults[c.id]?.goldenExpected !== undefined) {
                        return !additionalCheckResults[c.id]?.isGoldenMatch;
                    }
                    return false;
                });
            }

            if (additionalChecksToRender.length > 0 && reportAdditionalChecks !== 'none') {
                html += `
                <div class="section">
                    <div class="section-header">
                        <span>${t('toolbox.checkup.additional_checks', 'Additional Checks')}</span>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            ${reportAdditionalChecks === 'divergent' ? `<span class="badge-compliant-summary">&#10003; ${compliantAdditionalCount} ${t('toolbox.checkup.report.compliant_hidden', 'matching items')}</span>` : ''}
                            <span class="badge-verified">&#10004; ${t('toolbox.checkup.verified', 'Conferido')}</span>
                        </div>
                    </div>
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
                    let statusText = t('common.done', 'Done');
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
                                ${additionalCheckResults[c.id]?.goldenExpected !== undefined ? `<div>${t('toolbox.checkup.expected', 'Expected')}: <code>${additionalCheckResults[c.id]?.goldenExpected}</code></div>` : ''}
                                <div>${t('toolbox.checkup.found', 'Found')}: <code>${c.found || '-'}</code></div>
                            </td>
                            <td class="${statusClass}">${statusText}</td>
                        </tr>
                    `;
                });
                html += `</tbody></table></div>`;
            }

            // 5. Companion BDD Tests (if enabled)
            if (reportShowCompanionBdd !== 'none' && companionBddSuites.length > 0) {
                let companionSuitesToRender = companionBddSuites;
                const compliantBddCount = companionBddSuites.filter(s => s.lastReport && s.lastReport.failedScenarios === 0).length;

                if (reportShowCompanionBdd === 'divergent' || aiMode) {
                    companionSuitesToRender = companionBddSuites.filter(s => {
                        if (!s.lastReport) return false;
                        return s.lastReport.failedScenarios > 0;
                    });
                }

                if (companionSuitesToRender.length > 0) {
                    html += `
                    <div class="section">
                        <div class="section-header">
                            <span>${t('toolbox.checkup.companion_bdd_tests', 'Companion BDD Tests')}</span>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                ${reportShowCompanionBdd === 'divergent' ? `<span class="badge-compliant-summary">&#10003; ${compliantBddCount} ${t('toolbox.checkup.report.compliant_hidden', 'matching items')}</span>` : ''}
                                <span class="badge-verified">&#10004; ${t('toolbox.checkup.verified', 'Conferido')}</span>
                            </div>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th style="width: 30%;">Suite</th>
                                    <th style="width: 25%;">Target Package</th>
                                    <th style="width: 25%;">Results</th>
                                    <th style="width: 20%;">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;
                    companionSuitesToRender.forEach(s => {
                        const r = s.lastReport;
                        const isPass = r ? r.failedScenarios === 0 : false;
                        const statusClass = isPass ? 'success' : 'error';
                        const statusText = r ? (isPass ? `${r.passedScenarios}/${r.totalScenarios} ${t('common.passed', 'Passed')}` : `${r.failedScenarios} ${t('common.failed', 'Failed')}`) : t('common.waiting', 'Waiting');

                        html += `
                            <tr>
                                <td><strong>${s.name}</strong></td>
                                <td><code>${s.targetPackage || '-'}</code></td>
                                <td>${r ? `${t('common.passed', 'Passed')}: ${r.passedScenarios}, ${t('common.failed', 'Failed')}: ${r.failedScenarios}` : '-'}</td>
                                <td class="${statusClass}">${statusText}</td>
                            </tr>
                        `;
                    });
                    html += `</tbody></table></div>`;
                }
            }

            // 6. Manual Checks (if enabled)
            if (reportShowManualChecks !== 'none' && manualChecks.length > 0) {
                let manualChecksToRender = manualChecks;
                const compliantManualCount = manualChecks.filter(m => m.status === 'pass').length;

                if (reportShowManualChecks === 'divergent' || aiMode) {
                    manualChecksToRender = manualChecks.filter(m => m.status === 'fail');
                }

                if (manualChecksToRender.length > 0) {
                    html += `
                    <div class="section">
                        <div class="section-header">
                            <span>${t('toolbox.checkup.manual_checks', 'Manual Checks')}</span>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                ${reportShowManualChecks === 'divergent' ? `<span class="badge-compliant-summary">&#10003; ${compliantManualCount} ${t('toolbox.checkup.report.compliant_hidden', 'matching items')}</span>` : ''}
                                <span class="badge-verified">&#10004; ${t('toolbox.checkup.verified', 'Conferido')}</span>
                            </div>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th style="width: 30%;">Item / Property</th>
                                    <th style="width: 15%;">Status</th>
                                    <th style="width: 35%;">Value / Evidence</th>
                                    <th style="width: 20%;">Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;
                    manualChecksToRender.forEach(m => {
                        const statusClass = m.status === 'pass' ? 'success' : (m.status === 'fail' ? 'error' : 'info');
                        const statusLabel = m.status === 'pass' ? t('toolbox.checkup.conforme', 'CONFORME') : (m.status === 'fail' ? t('toolbox.checkup.nao_conforme', 'NÃO CONFORME') : 'N/A');

                        html += `
                            <tr>
                                <td><strong>${m.name}</strong></td>
                                <td class="${statusClass}"><strong>${statusLabel}</strong></td>
                                <td>
                                    ${m.type === 'image' && m.valueImageBase64 ? `<img src="${m.valueImageBase64}" class="manual-img" alt="${m.name}" />` : `<code>${m.valueText || '-'}</code>`}
                                </td>
                                <td>${m.notes || '-'}</td>
                            </tr>
                        `;
                    });
                    html += `</tbody></table></div>`;
                }
            }

            // 7. UI Text Checks (if enabled)
            if (reportShowUiTexts !== 'none' && uiTextChecks.length > 0 && uiTextChecks.some(c => c.enabled)) {
                let uiTextChecksToRender = uiTextChecks.filter(c => c.enabled);
                const compliantUiTextCount = uiTextChecks.filter(c => c.enabled && c.isGoldenMatch === true).length;

                if (reportShowUiTexts === 'divergent' || aiMode) {
                    uiTextChecksToRender = uiTextChecksToRender.filter(c => c.isGoldenMatch === false);
                }

                if (uiTextChecksToRender.length > 0) {
                    html += `
                    <div class="section">
                        <div class="section-header">
                            <span>${t('toolbox.checkup.ui_text_checks', 'UI Text Checks')}</span>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                ${reportShowUiTexts === 'divergent' ? `<span class="badge-compliant-summary">&#10003; ${compliantUiTextCount} ${t('toolbox.checkup.report.compliant_hidden', 'matching items')}</span>` : ''}
                                <span class="badge-verified">&#10004; ${t('toolbox.checkup.verified', 'Conferido')}</span>
                            </div>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th>${t('toolbox.checkup.check', 'Check')}</th>
                                    <th>${t('toolbox.checkup.activity', 'Activity')}</th>
                                    <th>${t('toolbox.checkup.extracted_texts', 'Extracted / Expected Texts')}</th>
                                    <th>${t('toolbox.checkup.status', 'Status')}</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;
                    uiTextChecksToRender.forEach(c => {
                        const isMatch = c.isGoldenMatch;
                        const statusText = isMatch !== undefined
                            ? (isMatch ? t('toolbox.checkup.status_match', 'Match') : t('toolbox.checkup.status_mismatch', 'Mismatch'))
                            : (c.foundTexts && c.foundTexts.length > 0 ? `${c.foundTexts.length} ${t('toolbox.checkup.captured_texts_count', 'captured texts', { count: c.foundTexts.length })}` : (c.status === 'done' ? t('common.done', 'Done') : t('common.pending', 'Pending')));
                        const statusClass = isMatch !== undefined ? (isMatch ? 'success' : 'error') : (c.foundTexts && c.foundTexts.length > 0 ? 'info' : 'warning');
                        const maxLen = Math.max(c.expectedTexts?.length || 0, c.foundTexts?.length || 0);
                        let textsHtml = '';

                        if (maxLen > 0) {
                            textsHtml += `<div style="max-height: 250px; overflow-y: auto; border: 1px solid #eee; border-radius: 4px;">
                                <table style="width: 100%; margin: 0; border: none; font-size: 0.85em;">
                                    <thead style="background: #f9f9f9; position: sticky; top: 0;">
                                        <tr>
                                            <th style="padding: 4px 8px; border-bottom: 1px solid #ddd;">${t('toolbox.checkup.expected', 'Expected')}</th>
                                            <th style="padding: 4px 8px; border-bottom: 1px solid #ddd;">${t('toolbox.checkup.found', 'Found')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>`;

                            for (let i = 0; i < maxLen; i++) {
                                const exp = c.expectedTexts?.[i] || '-';
                                const fnd = c.foundTexts?.[i] || '-';
                                const match = exp === fnd;
                                textsHtml += `
                                    <tr>
                                        <td style="padding: 4px 8px; border-bottom: 1px solid #f1f5f9; word-break: break-all; color: #555;">${exp}</td>
                                        <td style="padding: 4px 8px; border-bottom: 1px solid #f1f5f9; word-break: break-all;" class="${match ? 'success' : 'error'}">${fnd}</td>
                                    </tr>`;
                            }
                            textsHtml += `</tbody></table></div>`;
                        } else {
                            textsHtml = `<em>${t('toolbox.checkup.not_found', 'No texts found')}</em>`;
                        }

                        html += `
                            <tr>
                                <td><strong>${c.name}</strong></td>
                                <td><code>${c.activity || '-'}</code></td>
                                <td style="padding: 0.25rem;">${textsHtml}</td>
                                <td class="${statusClass}">${statusText}</td>
                            </tr>
                        `;
                    });
                    html += `</tbody></table></div>`;
                }
            }

            // 8. Interactive Hardware Tests (if enabled)
            const interactiveKeys = Object.keys(interactiveTestResults);
            if (reportShowInteractiveTests !== 'none' && interactiveKeys.length > 0) {
                let interactiveKeysToRender = interactiveKeys;
                if (reportShowInteractiveTests === 'divergent' || aiMode) {
                    interactiveKeysToRender = interactiveKeys.filter(key => interactiveTestResults[key] === false);
                }

                if (interactiveKeysToRender.length > 0) {
                    html += `
                    <div class="section">
                        <div class="section-header">
                            <span>${t('toolbox.checkup.interactive_tests', 'Interactive Hardware Tests')}</span>
                            <span class="badge-verified">&#10004; ${t('toolbox.checkup.verified', 'Conferido')}</span>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th>${t('toolbox.checkup.test', 'Test')}</th>
                                    <th>${t('toolbox.checkup.status', 'Status')}</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;
                    interactiveKeysToRender.forEach(key => {
                        const passed = interactiveTestResults[key];
                        const statusText = passed === true ? t('common.passed', 'Passed') : (passed === false ? t('common.failed', 'Failed') : t('common.waiting', 'Waiting'));
                        const statusClass = passed === true ? 'success' : (passed === false ? 'error' : 'info');
                        const testName = t(`toolbox.checkup.test_${key}`, key.charAt(0).toUpperCase() + key.slice(1));
                        html += `
                            <tr>
                                <td><strong>${testName}</strong></td>
                                <td class="${statusClass}">${statusText}</td>
                            </tr>
                        `;
                    });
                    html += `</tbody></table></div>`;
                }
            }

            // Extra Props (if enabled)
            if (comparisons.length > 0 && reportShowPropsBase) {
                let extraProps = comparisons.filter(c => c.isExtra);
                if (propsFilterPrefixes.length > 0) {
                    extraProps = extraProps.filter(c => {
                        const matchesPrefix = propsFilterPrefixes.some(prefix => matchesFilterPattern(c.key, prefix));
                        if (propsFilterMode === 'include') return matchesPrefix;
                        return !matchesPrefix;
                    });
                }
                if (extraProps.length > 0) {
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
            let currentDeviceProps = devicePropsCache;
            if (!currentDeviceProps || !currentDeviceProps['sys.boot_completed']) {
                const deviceOutput: string = await invoke('run_adb_command', {
                    device: selectedDevice,
                    args: ['shell', 'getprop']
                });
                const fullProps = parseDeviceProps(deviceOutput);
                currentDeviceProps = { ...currentDeviceProps, ...fullProps };
                setDevicePropsCache(currentDeviceProps);
            }

            const capturedProps: Record<string, string> = {};
            const newComparisons: PropComparison[] = [];
            Object.keys(currentDeviceProps).forEach(key => {
                if (basePropsPrefixes.some(prefix => matchesFilterPattern(key, prefix))) {
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

            const pkgs = devicePackages.length > 0 ? devicePackages : await invoke<PackageInfo[]>("get_installed_packages", { device: selectedDevice });
            setDevicePackages(pkgs);

            const newPkgComps: PackageComparison[] = pkgs.map(p => ({
                name: p.name,
                goldenVersion: p.version,
                deviceVersion: p.version,
                isMatch: true,
                isMissing: false,
                isExtra: false
            }));
            setPackageComparisons(newPkgComps);

            const updatedUiChecks = uiTextChecks.map(c => {
                const texts = (c.expectedTexts && c.expectedTexts.length > 0)
                    ? c.expectedTexts
                    : (c.foundTexts && c.foundTexts.length > 0 ? c.foundTexts : []);
                return {
                    ...c,
                    expectedTexts: texts,
                    isGoldenMatch: texts.length > 0 ? true : undefined
                };
            });
            setUiTextChecks(updatedUiChecks);

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
                })),
                ui_text_checks: updatedUiChecks.filter(c => c.enabled).map(c => ({
                    id: c.id,
                    name: c.name,
                    activity: c.activity,
                    delayMs: c.delayMs || 1500,
                    expectedTexts: c.expectedTexts || [],
                    enabled: c.enabled
                }))
            };

            const filePath = await save({
                filters: [{ name: 'JSON Golden File', extensions: ['json'] }],
                defaultPath: `golden_${selectedDevice.replace(/[^a-zA-Z0-9]/g, '_')}.json`
            });

            if (filePath) {
                await writeTextFile(filePath, JSON.stringify(goldenData, null, 2));
                setLastSavedReport(filePath);
                toast.success(t('toolbox.checkup.golden_file.saved', 'Golden file saved successfully!'), { id: toastId });
            } else {
                toast.dismiss(toastId);
            }
        } catch (error) {
            console.error('Failed to generate golden file', error);
            toast.error(t('toolbox.checkup.golden_file.error', 'Failed to generate golden file'), { id: toastId });
        }
    };

    const renderReportSectionControl = (
        title: string,
        description: string,
        value: 'all' | 'divergent' | 'none',
        onChange: (val: 'all' | 'divergent' | 'none') => void
    ) => {
        const isAll = value === 'all';
        const isDivergent = value === 'divergent';
        const isOff = value === 'none';
        return (
            <div className={clsx(
                "p-3 rounded-xl border transition-all flex flex-col justify-between gap-2.5",
                isOff
                    ? "bg-surface-variant/10 border-outline-variant/25 opacity-60"
                    : isDivergent
                        ? "bg-warning/5 border-warning/30 shadow-sm"
                        : "bg-primary/5 border-primary/30 shadow-sm"
            )}>
                <div>
                    <span className="text-xs font-bold text-on-surface block mb-0.5">{title}</span>
                    <span className="text-[11px] text-on-surface-variant leading-tight block line-clamp-2">{description}</span>
                </div>
                <div className="grid grid-cols-3 gap-1 bg-surface-variant/30 p-0.5 rounded-lg border border-outline-variant/30">
                    <button
                        type="button"
                        onClick={() => onChange('all')}
                        className={clsx(
                            "text-[10px] font-medium py-1 px-1 rounded transition-all text-center",
                            isAll ? "bg-primary text-white shadow-sm font-semibold" : "text-on-surface-variant hover:text-on-surface"
                        )}
                        title={t('common.on', 'On')}
                    >
                        {t('common.on', 'On')}
                    </button>
                    <button
                        type="button"
                        onClick={() => onChange('divergent')}
                        className={clsx(
                            "text-[10px] font-medium py-1 px-1 rounded transition-all text-center",
                            isDivergent ? "bg-warning text-white shadow-sm font-semibold" : "text-on-surface-variant hover:text-on-surface"
                        )}
                        title={t('toolbox.checkup.report.divergent_short', 'Divergent')}
                    >
                        {t('toolbox.checkup.report.divergent_short', 'Divergent')}
                    </button>
                    <button
                        type="button"
                        onClick={() => onChange('none')}
                        className={clsx(
                            "text-[10px] font-medium py-1 px-1 rounded transition-all text-center",
                            isOff ? "bg-surface-variant/80 text-on-surface shadow-sm font-semibold" : "text-on-surface-variant hover:text-on-surface"
                        )}
                        title={t('common.off', 'Off')}
                    >
                        {t('common.off', 'Off')}
                    </button>
                </div>
            </div>
        );
    };

    // const renderReportToggleControl = (
    //     title: string,
    //     description: string,
    //     value: boolean,
    //     onChange: (val: boolean) => void
    // ) => {
    //     return (
    //         <div className={clsx(
    //             "p-3 rounded-xl border transition-all flex flex-col justify-between gap-2.5",
    //             !value
    //                 ? "bg-surface-variant/10 border-outline-variant/25 opacity-60"
    //                 : "bg-primary/5 border-primary/30 shadow-sm"
    //         )}>
    //             <div>
    //                 <span className="text-xs font-bold text-on-surface block mb-0.5">{title}</span>
    //                 <span className="text-[11px] text-on-surface-variant leading-tight block line-clamp-2">{description}</span>
    //             </div>
    //             <div className="grid grid-cols-2 gap-1 bg-surface-variant/30 p-0.5 rounded-lg border border-outline-variant/30">
    //                 <button
    //                     type="button"
    //                     onClick={() => onChange(true)}
    //                     className={clsx(
    //                         "text-[10px] font-medium py-1 px-1 rounded transition-all text-center",
    //                         value ? "bg-primary text-white shadow-sm font-semibold" : "text-on-surface-variant hover:text-on-surface"
    //                     )}
    //                 >
    //                     {t('common.on', 'On')}
    //                 </button>
    //                 <button
    //                     type="button"
    //                     onClick={() => onChange(false)}
    //                     className={clsx(
    //                         "text-[10px] font-medium py-1 px-1 rounded transition-all text-center",
    //                         !value ? "bg-surface-variant/80 text-on-surface shadow-sm font-semibold" : "text-on-surface-variant hover:text-on-surface"
    //                     )}
    //                 >
    //                     {t('common.off', 'Off')}
    //                 </button>
    //             </div>
    //         </div>
    //     );
    // };

    const validateAndOpenReportModal = () => {
        setIsReportModalOpen(true);
    };

    const generateReport = async () => {
        if (!selectedDevice) return;

        // Mandatory Analyst Name validation
        if (!reportAnalystName.trim()) {
            toast.error(t('toolbox.checkup.report.analyst_name_required', 'Analyst name is mandatory to generate report!'), { id: 'analyst-required' });
            return;
        }

        // Mandatory Section Verification validation
        const unverifiedActiveSections: string[] = [];
        if (reportPropsCompare !== 'none' && !verifiedSections.props) unverifiedActiveSections.push(t('toolbox.checkup.prop_compare', 'Device Properties'));
        if (reportPackages !== 'none' && !verifiedSections.packages) unverifiedActiveSections.push(t('toolbox.checkup.installed_packages', 'Installed Packages'));
        if (reportStandardChecks !== 'none' && !verifiedSections.standardChecks) unverifiedActiveSections.push(t('toolbox.checkup.standard_checks', 'Standard Checks'));
        if (reportAdditionalChecks !== 'none' && !verifiedSections.additionalChecks) unverifiedActiveSections.push(t('toolbox.checkup.additional_checks', 'Additional Checks'));
        if (reportShowCompanionBdd !== 'none' && !verifiedSections.companionBdd) unverifiedActiveSections.push(t('toolbox.checkup.companion_bdd_tests', 'Companion BDD Tests'));
        if (reportShowManualChecks !== 'none' && !verifiedSections.manualChecks) unverifiedActiveSections.push(t('toolbox.checkup.manual_checks', 'Manual Checks'));
        if (reportShowUiTexts !== 'none' && !verifiedSections.uiTextChecks) unverifiedActiveSections.push(t('toolbox.checkup.ui_text_checks', 'UI Text Checks'));
        if (reportShowInteractiveTests !== 'none' && !verifiedSections.interactiveTests) unverifiedActiveSections.push(t('toolbox.checkup.interactive_tests', 'Interactive Hardware Tests'));

        if (unverifiedActiveSections.length > 0) {
            toast.error(
                t('toolbox.checkup.report.unverified_sections_error', 'Please attest/verify (Conferido) all active sections before generating the report: {{sections}}', {
                    sections: unverifiedActiveSections.join(', ')
                }),
                { id: 'unverified-sections', duration: 6000 }
            );
            return;
        }

        setIsReportModalOpen(false);
        let toastId = toast.loading(t('toolbox.checkup.generating_report', 'Generating report...'));
        try {
            const html = await buildHtmlReport();
            if (!html) throw new Error("Failed to build HTML");

            const deviceName = devicePropsCache['ro.product.model'] || devicePropsCache['ro.product.marketname'] || selectedDevice;
            const reportTitle = `${t('toolbox.checkup.report_title', 'Device Checkup Report')} - ${deviceName}`;

            // Register in session-scoped reports cache
            const tempReport = addTemporaryReport({
                title: reportTitle,
                deviceModel: deviceName,
                deviceUdid: selectedDevice,
                analystName: reportAnalystName.trim() || 'N/A',
                timestamp: new Date().toISOString(),
                type: 'checkup',
                result: reportResult,
                comments: reportComments.trim() || undefined,
                htmlContent: html,
            });

            const filePath = await save({
                filters: [{ name: 'HTML Report', extensions: ['html'] }],
                defaultPath: `report_${selectedDevice.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.html`
            });

            if (filePath) {
                await writeTextFile(filePath, html);
                tempReport.filePath = filePath;
                setLastSavedReport(filePath);
                toast.success(t('toolbox.checkup.report_saved', 'Report saved successfully!'), { id: toastId });
            } else {
                toast.dismiss(toastId);
            }
        } catch (error) {
            console.error('Failed to generate report', error);
            toast.error(t('toolbox.checkup.report_error', 'Failed to generate report'), { id: toastId });
        }
    };

    const verifyReportWithAI = async () => {
        if (!selectedDevice || !aiRequirementsPrompt.trim()) return;

        if (!reportAnalystName.trim()) {
            toast.error(t('toolbox.checkup.report.analyst_name_required', 'Analyst name is mandatory to generate report!'), { id: 'analyst-required' });
            return;
        }

        setIsAiVerifyModalOpen(false);
        setIsReportModalOpen(false);

        let toastId = toast.loading(t('toolbox.checkup.report.ai_verifying', 'AI is verifying the report...'));
        setIsAiVerifying(true);
        try {
            const html = await buildHtmlReport(true);
            if (!html) throw new Error("Failed to build base HTML for AI");

            const aiSystemInstruction = getReportVerificationPrompt(settings.language || 'en-US');
            let aiPrompt = `USER REQUIREMENTS:\n${aiRequirementsPrompt}\n\nCURRENT HTML REPORT:\n${html}`;

            if ((settings.aiProvider === 'claude-code' || settings.aiProvider === 'antigravity-cli') && aiPrompt.length > 7000) {
                const tmp = await tempDir();
                const tmpPath = await join(tmp, `checkup_prompt_${Date.now()}.txt`);
                await writeTextFile(tmpPath, aiPrompt);
                aiPrompt = `Please read my requirements and the HTML report from this temporary file: ${tmpPath}`;
            }

            const response = await askAgent(aiPrompt, [], aiSystemInstruction, settings);
            let modifiedHtml = html;

            try {
                const responseData = typeof response.response === 'string' ? JSON.parse(response.response) : response.response;
                let aiHtmlContent = responseData.ai_section_html || responseData.reply;

                if (aiHtmlContent) {
                    if (aiHtmlContent.startsWith('```html')) {
                        aiHtmlContent = aiHtmlContent.replace(/^```html\n?/, '').replace(/\n?```$/, '');
                    } else if (aiHtmlContent.startsWith('```')) {
                        aiHtmlContent = aiHtmlContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
                    }

                    const insertPoint = modifiedHtml.indexOf('<!-- HEADER_END -->');
                    if (insertPoint !== -1) {
                        modifiedHtml = modifiedHtml.slice(0, insertPoint + 19) + '\n\n<div class="section" style="padding: 1rem; background-color: #f8f9fa; border-left: 4px solid #2563eb; margin-top: 1rem;"><strong>' + t('toolbox.checkup.ai_analysis', 'AI Analysis') + ':</strong><br/><br/>' + aiHtmlContent + '</div>\n\n' + modifiedHtml.slice(insertPoint + 19);
                    } else {
                        modifiedHtml = aiHtmlContent + modifiedHtml;
                    }
                }
            } catch (_) { }

            const deviceName = devicePropsCache['ro.product.model'] || devicePropsCache['ro.product.marketname'] || selectedDevice;
            const reportTitle = `${t('toolbox.checkup.report.ai_verify_title', 'Verify with AI')} - ${deviceName}`;

            // Register in session-scoped reports cache
            const tempReport = addTemporaryReport({
                title: reportTitle,
                deviceModel: deviceName,
                deviceUdid: selectedDevice,
                analystName: reportAnalystName.trim() || 'N/A',
                timestamp: new Date().toISOString(),
                type: 'ai_checkup',
                result: reportResult,
                comments: reportComments.trim() || undefined,
                htmlContent: modifiedHtml,
            });

            const filePath = await save({
                filters: [{ name: 'HTML Report', extensions: ['html'] }],
                defaultPath: `report_ai_verified_${selectedDevice.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.html`
            });

            if (filePath) {
                await writeTextFile(filePath, modifiedHtml);
                tempReport.filePath = filePath;
                setLastSavedReport(filePath);
                toast.success(t('toolbox.checkup.report_saved', 'AI Verified Report saved successfully!'), { id: toastId });
            } else {
                toast.dismiss(toastId);
            }
        } catch (error) {
            console.error('Failed to verify report with AI', error);
            toast.error(t('toolbox.checkup.report_error', 'Failed to verify report with AI'), { id: toastId });
        } finally {
            setIsAiVerifying(false);
        }
    };

    // Filtered device properties (when not in comparison mode)
    const devicePropsEntries = useMemo(() => {
        const entries = Object.entries(devicePropsCache);
        if (!searchQuery) return entries;
        const q = searchQuery.toLowerCase();
        return entries.filter(([k, v]) => k.toLowerCase().includes(q) || v.toLowerCase().includes(q));
    }, [devicePropsCache, searchQuery]);

    // Filtered comparisons (when in comparison mode)
    const filteredComparisons = useMemo(() => {
        return comparisons.filter(c => {
            if ((filterDivergent || onlyFailures) && c.isMatch) return false;
            if (searchQuery && !c.key.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            return true;
        });
    }, [comparisons, filterDivergent, onlyFailures, searchQuery]);

    const matchCount = comparisons.filter(c => c.isMatch).length;

    // Filtered packages
    const filteredDevicePackages = useMemo(() => {
        let pkgs = devicePackages;
        if (packageFilterPrefixes.length > 0) {
            pkgs = pkgs.filter(p => {
                const matchesPrefix = packageFilterPrefixes.some(prefix => matchesFilterPattern(p.name, prefix));
                if (packageFilterMode === 'include') return matchesPrefix;
                return !matchesPrefix;
            });
        }
        if (!packageSearchQuery) return pkgs;
        const q = packageSearchQuery.toLowerCase();
        return pkgs.filter(p => p.name.toLowerCase().includes(q) || (p.version && p.version.toLowerCase().includes(q)));
    }, [devicePackages, packageSearchQuery, packageFilterPrefixes, packageFilterMode]);

    const packageComparisonsToCount = useMemo(() => {
        if (packageFilterPrefixes.length === 0) return packageComparisons;
        return packageComparisons.filter(p => {
            const matchesPrefix = packageFilterPrefixes.some(prefix => matchesFilterPattern(p.name, prefix));
            if (packageFilterMode === 'include') return matchesPrefix;
            return !matchesPrefix;
        });
    }, [packageComparisons, packageFilterPrefixes, packageFilterMode]);

    const filteredPackageComparisons = useMemo(() => {
        let comps = packageComparisonsToCount;
        return comps.filter(p => {
            if (filterDivergent && p.isMatch) return false;
            if (packageSearchQuery && !p.name.toLowerCase().includes(packageSearchQuery.toLowerCase())) return false;
            return true;
        });
    }, [packageComparisonsToCount, filterDivergent, packageSearchQuery]);

    const disabled = isTestRunning && !allowActionsDuringTest;

    // Reusable Section Verified Button component
    const renderVerifiedButton = (sectionKey: string) => {
        const isVerified = !!verifiedSections[sectionKey];
        return (
            <Button
                variant={isVerified ? "primary" : "ghost"}
                size="sm"
                onClick={() => toggleSectionVerified(sectionKey)}
                className={clsx(
                    "h-8 px-2.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all select-none",
                    isVerified
                        ? "bg-success/20 text-success border border-success/30 hover:bg-success/30 hover:brightness-110"
                        : "text-on-surface-variant/70 hover:bg-surface-variant/40 border border-outline-variant/30 hover:text-on-surface"
                )}
                title={isVerified ? t('toolbox.checkup.verified_tooltip', 'Section verified by analyst') : t('toolbox.checkup.unverified_tooltip', 'Click to attest verification')}
                data-position="left"
            >
                <CheckCircle2 size={14} className={isVerified ? "text-success" : "text-on-surface-variant/40"} />
                <span>{isVerified ? t('toolbox.checkup.verified', 'Verified') : t('toolbox.checkup.unverified', 'Unverified')}</span>
            </Button>
        );
    };

    if (!selectedDevice) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-on-surface-variant/60 p-4 text-center">
                <ShieldCheck size={48} className="mb-4 opacity-50" />
                <p>{t('toolbox.checkup.select_device', 'Select a device for the checkup')}</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col p-4 overflow-y-auto space-y-4">
            {/* Top Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-surface/50 backdrop-blur-md p-3 rounded-xl border border-outline-variant/30 shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider">
                        {t('toolbox.checkup.title', 'Hardware & OS Checkup')}
                    </span>
                    {isGoldenLoaded && (
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium flex items-center gap-1">
                            <FileCheck size={12} />
                            {t('toolbox.checkup.golden_active', 'Golden Active')}
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {isGoldenLoaded && (
                        <Button
                            variant={filterDivergent ? "primary" : "ghost"}
                            size="sm"
                            onClick={() => setFilterDivergent(!filterDivergent)}
                            className={clsx(
                                "h-8 px-2.5 text-xs flex items-center gap-1.5 border",
                                filterDivergent
                                    ? "bg-error/15 text-error border-error/40 hover:bg-error/25 hover:brightness-110"
                                    : "border-outline-variant/30 text-on-surface-variant hover:text-on-surface"
                            )}
                            title={filterDivergent ? t('toolbox.checkup.show_all', 'Show all') : t('toolbox.checkup.show_only_divergent', 'Show only divergences')}
                            data-position="left"
                        >
                            {filterDivergent ? <FilterX size={14} /> : <Filter size={14} />}
                            <span>{filterDivergent ? t('toolbox.checkup.show_all', 'Show All') : t('toolbox.checkup.show_only_divergent', 'Only Divergences')}</span>
                        </Button>
                    )}

                    {isGoldenLoaded && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleClearGolden}
                            className="h-8 px-2.5 text-xs text-error hover:bg-error/10 hover:text-error border border-error/20 flex items-center gap-1.5"
                            title={t('toolbox.checkup.clear_golden', 'Clear Comparison')}
                            data-position="left"
                        >
                            <Trash2 size={14} />
                            <span>{t('toolbox.checkup.clear_golden', 'Clear Comparison')}</span>
                        </Button>
                    )}

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={generateGoldenFile}
                        aria-label={t('toolbox.checkup.generate_golden_file', 'Generate Golden File')}
                        title={t('toolbox.checkup.generate_golden_file', 'Generate Golden File')}
                        data-position="left"
                        disabled={disabled}
                        className="h-8 px-2.5 text-xs flex items-center gap-1.5"
                    >
                        <Download size={14} />
                        <span>{t('toolbox.checkup.generate_golden_file', 'Export Golden')}</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleImportGoldenFile}
                        aria-label={t('toolbox.checkup.import_golden_file', 'Import Golden File')}
                        title={t('toolbox.checkup.import_golden_file', 'Import Golden File')}
                        data-position="left"
                        disabled={disabled}
                        className="h-8 px-2.5 text-xs flex items-center gap-1.5"
                    >
                        <Upload size={14} />
                        <span>{t('toolbox.checkup.import_golden_file', 'Import Golden')}</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsBasePropsModalOpen(true)}
                        aria-label={t('toolbox.checkup.search_config.config_title', 'Search Configuration')}
                        title={t('toolbox.checkup.search_config.config_title', 'Search Configuration')}
                        data-position="left"
                        disabled={disabled}
                        className="h-8 px-2.5 text-xs flex items-center gap-1.5"
                    >
                        <SlidersHorizontal size={14} />
                        <span>{t('toolbox.checkup.search_config_btn', 'Search Settings')}</span>
                    </Button>

                    <Button
                        variant="primary"
                        disabled={disabled || isLoading}
                        onClick={validateAndOpenReportModal}
                        title={t('toolbox.checkup.generate_report', 'Generate Report')}
                        data-position="left"
                        size="sm"
                        className="h-8 px-3.5 text-xs flex items-center gap-1.5 shadow-md"
                    >
                        <FileText size={14} />
                        <span>{t('toolbox.checkup.generate_report', 'Generate Report')}</span>
                    </Button>
                </div>
            </div>

            {/* File Saved Feedback */}
            <FileSavedFeedback
                path={lastSavedReport}
                onClose={() => setLastSavedReport(null)}
            />

            {/* Row 1: Device Properties & Installed Packages (Side-by-Side) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[420px]">
                {/* Panel 1: Device Properties */}
                <Section
                    title={t('toolbox.checkup.prop_compare', 'Device Properties (.prop)')}
                    icon={FileText}
                    className="flex flex-col min-h-[400px] overflow-hidden"
                    contentClassName="flex-1 flex flex-col min-h-0 p-3"
                    actions={
                        <div className="flex items-center gap-2">
                            {renderVerifiedButton('props')}
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 z-10 pointer-events-none" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onFocus={() => setIsSearchFocused(true)}
                                    onBlur={() => setIsSearchFocused(false)}
                                    placeholder={isSearchFocused ? t('toolbox.checkup.search_placeholder', 'Search key...') : ''}
                                    className={`pl-9 h-8 text-xs transition-all duration-300 ${isSearchFocused ? "w-36 sm:w-44" : "w-10 cursor-pointer"}`}
                                />
                            </div>
                            <Button
                                variant="primary"
                                disabled={disabled || isLoading || !selectedDevice}
                                onClick={handleLoadRemainingProps}
                                className="h-8 px-2.5 text-xs flex items-center gap-1.5"
                                title={t('toolbox.checkup.load_remaining', 'Load Base Props')}
                                data-position="left"
                            >
                                <FileText size={14} />
                                <span>{isSearchFocused ? "" : t('toolbox.checkup.load_remaining', 'Load Base Props')}</span>
                            </Button>
                        </div>
                    }
                    menus={
                        comparisons.length > 0 ? (
                            <div className="flex items-center gap-2">
                                <span className="text-xs px-2 h-8 flex items-center justify-center bg-surface-variant/30 text-on-surface rounded-md font-mono">
                                    {matchCount} / {comparisons.length}
                                </span>
                            </div>
                        ) : undefined
                    }
                >
                    <div className="flex-1 h-full min-h-[300px] bg-surface-variant/10 rounded-xl border border-outline-variant/30 overflow-hidden flex flex-col">
                        <div className="h-full overflow-y-auto overflow-x-auto custom-scrollbar">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-full text-on-surface-variant/60 gap-3 min-h-[220px]">
                                    <ExpressiveLoading variant="circular" size="md" />
                                    <span>{t('toolbox.checkup.fetching', 'Fetching properties...')}</span>
                                </div>
                            ) : comparisons.length > 0 ? (
                                /* Golden Comparison Table (4 Columns) */
                                <table className="w-full min-w-[420px] text-left border-collapse text-xs table-fixed">
                                    <thead className="bg-surface-variant/30 backdrop-blur-md sticky top-0 shadow-sm z-10 text-on-surface-variant">
                                        <tr>
                                            <th className="p-2.5 font-medium border-b border-outline-variant/30 w-4/12">{t('toolbox.checkup.key', 'Key')}</th>
                                            <th className="p-2.5 font-medium border-b border-outline-variant/30 w-3/12">{t('toolbox.checkup.expected', 'Expected')}</th>
                                            <th className="p-2.5 font-medium border-b border-outline-variant/30 w-3/12">{t('toolbox.checkup.found', 'Found')}</th>
                                            <th className="p-2.5 font-medium border-b border-outline-variant/30 w-2/12 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredComparisons.map(c => (
                                            <tr key={c.key} className="border-b border-outline-variant/10 hover:bg-surface-variant/20 transition-colors">
                                                <td className="p-2.5 font-mono text-[11px] text-on-surface break-words leading-relaxed">{c.key}</td>
                                                <td className="p-2.5 font-mono text-[11px] text-on-surface-variant break-words leading-relaxed">{c.expected}</td>
                                                <td className={clsx(
                                                    "p-2.5 font-mono text-[11px] break-words leading-relaxed",
                                                    c.isMatch ? "text-success" : (c.isExtra ? "text-warning" : "text-error font-semibold")
                                                )}>
                                                    {c.found || <span className="italic opacity-50">{t('toolbox.checkup.not_found', 'Not found')}</span>}
                                                </td>
                                                <td className="p-2.5 text-center align-middle">
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
                            ) : (
                                /* Device Active Properties Table (2 Columns) */
                                <table className="w-full min-w-[320px] text-left border-collapse text-xs table-fixed">
                                    <thead className="bg-surface-variant/30 backdrop-blur-md sticky top-0 shadow-sm z-10 text-on-surface-variant">
                                        <tr>
                                            <th className="p-2.5 font-medium border-b border-outline-variant/30 w-5/12">{t('toolbox.checkup.key', 'Key')}</th>
                                            <th className="p-2.5 font-medium border-b border-outline-variant/30 w-7/12">{t('toolbox.checkup.found', 'Found Value')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {devicePropsEntries.length > 0 ? (
                                            devicePropsEntries.map(([key, val]) => (
                                                <tr key={key} className="border-b border-outline-variant/10 hover:bg-surface-variant/20 transition-colors">
                                                    <td className="p-2.5 font-mono text-[11px] text-on-surface break-words leading-relaxed">{key}</td>
                                                    <td className="p-2.5 font-mono text-[11px] text-on-surface-variant break-words leading-relaxed">{val}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={2} className="p-8 text-center text-on-surface-variant/50 italic">
                                                    {t('toolbox.checkup.no_props', 'No properties loaded. Click "Import .prop" or connect Companion.')}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </Section>

                {/* Panel 2: Installed Packages & Apps */}
                <Section
                    title={t('toolbox.checkup.installed_packages', 'Installed Apps & Packages')}
                    icon={Layers}
                    className="flex flex-col min-h-[400px] overflow-hidden"
                    contentClassName="flex-1 flex flex-col min-h-0 p-3"
                    actions={
                        <div className="flex items-center gap-2">
                            {renderVerifiedButton('packages')}
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 z-10 pointer-events-none" />
                                <Input
                                    value={packageSearchQuery}
                                    onChange={(e) => setPackageSearchQuery(e.target.value)}
                                    placeholder={t('toolbox.checkup.search_pkg', 'Search app...')}
                                    className="pl-9 h-8 text-xs w-32 sm:w-40"
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={fetchInstalledPackages}
                                disabled={disabled || isLoadingPackages}
                                className="h-8 w-8 p-0 flex items-center justify-center shrink-0 rounded-md"
                                title={t('common.refresh', 'Refresh')}
                                data-position="left"
                            >
                                <RefreshCw size={14} className={clsx(isLoadingPackages && "animate-spin")} />
                            </Button>
                        </div>
                    }
                    menus={
                        packageComparisonsToCount.length > 0 && packageComparisonsToCount.some(p => p.goldenVersion !== undefined) ? (
                            <div className="flex items-center gap-2">
                                <span className="text-xs px-2 h-8 flex items-center justify-center bg-surface-variant/30 text-on-surface rounded-md font-mono">
                                    {packageComparisonsToCount.filter(p => p.isMatch).length} / {packageComparisonsToCount.length}
                                </span>
                            </div>
                        ) : undefined
                    }
                >
                    <div className="flex-1 h-full min-h-[300px] bg-surface-variant/10 rounded-xl border border-outline-variant/30 overflow-hidden flex flex-col">
                        <div className="h-full overflow-y-auto overflow-x-auto custom-scrollbar">
                            {isLoadingPackages ? (
                                <div className="flex items-center justify-center h-full text-on-surface-variant/60 gap-3 min-h-[220px]">
                                    <ExpressiveLoading variant="circular" size="md" />
                                    <span>{t('toolbox.checkup.fetching_packages', 'Fetching installed apps...')}</span>
                                </div>
                            ) : packageComparisons.length > 0 && packageComparisons.some(p => p.goldenVersion !== undefined) ? (
                                /* Packages Comparison Table (4 Columns) */
                                <table className="w-full min-w-[420px] text-left border-collapse text-xs table-fixed">
                                    <thead className="bg-surface-variant/30 backdrop-blur-md sticky top-0 shadow-sm z-10 text-on-surface-variant">
                                        <tr>
                                            <th className="p-2.5 font-medium border-b border-outline-variant/30 w-4/12">{t('toolbox.checkup.package_name', 'Package')}</th>
                                            <th className="p-2.5 font-medium border-b border-outline-variant/30 w-3/12">{t('toolbox.checkup.expected', 'Expected')}</th>
                                            <th className="p-2.5 font-medium border-b border-outline-variant/30 w-3/12">{t('toolbox.checkup.device', 'Device')}</th>
                                            <th className="p-2.5 font-medium border-b border-outline-variant/30 w-2/12 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredPackageComparisons.map(p => (
                                            <tr key={p.name} className="border-b border-outline-variant/10 hover:bg-surface-variant/20 transition-colors">
                                                <td className="p-2.5 font-mono text-[11px] text-on-surface break-words leading-relaxed">{p.name}</td>
                                                <td className="p-2.5 font-mono text-[11px] text-on-surface-variant break-words leading-relaxed">{p.goldenVersion || '-'}</td>
                                                <td className={clsx(
                                                    "p-2.5 font-mono text-[11px] break-words leading-relaxed",
                                                    p.isMatch ? "text-success" : "text-error font-semibold"
                                                )}>
                                                    {p.deviceVersion || <span className="italic opacity-50">{t('toolbox.checkup.not_installed', 'Not installed')}</span>}
                                                </td>
                                                <td className="p-2.5 text-center align-middle">
                                                    {p.isMatch
                                                        ? <CheckCircle2 size={16} className="text-success mx-auto drop-shadow-sm" />
                                                        : (p.isMissing
                                                            ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-error/10 text-error font-semibold">{t('toolbox.checkup.status_missing', 'Missing')}</span>
                                                            : <XCircle size={16} className="text-error mx-auto drop-shadow-sm" />
                                                        )
                                                    }
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                /* Device Installed Apps List (3 Columns) */
                                <table className="w-full min-w-[360px] text-left border-collapse text-xs table-fixed">
                                    <thead className="bg-surface-variant/30 backdrop-blur-md sticky top-0 shadow-sm z-10 text-on-surface-variant">
                                        <tr>
                                            <th className="p-2.5 font-medium border-b border-outline-variant/30 w-6/12">{t('toolbox.checkup.package_name', 'Package Name')}</th>
                                            <th className="p-2.5 font-medium border-b border-outline-variant/30 w-3/12">{t('toolbox.checkup.version', 'Version')}</th>
                                            <th className="p-2.5 font-medium border-b border-outline-variant/30 w-3/12 text-center">{t('toolbox.checkup.type', 'Type')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredDevicePackages.length > 0 ? (
                                            filteredDevicePackages.map(pkg => (
                                                <tr key={pkg.name} className="border-b border-outline-variant/10 hover:bg-surface-variant/20 transition-colors">
                                                    <td className="p-2.5 font-mono text-[11px] text-on-surface break-words leading-relaxed">{pkg.name}</td>
                                                    <td className="p-2.5 font-mono text-[11px] text-on-surface-variant break-words leading-relaxed">{pkg.version || '-'}</td>
                                                    <td className="p-2.5 text-center align-middle">
                                                        <span className={clsx(
                                                            "text-[10px] px-2 py-0.5 rounded-full font-medium",
                                                            pkg.is_system ? "bg-surface-variant/40 text-on-surface-variant" : "bg-primary/10 text-primary border border-primary/20"
                                                        )}>
                                                            {pkg.is_system ? t('toolbox.checkup.system', 'System') : t('toolbox.checkup.user', 'User')}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={3} className="p-8 text-center text-on-surface-variant/50 italic">
                                                    {t('toolbox.checkup.no_packages_found', 'No packages found or device not connected.')}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </Section>
            </div>

            {/* Row 2: Standard Checks & Additional Checks */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[380px]">
                {/* Standard Checks Panel */}
                <Section
                    title={t('toolbox.checkup.standard_checks', 'Standard Checklist')}
                    icon={ShieldCheck}
                    className="flex flex-col min-h-[380px] overflow-hidden"
                    contentClassName="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0"
                    actions={
                        <div className="flex items-center gap-2">
                            {renderVerifiedButton('standardChecks')}
                            <Button
                                variant="secondary"
                                size="sm"
                                title={t('toolbox.checkup.run_checks', 'Run Checks')}
                                data-position="left"
                                onClick={runStandardChecks}
                                disabled={disabled || standardChecks.some(c => c.status === 'running')}
                                className="h-8 px-2.5 text-xs flex items-center gap-1.5"
                            >
                                <Play size={14} className={clsx(standardChecks.some(c => c.status === 'running') && "animate-spin")} />
                                <span>{t('toolbox.checkup.run', 'Run')}</span>
                            </Button>
                        </div>
                    }
                >
                    {displayedStandardChecks.length === 0 ? (
                        <div className="p-8 text-center text-xs text-on-surface-variant/60 italic">
                            {t('toolbox.checkup.no_divergences', 'No divergences found.')}
                        </div>
                    ) : (
                        displayedStandardChecks.map(check => (
                            <div key={check.id} className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-surface/40 border border-outline-variant/20 hover:border-outline-variant/40 transition-colors">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-medium text-on-surface">{check.name}</span>
                                    {check.status === 'running' && <ExpressiveLoading variant="circular" size="xsm" />}
                                    {checkResults[check.id]?.goldenExpected !== undefined ? (
                                        checkResults[check.id]?.isGoldenMatch
                                            ? <span className="text-[10px] px-2 py-0.5 bg-success/10 text-success border border-success/20 rounded font-semibold">{t('toolbox.checkup.status_match', 'Match')}</span>
                                            : <span className="text-[10px] px-2 py-0.5 bg-error/10 text-error border border-error/20 rounded font-semibold">{t('toolbox.checkup.status_mismatch', 'Mismatch')}</span>
                                    ) : (
                                        <>
                                            {check.status === 'correct' && <span className="text-[10px] px-2 py-0.5 bg-success/10 text-success border border-success/20 rounded font-semibold">{t('toolbox.checkup.status_correct', 'Correct')}</span>}
                                            {check.status === 'incorrect' && <span className="text-[10px] px-2 py-0.5 bg-error/10 text-error border border-error/20 rounded font-semibold">{t('toolbox.checkup.status_incorrect', 'Incorrect')}</span>}
                                            {check.status === 'idle' && <span className="text-[10px] px-2 py-0.5 bg-surface-variant/30 text-on-surface-variant/60 rounded">{t('common.waiting', 'Waiting')}</span>}
                                        </>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center justify-between text-[11px] text-on-surface-variant gap-1">
                                    <code className="text-[10px] text-on-surface-variant/70">{check.command.join(' ')}</code>
                                    {check.found && (
                                        <span className="font-mono font-medium text-on-surface">
                                            {t('toolbox.checkup.found', 'Found')}: {check.found}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </Section>

                {/* Additional Checks Panel */}
                <Section
                    title={t('toolbox.checkup.additional_checks', 'Additional Checks')}
                    icon={ListPlus}
                    className="flex flex-col min-h-[380px] overflow-hidden"
                    contentClassName="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0"
                    actions={
                        <div className="flex items-center gap-2">
                            {renderVerifiedButton('additionalChecks')}
                            <Button
                                variant="secondary"
                                size="sm"
                                title={t('toolbox.checkup.run_checks', 'Run Checks')}
                                data-position="left"
                                onClick={runAdditionalChecks}
                                disabled={disabled || additionalChecks.some(c => c.status === 'running')}
                                className="h-8 px-2.5 text-xs flex items-center gap-1.5"
                            >
                                <Play size={14} className={clsx(additionalChecks.some(c => c.status === 'running') && "animate-spin")} />
                                <span>{t('toolbox.checkup.run', 'Run')}</span>
                            </Button>
                        </div>
                    }
                >
                    {displayedAdditionalChecks.length === 0 ? (
                        <div className="p-8 text-center text-xs text-on-surface-variant/60 italic">
                            {t('toolbox.checkup.no_divergences', 'No divergences found.')}
                        </div>
                    ) : (
                        displayedAdditionalChecks.map(check => (
                            <div key={check.id} className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-surface/40 border border-outline-variant/20 hover:border-outline-variant/40 transition-colors">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-medium text-on-surface">{check.name}</span>
                                    {check.status === 'running' && <ExpressiveLoading variant="circular" size="xsm" />}
                                    {additionalCheckResults[check.id]?.goldenExpected !== undefined ? (
                                        additionalCheckResults[check.id]?.isGoldenMatch
                                            ? <span className="text-[10px] px-2 py-0.5 bg-success/10 text-success border border-success/20 rounded font-semibold">{t('toolbox.checkup.status_match', 'Match')}</span>
                                            : <span className="text-[10px] px-2 py-0.5 bg-warning/10 text-warning border border-warning/20 rounded font-semibold">{t('toolbox.checkup.status_mismatch', 'Mismatch')}</span>
                                    ) : (
                                        <>
                                            {check.status === 'done' && <span className="text-[10px] px-2 py-0.5 bg-info/10 text-info border border-info/20 rounded font-semibold">{t('common.done', 'Done')}</span>}
                                            {check.status === 'idle' && <span className="text-[10px] px-2 py-0.5 bg-surface-variant/30 text-on-surface-variant/60 rounded">{t('common.waiting', 'Waiting')}</span>}
                                        </>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center justify-between text-[11px] text-on-surface-variant gap-1">
                                    <code className="text-[10px] text-on-surface-variant/70">{check.command.join(' ')}</code>
                                    {check.found && (
                                        <span className="font-mono font-medium text-on-surface">
                                            {check.found}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </Section>
            </div>

            {/* Manual Checks Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[380px]">
                <Section
                    title={t('toolbox.checkup.manual_checks', 'Manual Checklist')}
                    icon={CheckSquare}
                    className="flex flex-col min-h-[380px] overflow-hidden"
                    contentClassName="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0"
                    actions={
                        <div className="flex items-center gap-2">
                            {renderVerifiedButton('manualChecks')}
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={openAddManualCheck}
                                disabled={disabled}
                                className="h-8 px-2.5 text-xs flex items-center gap-1.5"
                                title={t('toolbox.checkup.add_check', 'Add Check')}
                                data-position="left"
                            >
                                <Plus size={14} />
                                <span>{t('toolbox.checkup.add_check', 'Add Check')}</span>
                            </Button>
                        </div>
                    }
                >
                    {manualChecks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-on-surface-variant/40 p-8 text-center min-h-[180px]">
                            <CheckSquare size={36} className="mb-2 opacity-50" />
                            <p className="text-xs max-w-[260px]">
                                {t('toolbox.checkup.no_manual_checks', 'No manual checks added yet. Click "Add Check" to record custom hardware/visual inspections.')}
                            </p>
                        </div>
                    ) : (
                        manualChecks.map(item => {
                            const isPass = item.status === 'pass';
                            const isFail = item.status === 'fail';

                            return (
                                <div key={item.id} className="p-3 rounded-xl bg-surface/50 border border-outline-variant/30 hover:border-outline-variant/60 transition-all flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className={clsx(
                                                "text-[10px] px-2 py-0.5 rounded font-semibold border uppercase",
                                                isPass ? "bg-success/10 text-success border-success/20" : (isFail ? "bg-error/10 text-error border-error/20" : "bg-surface-variant/40 text-on-surface-variant border-outline-variant/30")
                                            )}>
                                                {isPass ? t('toolbox.checkup.conforme', 'CONFORME') : (isFail ? t('toolbox.checkup.nao_conforme', 'NÃO CONFORME') : 'N/A')}
                                            </span>
                                            <h4 className="text-xs font-semibold text-on-surface">{item.name}</h4>
                                        </div>

                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => openEditManualCheck(item)}
                                                className="h-7 w-7 p-0 flex items-center justify-center rounded"
                                                title={t('common.edit', 'Edit')}
                                                data-position="left"
                                            >
                                                <Edit3 size={12} className="text-on-surface-variant/70" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => deleteManualCheck(item.id)}
                                                className="h-7 w-7 p-0 flex items-center justify-center rounded hover:text-error"
                                                title={t('common.delete', 'Delete')}
                                                data-position="left"
                                            >
                                                <Trash2 size={12} />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="text-xs text-on-surface-variant">
                                        {item.type === 'image' && item.valueImageBase64 ? (
                                            <div className="flex items-center gap-3 mt-1">
                                                <div
                                                    className="relative cursor-pointer group rounded-lg overflow-hidden border border-outline-variant/40 max-w-[120px] max-h-[80px]"
                                                    onClick={() => setSelectedImagePreview(item.valueImageBase64 || null)}
                                                >
                                                    <img src={item.valueImageBase64} alt={item.name} className="w-full h-full object-cover" />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                                        <Eye size={16} />
                                                    </div>
                                                </div>
                                                <span className="text-[11px] text-on-surface-variant/70 italic">{t('toolbox.checkup.click_to_zoom', 'Click thumbnail to zoom')}</span>
                                            </div>
                                        ) : (
                                            <div className="font-mono text-[11px] text-on-surface bg-surface-variant/20 p-1.5 rounded border border-outline-variant/20">
                                                {item.valueText || '-'}
                                            </div>
                                        )}
                                    </div>

                                    {item.notes && (
                                        <p className="text-[11px] text-on-surface-variant/80 italic border-t border-outline-variant/10 pt-1">
                                            <strong>{t('toolbox.checkup.notes', 'Obs')}:</strong> {item.notes}
                                        </p>
                                    )}
                                </div>
                            );
                        })
                    )}
                </Section>

                {/* Row 4: UI Text Checks & Interactive Hardware Tests */}
                {/* UI Text Checks Panel */}
                <Section
                    title={t('toolbox.checkup.ui_text_checks', 'Screen & UI Text Check')}
                    icon={Tv}
                    className="flex flex-col min-h-[380px] overflow-hidden"
                    contentClassName="flex-1 overflow-y-auto p-3 space-y-3 min-h-0"
                    actions={
                        <div className="flex items-center gap-2">
                            {renderVerifiedButton('uiTextChecks')}
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={runAllUiTextChecks}
                                disabled={disabled || uiTextChecks.some(c => c.status === 'running')}
                                className="h-8 px-2.5 text-xs flex items-center gap-1.5"
                                title={t('toolbox.checkup.run_all', 'Run All')}
                                data-position="left"
                            >
                                <Play size={14} className={clsx(uiTextChecks.some(c => c.status === 'running') && "animate-spin")} />
                                <span>{t('toolbox.checkup.run_all', 'Run All')}</span>
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => {
                                    setEditingUiCheck(null);
                                    setUiCheckNameInput('');
                                    setUiCheckActivityInput('');
                                    setUiCheckDelayInput('1500');
                                    setIsUiCheckModalOpen(true);
                                }}
                                disabled={disabled}
                                className="h-8 px-2.5 text-xs flex items-center gap-1.5"
                                title={t('common.add', 'Add')}
                                data-position="left"
                            >
                                <Plus size={14} />
                                <span>{t('common.add', 'Add')}</span>
                            </Button>
                        </div>
                    }
                >
                    {uiTextChecks.map(check => {
                        const isExpanded = expandedUiCheckIds.has(check.id);
                        const hasFoundTexts = check.foundTexts && check.foundTexts.length > 0;
                        const hasExpectedTexts = check.expectedTexts && check.expectedTexts.length > 0;
                        const isGoldenConfigured = Boolean(hasExpectedTexts);

                        return (
                            <div key={check.id} className="p-3 rounded-xl bg-surface/50 border border-outline-variant/30 flex flex-col gap-2 transition-all">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <input
                                            type="checkbox"
                                            checked={check.enabled}
                                            onChange={(e) => {
                                                const enabled = e.target.checked;
                                                setUiTextChecks(prev => prev.map(c => c.id === check.id ? { ...c, enabled } : c));
                                            }}
                                            className="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4 shrink-0"
                                        />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h4 className="text-xs font-semibold text-on-surface truncate">{check.name}</h4>
                                                {check.status === 'running' ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full font-medium">
                                                        <ExpressiveLoading variant="circular" size="xsm" />
                                                        {t('common.running', 'Running...')}
                                                    </span>
                                                ) : check.isGoldenMatch === true ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-success/10 text-success border border-success/20 rounded-full font-semibold">
                                                        <CheckCircle2 size={10} />
                                                        {t('toolbox.checkup.conforme', 'CONFORME')}
                                                    </span>
                                                ) : check.isGoldenMatch === false ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-error/10 text-error border border-error/20 rounded-full font-semibold">
                                                        <XCircle size={10} />
                                                        {t('toolbox.checkup.nao_conforme', 'NÃO CONFORME')}
                                                    </span>
                                                ) : hasFoundTexts ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-info/10 text-info border border-info/20 rounded-full font-medium">
                                                        {t('toolbox.checkup.captured_texts_count', '{{count}} captured texts', { count: check.foundTexts?.length || 0 })}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-surface-variant/30 text-on-surface-variant/70 rounded-full font-medium">
                                                        {t('common.pending', 'Pending')}
                                                    </span>
                                                )}
                                            </div>
                                            <code className="text-[10px] text-on-surface-variant/70 block truncate">{check.activity || 'Current Screen'}</code>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => runSingleUiTextCheck(check)}
                                            disabled={disabled || check.status === 'running'}
                                            className="h-7 px-2 text-xs"
                                            title={t('common.run', 'Run')}
                                            data-position="left"
                                        >
                                            <Play size={12} className={clsx(check.status === 'running' && "animate-spin")} />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setEditingUiCheck(check);
                                                setUiCheckNameInput(check.name);
                                                setUiCheckActivityInput(check.activity);
                                                setUiCheckDelayInput(String(check.delayMs || 1500));
                                                setIsUiCheckModalOpen(true);
                                            }}
                                            className="h-7 w-7 p-0 flex items-center justify-center rounded"
                                            title={t('common.edit', 'Edit')}
                                            data-position="left"
                                        >
                                            <Edit3 size={12} />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setUiTextChecks(prev => prev.filter(c => c.id !== check.id))}
                                            className="h-7 w-7 p-0 flex items-center justify-center rounded hover:text-error"
                                            title={t('common.delete', 'Delete')}
                                            data-position="left"
                                        >
                                            <Trash2 size={12} />
                                        </Button>
                                    </div>
                                </div>

                                {/* Quick Summary & Expand Accordion */}
                                <div className="flex items-center justify-between pt-1 border-t border-outline-variant/15 text-[11px] text-on-surface-variant">
                                    <div className="flex items-center gap-2">
                                        <span>
                                            <strong>{check.foundTexts?.length || 0}</strong> {t('toolbox.checkup.captured_texts_count', 'captured texts', { count: check.foundTexts?.length || 0 })}
                                            {isGoldenConfigured && (
                                                <span className="text-on-surface-variant/70 ml-1">
                                                    ({t('toolbox.checkup.expected_texts_count', '{{count}} expected', { count: check.expectedTexts?.length || 0 })})
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => toggleExpandUiCheck(check.id)}
                                        className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                                    >
                                        <span>{isExpanded ? t('toolbox.checkup.hide_captured_texts', 'Hide texts') : t('toolbox.checkup.view_captured_texts', 'View captured texts')}</span>
                                        <ChevronDown size={14} className={clsx("transition-transform duration-200", isExpanded && "rotate-180")} />
                                    </button>
                                </div>

                                {/* Expanded UI Texts List */}
                                {isExpanded && (
                                    <div className="mt-1 bg-surface-variant/20 rounded-lg p-2 border border-outline-variant/20 max-h-[220px] overflow-y-auto">
                                        {isGoldenConfigured ? (
                                            <table className="w-full text-left text-[11px] table-fixed">
                                                <thead>
                                                    <tr className="border-b border-outline-variant/20 text-on-surface-variant text-[10px]">
                                                        <th className="p-1 w-1/2 font-semibold">{t('toolbox.checkup.expected', 'Expected')}</th>
                                                        <th className="p-1 w-1/2 font-semibold">{t('toolbox.checkup.found', 'Found')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {Array.from({ length: Math.max(check.expectedTexts?.length || 0, check.foundTexts?.length || 0) }).map((_, idx) => {
                                                        const exp = check.expectedTexts?.[idx] || '-';
                                                        const fnd = check.foundTexts?.[idx] || '-';
                                                        const isItemMatch = exp.trim() === fnd.trim();
                                                        return (
                                                            <tr key={idx} className="border-b border-outline-variant/10">
                                                                <td className="p-1 text-on-surface-variant truncate font-mono text-[10px]">{exp}</td>
                                                                <td className={clsx(
                                                                    "p-1 truncate font-mono text-[10px] font-medium",
                                                                    isItemMatch ? "text-success" : "text-error"
                                                                )}>
                                                                    {fnd}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        ) : hasFoundTexts ? (
                                            <div className="flex flex-wrap gap-1">
                                                {check.foundTexts!.map((txt, idx) => (
                                                    <span
                                                        key={idx}
                                                        className="px-2 py-0.5 rounded bg-surface border border-outline-variant/30 text-[10px] font-mono text-on-surface select-all"
                                                        title={txt}
                                                    >
                                                        {txt}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-[11px] text-on-surface-variant/60 italic text-center py-2">
                                                {t('toolbox.checkup.no_texts_captured_yet', 'No texts captured yet. Click Run to inspect the screen.')}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </Section>
            </div>

            {/* Row 3: Companion BDD Tests & Manual Checks */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[380px]">
                {/* Companion BDD Tests Panel */}
                <Section
                    title={t('toolbox.checkup.companion_bdd_tests', 'Companion BDD Tests')}
                    icon={Tv}
                    className="flex flex-col min-h-[380px] overflow-hidden"
                    contentClassName="flex-1 overflow-y-auto p-3 space-y-3 min-h-0"
                    actions={
                        <div className="flex items-center gap-2">
                            {renderVerifiedButton('companionBdd')}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={fetchCompanionBddTests}
                                disabled={disabled || isLoadingCompanionTests}
                                className="h-8 w-8 p-0 flex items-center justify-center shrink-0 rounded-md"
                                title={t('common.refresh', 'Sync Tests')}
                                data-position="left"
                            >
                                <RefreshCw size={14} className={clsx(isLoadingCompanionTests && "animate-spin")} />
                            </Button>
                        </div>
                    }
                >
                    {isLoadingCompanionTests ? (
                        <div className="flex items-center justify-center h-full text-on-surface-variant/60 gap-3 min-h-[180px]">
                            <ExpressiveLoading variant="circular" size="md" />
                            <span>{t('toolbox.checkup.syncing_companion_tests', 'Syncing tests from Companion...')}</span>
                        </div>
                    ) : companionBddSuites.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-on-surface-variant/40 p-8 text-center min-h-[180px]">
                            <Tv size={36} className="mb-2 opacity-50" />
                            <p className="text-xs max-w-[260px]">
                                {t('toolbox.checkup.no_companion_tests', 'No BDD test suites found. Create or execute tests on the Companion app to sync here.')}
                            </p>
                        </div>
                    ) : (
                        companionBddSuites.map(suite => {
                            const report = suite.lastReport;
                            const isExpanded = expandedSuiteId === suite.id;
                            const hasPassed = report ? report.failedScenarios === 0 : false;

                            return (
                                <div key={suite.id} className="p-3 rounded-xl bg-surface/50 border border-outline-variant/30 hover:border-outline-variant/60 transition-all flex flex-col gap-2">
                                    <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedSuiteId(isExpanded ? null : suite.id)}>
                                        <div className="flex items-center gap-2">
                                            {isExpanded ? <ChevronDown size={16} className="text-primary" /> : <ChevronRight size={16} className="text-on-surface-variant/60" />}
                                            <div>
                                                <h4 className="text-xs font-semibold text-on-surface">{suite.name}</h4>
                                                <span className="text-[10px] text-on-surface-variant/70 font-mono">{suite.targetPackage || 'Generic Package'}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {report ? (
                                                <span className={clsx(
                                                    "text-[10px] px-2 py-0.5 rounded font-semibold border",
                                                    hasPassed ? "bg-success/10 text-success border-success/20" : "bg-error/10 text-error border-error/20"
                                                )}>
                                                    {report.passedScenarios}/{report.totalScenarios} {hasPassed ? t('common.passed', 'Passed') : t('common.failed', 'Failed')}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] px-2 py-0.5 rounded bg-surface-variant/30 text-on-surface-variant">
                                                    {t('common.waiting', 'Idle')}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {isExpanded && report && (
                                        <div className="mt-2 pt-2 border-t border-outline-variant/20 space-y-2">
                                            {report.testCases.map((tc, idx) => (
                                                <div key={idx} className="p-2 rounded bg-surface-variant/20 text-xs">
                                                    <div className="flex items-center justify-between font-medium">
                                                        <span>{tc.name}</span>
                                                        <span className={clsx("text-[10px]", tc.status === 'passed' ? 'text-success font-semibold' : 'text-error font-semibold')}>
                                                            {(tc.status === 'passed' ? t('common.passed', 'PASSED') : t('common.failed', 'FAILED')).toUpperCase()} ({tc.durationMs}ms)
                                                        </span>
                                                    </div>
                                                    <div className="mt-1 space-y-0.5 pl-2 border-l border-outline-variant/40">
                                                        {tc.steps.map((st, sIdx) => (
                                                            <div key={sIdx} className="text-[11px] text-on-surface-variant flex items-center justify-between">
                                                                <span><strong>{st.keyword}</strong> {st.args.join(' ')}</span>
                                                                <span className={st.status === 'passed' ? 'text-success' : 'text-error'}>
                                                                    {st.status === 'passed' ? '✓' : '✗'}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </Section>

                {/* Interactive Hardware Tests Panel */}
                <Section
                    title={t('toolbox.checkup.interactive_tests', 'Interactive Hardware Tests')}
                    icon={Smartphone}
                    className="flex flex-col min-h-[380px] overflow-hidden"
                    contentClassName="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0"
                    actions={
                        <div className="flex items-center gap-2">
                            {renderVerifiedButton('interactiveTests')}
                            <div className="text-xs text-on-surface-variant flex items-center gap-1.5">
                                {companionStatus === 'connected' ? (
                                    <><span className="w-2 h-2 rounded-full bg-success animate-pulse"></span> {t('toolbox.checkup.live_sync', 'Live Sync')}</>
                                ) : (
                                    <><span className="w-2 h-2 rounded-full bg-error"></span> {t('toolbox.checkup.offline', 'Offline')}</>
                                )}
                            </div>
                        </div>
                    }
                >
                    {Object.keys(interactiveTestResults).length === 0 ? (
                        <div className="text-xs text-on-surface-variant/50 p-6 text-center border border-dashed border-outline-variant/30 rounded-xl bg-surface/20">
                            {t('toolbox.checkup.no_interactive_tests', 'No interactive tests executed yet. Run touchscreen/buttons check on Companion app.')}
                        </div>
                    ) : (
                        Object.entries(interactiveTestResults).map(([key, passed]) => (
                            <div key={key} className="flex items-center justify-between p-2.5 rounded-lg bg-surface/40 border border-outline-variant/20">
                                <span className="text-xs font-medium text-on-surface">
                                    {t(`toolbox.checkup.test_${key}`, key.charAt(0).toUpperCase() + key.slice(1))}
                                </span>
                                {passed === true && <span className="text-[10px] px-2 py-0.5 bg-success/10 text-success border border-success/20 rounded font-semibold">{t('common.passed', 'Passed')}</span>}
                                {passed === false && <span className="text-[10px] px-2 py-0.5 bg-error/10 text-error border border-error/20 rounded font-semibold">{t('common.failed', 'Failed')}</span>}
                                {passed === null && <span className="text-[10px] px-2 py-0.5 bg-warning/10 text-warning border border-warning/20 rounded font-semibold">{t('common.waiting', 'Waiting')}</span>}
                            </div>
                        ))
                    )}
                </Section>
            </div>

            {/* Manual Check Add/Edit Modal */}
            <Modal
                isOpen={isManualCheckModalOpen}
                onClose={() => setIsManualCheckModalOpen(false)}
                title={editingManualCheck ? t('toolbox.checkup.edit_manual_check', 'Edit Manual Check') : t('toolbox.checkup.add_manual_check', 'Add Manual Check')}
                className="max-w-md w-[90vw]"
            >
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="text-xs font-semibold text-on-surface mb-1 block">
                            {t('toolbox.checkup.check_name', 'Check / Item Name')} <span className="text-error">*</span>
                        </label>
                        <Input
                            value={manualCheckName}
                            onChange={(e) => setManualCheckName(e.target.value)}
                            placeholder={t('toolbox.checkup.manual_name_placeholder', 'e.g. Touchscreen Glass, Rear Camera Lens, Anatel Label')}
                        />
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-on-surface mb-1 block">
                            {t('toolbox.checkup.value_type', 'Evidence / Value Type')}
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                variant={manualCheckType === 'text' ? 'primary' : 'outline'}
                                size="sm"
                                onClick={() => setManualCheckType('text')}
                                className="h-8 text-xs flex items-center justify-center gap-1.5"
                                title={t('toolbox.checkup.type_text', 'Text / Specs')}
                                data-position="bottom"
                            >
                                <FileText size={14} />
                                <span>{t('toolbox.checkup.type_text', 'Text / Specs')}</span>
                            </Button>
                            <Button
                                variant={manualCheckType === 'image' ? 'primary' : 'outline'}
                                size="sm"
                                onClick={() => setManualCheckType('image')}
                                className="h-8 text-xs flex items-center justify-center gap-1.5"
                                title={t('toolbox.checkup.type_image', 'Photo / Evidence')}
                                data-position="bottom"
                            >
                                <ImageIcon size={14} />
                                <span>{t('toolbox.checkup.type_image', 'Photo / Evidence')}</span>
                            </Button>
                        </div>
                    </div>

                    {manualCheckType === 'text' ? (
                        <div>
                            <label className="text-xs font-semibold text-on-surface mb-1 block">
                                {t('toolbox.checkup.value_text', 'Value / Observation Text')}
                            </label>
                            <Input
                                value={manualCheckValueText}
                                onChange={(e) => setManualCheckValueText(e.target.value)}
                                placeholder={t('toolbox.checkup.manual_value_placeholder', 'e.g. 1080x2400 AMOLED 120Hz, No scratches')}
                            />
                        </div>
                    ) : (
                        <div>
                            <label className="text-xs font-semibold text-on-surface mb-1 block">
                                {t('toolbox.checkup.value_image', 'Attach Photo / Screenshot')}
                            </label>
                            {manualCheckValueImage ? (
                                <div className="flex flex-col gap-2">
                                    <div className="relative rounded-xl overflow-hidden border border-outline-variant/40 max-h-[160px] bg-black/20 flex items-center justify-center">
                                        <img src={manualCheckValueImage} alt="Preview" className="max-h-[160px] object-contain" />
                                    </div>
                                    <Button variant="outline" size="sm" onClick={handlePickManualImage} className="h-8 text-xs" title={t('toolbox.checkup.change_image', 'Change Image')} data-position="bottom">
                                        <Upload size={14} className="mr-1.5" />
                                        {t('toolbox.checkup.change_image', 'Change Image')}
                                    </Button>
                                </div>
                            ) : (
                                <Button variant="outline" size="sm" onClick={handlePickManualImage} className="w-full h-16 border-dashed text-xs flex flex-col items-center justify-center gap-1" title={t('toolbox.checkup.upload_image_btn', 'Select Image File (PNG, JPG, WEBP)...')} data-position="bottom">
                                    <ImageIcon size={20} className="text-on-surface-variant/60" />
                                    <span>{t('toolbox.checkup.upload_image_btn', 'Select Image File (PNG, JPG, WEBP)...')}</span>
                                </Button>
                            )}
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-semibold text-on-surface mb-1 block">
                            {t('toolbox.checkup.status', 'Attestation Status')}
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            <Button
                                variant={manualCheckStatus === 'pass' ? 'primary' : 'outline'}
                                size="sm"
                                onClick={() => setManualCheckStatus('pass')}
                                className={clsx("h-8 text-xs", manualCheckStatus === 'pass' && "bg-success border-success text-white")}
                                title={t('toolbox.checkup.conforme', 'CONFORME')}
                                data-position="bottom"
                            >
                                {t('toolbox.checkup.conforme', 'CONFORME')}
                            </Button>
                            <Button
                                variant={manualCheckStatus === 'fail' ? 'primary' : 'outline'}
                                size="sm"
                                onClick={() => setManualCheckStatus('fail')}
                                className={clsx("h-8 text-xs", manualCheckStatus === 'fail' && "bg-error border-error text-white")}
                                title={t('toolbox.checkup.nao_conforme', 'NÃO CONF.')}
                                data-position="bottom"
                            >
                                {t('toolbox.checkup.nao_conforme', 'NÃO CONF.')}
                            </Button>
                            <Button
                                variant={manualCheckStatus === 'na' ? 'primary' : 'outline'}
                                size="sm"
                                onClick={() => setManualCheckStatus('na')}
                                className="h-8 text-xs"
                                title={t('toolbox.checkup.not_applicable', 'Not Applicable')}
                                data-position="bottom"
                            >
                                N/A
                            </Button>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-on-surface mb-1 block">
                            {t('toolbox.checkup.notes', 'Analyst Notes / Comments')}
                        </label>
                        <Textarea
                            value={manualCheckNotes}
                            onChange={(e) => setManualCheckNotes(e.target.value)}
                            placeholder={t('toolbox.checkup.notes_placeholder', 'Additional details, serial inspection, or physical defects...')}
                            className="min-h-[70px] text-xs"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-outline-variant/30">
                    <Button variant="ghost" onClick={() => setIsManualCheckModalOpen(false)}
                        title={t('common.cancel', 'Cancel')}
                        data-position="top"
                    >
                        {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button variant="primary" onClick={saveManualCheck}
                        title={t('common.save', 'Save')}
                        data-position="top"
                    >
                        {t('common.save', 'Save')}
                    </Button>
                </div>
            </Modal>

            {/* Image Zoom Preview Modal */}
            <Modal
                isOpen={!!selectedImagePreview}
                onClose={() => setSelectedImagePreview(null)}
                title={t('toolbox.checkup.image_preview', 'Evidence Image Preview')}
                className="max-w-3xl w-[90vw]"
            >
                {selectedImagePreview && (
                    <div className="flex flex-col items-center justify-center p-2">
                        <img src={selectedImagePreview} alt="Zoom Preview" className="max-h-[70vh] max-w-full rounded-xl object-contain border border-outline-variant/40 shadow-xl" />
                    </div>
                )}
            </Modal>

            {/* Report Configuration Modal */}
            <Modal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                title={t('toolbox.checkup.report.config_title', 'Report Configuration')}
                className="max-w-4xl w-[90vw]"
            >
                <div className="flex flex-col gap-6 max-h-[72vh] overflow-y-auto pr-2">
                    {/* Analyst Name, Final Result & Comments Header */}
                    <div className="p-4 rounded-xl bg-surface-variant/20 border border-outline-variant/30 flex flex-col gap-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                                    <CheckCircle2 size={14} className="text-primary" />
                                    <span>{t('toolbox.checkup.report.analyst_name', 'Analyst Name')}</span>
                                    <span className="text-error">*</span>
                                </label>
                                <Input
                                    value={reportAnalystName}
                                    onChange={(e) => {
                                        setReportAnalystName(e.target.value);
                                        localStorage.setItem('checkup_reportAnalystName', e.target.value);
                                    }}
                                    placeholder={t('toolbox.checkup.report.analyst_placeholder', 'Enter the QA / Hardware Analyst name')}
                                    className={clsx(
                                        "h-9 text-sm",
                                        !reportAnalystName.trim() && "border-error focus:ring-error"
                                    )}
                                />
                                {!reportAnalystName.trim() && (
                                    <span className="text-[11px] text-error font-medium flex items-center gap-1">
                                        <AlertTriangle size={12} />
                                        {t('toolbox.checkup.report.analyst_required_warning', 'Mandatory field: The report cannot be generated without the analyst name.')}
                                    </span>
                                )}
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-on-surface">
                                    {t('toolbox.checkup.report.result', 'Final Result')}
                                </label>
                                <div className="grid grid-cols-3 gap-1.5 h-9 bg-surface-variant/40 p-1 rounded-xl border border-outline-variant/30 items-center">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setReportResult('approved');
                                            localStorage.setItem('checkup_reportResult', 'approved');
                                        }}
                                        className={clsx(
                                            "h-7 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1",
                                            reportResult === 'approved'
                                                ? "bg-success text-white shadow-sm"
                                                : "text-on-surface-variant hover:text-on-surface"
                                        )}
                                        title={t('toolbox.checkup.report.approved', 'Approved')}
                                        data-position="top"
                                    >
                                        <CheckCircle2 size={12} />
                                        <span>{t('toolbox.checkup.report.approved', 'Approved')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setReportResult('rejected');
                                            localStorage.setItem('checkup_reportResult', 'rejected');
                                        }}
                                        className={clsx(
                                            "h-7 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1",
                                            reportResult === 'rejected'
                                                ? "bg-error text-white shadow-sm"
                                                : "text-on-surface-variant hover:text-on-surface"
                                        )}
                                        title={t('toolbox.checkup.report.rejected', 'Rejected')}
                                        data-position="top"
                                    >
                                        <XCircle size={12} />
                                        <span>{t('toolbox.checkup.report.rejected', 'Rejected')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setReportResult('pending');
                                            localStorage.setItem('checkup_reportResult', 'pending');
                                        }}
                                        className={clsx(
                                            "h-7 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1",
                                            reportResult === 'pending'
                                                ? "bg-amber-500 text-white shadow-sm"
                                                : "text-on-surface-variant hover:text-on-surface"
                                        )}
                                        title={t('toolbox.checkup.report.pending', 'Pending')}
                                        data-position="top"
                                    >
                                        <Clock size={12} />
                                        <span>{t('toolbox.checkup.report.pending', 'Pending')}</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-on-surface">
                                {t('toolbox.checkup.report.comments', 'Comments / Observations')}
                            </label>
                            <Textarea
                                value={reportComments}
                                onChange={(e) => {
                                    setReportComments(e.target.value);
                                    localStorage.setItem('checkup_reportComments', e.target.value);
                                }}
                                placeholder={t('toolbox.checkup.report.comments_placeholder', 'Add general observations, justifications, or test notes...')}
                                className="text-xs min-h-[56px] max-h-[96px]"
                            />
                        </div>
                    </div>

                    {/* Section Visibility Toggles */}
                    <div>
                        <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider mb-3">
                            {t('toolbox.checkup.report.sections_to_include', 'Sections to Include in Report')}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {renderReportSectionControl(
                                t('toolbox.checkup.report.prop_compare_title', 'Device Properties'),
                                t('toolbox.checkup.report.prop_compare_desc', 'Include .prop properties comparison'),
                                reportPropsCompare,
                                setReportPropsCompare
                            )}

                            {renderReportSectionControl(
                                t('toolbox.checkup.report.packages_title_alt', 'Installed Packages'),
                                t('toolbox.checkup.report.packages_desc', 'Include installed apps list and comparison'),
                                reportPackages,
                                setReportPackages
                            )}

                            {renderReportSectionControl(
                                t('toolbox.checkup.report.standard_checks_title_alt', 'Standard Checks'),
                                t('toolbox.checkup.report.standard_checks_desc', 'Include standard security and OS checks'),
                                reportStandardChecks,
                                setReportStandardChecks
                            )}

                            {renderReportSectionControl(
                                t('toolbox.checkup.report.additional_checks_title_alt', 'Additional Checks'),
                                t('toolbox.checkup.report.additional_checks_desc', 'Include IMEI, MAC, storage & memory'),
                                reportAdditionalChecks,
                                setReportAdditionalChecks
                            )}

                            {renderReportSectionControl(
                                t('toolbox.checkup.report.manual_checks_title', 'Manual Checklist'),
                                t('toolbox.checkup.report.manual_checks_desc', 'Include custom visual inspections & photos'),
                                reportShowManualChecks,
                                setReportShowManualChecks
                            )}

                            {renderReportSectionControl(
                                t('toolbox.checkup.report.ui_texts_title', 'UI Text Checks'),
                                t('toolbox.checkup.report.ui_texts_desc', 'Include screen OCR & text validation'),
                                reportShowUiTexts,
                                setReportShowUiTexts
                            )}

                            {renderReportSectionControl(
                                t('toolbox.checkup.report.companion_bdd_title', 'Companion BDD Tests'),
                                t('toolbox.checkup.report.companion_bdd_desc', 'Include mobile BDD execution reports'),
                                reportShowCompanionBdd,
                                setReportShowCompanionBdd
                            )}

                            {renderReportSectionControl(
                                t('toolbox.checkup.report.interactive_tests_title', 'Interactive Hardware'),
                                t('toolbox.checkup.report.interactive_tests_desc', 'Include touchscreen & button checks'),
                                reportShowInteractiveTests,
                                setReportShowInteractiveTests
                            )}

                            {/* {renderReportToggleControl(
                                t('toolbox.checkup.report.extra_props_title', 'Extra Properties'),
                                t('toolbox.checkup.report.extra_props_desc', 'Include device extra base properties'),
                                reportShowPropsBase,
                                setReportShowPropsBase
                            )} */}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-outline-variant/30">
                    <Button variant="ghost" onClick={() => setIsReportModalOpen(false)}
                        title={t('toolbox.checkup.report.cancel', 'Cancel')}
                        data-position="top"
                    >
                        {t('toolbox.checkup.report.cancel', 'Cancel')}
                    </Button>
                    <SplitButton
                        variant="primary"
                        disabled={!reportAnalystName.trim()}
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

            {/* Search Configuration Modal */}
            <Modal
                isOpen={isBasePropsModalOpen}
                onClose={() => setIsBasePropsModalOpen(false)}
                title={t('toolbox.checkup.search_config.config_title', 'Search Configuration')}
                className="max-w-2xl w-[90vw]"
            >
                <div className="flex flex-col gap-6 max-h-[72vh] overflow-y-auto pr-2">
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                        {t('toolbox.checkup.search_config.config_desc', 'Configure search filters for device properties (.prop) and installed packages (apps) for inspection, comparison, and report generation.')}
                    </p>

                    {/* Section 1: Device Properties (.prop) */}
                    <div className="p-4 rounded-xl bg-surface-variant/20 border border-outline-variant/30 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                                    {t('toolbox.checkup.search_config.props_section_title', 'Device Properties (.prop)')}
                                </h3>
                                <p className="text-[11px] text-on-surface-variant mt-0.5">
                                    {t('toolbox.checkup.search_config.props_section_desc', 'Property prefixes to be queried and compared (e.g. ro.build, ro.product).')}
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setBasePropsPrefixes([
                                    'gsm.version.', 'persist.sys.device_provisioned', 'persist.sys.fuse', 'persist.sys.usb.config',
                                    'persist.vendor.connsys.', 'ro.board.', 'ro.boot.hardware', 'ro.boot.serialno', 'ro.boot.vbmeta.',
                                    'ro.boot.verifiedbootstate', 'ro.boot.veritymode', 'ro.bootloader', 'ro.build.', 'ro.config.low_ram',
                                    'ro.crypto.', 'ro.debuggable', 'ro.hardware.', 'ro.odm.', 'ro.product.', 'ro.secure', 'ro.revision',
                                    'ro.serialno', 'ro.soc.model', 'ro.system.', 'ro.telephony.', 'ro.vendor.mediatek.', 'ro.vendor.wifi.',
                                    'ro.zygote', 'sys.usb.config'
                                ])}
                                className="text-[11px] h-7 px-2 text-on-surface-variant hover:text-on-surface flex items-center gap-1"
                                title={t('toolbox.checkup.search_config.reset_defaults', 'Reset to Defaults')}
                                data-position="top"
                            >
                                <RotateCcw size={12} />
                                <span>{t('toolbox.checkup.search_config.reset_defaults', 'Reset Defaults')}</span>
                            </Button>
                        </div>
                        <TagInput
                            label={t('toolbox.checkup.search_config.props_prefixes', 'Property Prefixes')}
                            tags={basePropsPrefixes}
                            onChange={setBasePropsPrefixes}
                            placeholder={t('toolbox.checkup.search_config.add_prefix', 'Add prefix...')}
                        />
                    </div>

                    {/* Section 2: Installed Packages (Apps) */}
                    <div className="p-4 rounded-xl bg-surface-variant/20 border border-outline-variant/30 flex flex-col gap-3">
                        <div>
                            <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                                {t('toolbox.checkup.search_config.packages_section_title', 'Installed Applications (Packages)')}
                            </h3>
                            <p className="text-[11px] text-on-surface-variant mt-0.5">
                                {t('toolbox.checkup.search_config.packages_section_desc', 'Package filters to be queried and displayed on the interface and reports.')}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 max-w-xs">
                            <Button
                                variant={packageFilterMode === 'exclude' ? 'primary' : 'outline'}
                                size="sm"
                                onClick={() => setPackageFilterMode('exclude')}
                                className="h-7 text-xs"
                                title={t('toolbox.checkup.search_config.packages_mode_exclude', 'Exclude Prefixes')}
                                data-position="bottom"
                            >
                                {t('toolbox.checkup.search_config.packages_mode_exclude', 'Exclude Prefixes')}
                            </Button>
                            <Button
                                variant={packageFilterMode === 'include' ? 'primary' : 'outline'}
                                size="sm"
                                onClick={() => setPackageFilterMode('include')}
                                className="h-7 text-xs"
                                title={t('toolbox.checkup.search_config.packages_mode_include', 'Include Only')}
                                data-position="bottom"
                            >
                                {t('toolbox.checkup.search_config.packages_mode_include', 'Include Only')}
                            </Button>
                        </div>

                        <TagInput
                            label={t('toolbox.checkup.search_config.packages_prefixes', 'Package Prefixes')}
                            tags={packageFilterPrefixes}
                            onChange={setPackageFilterPrefixes}
                            placeholder={t('toolbox.checkup.search_config.add_prefix', 'Add prefix...')}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-outline-variant/30">
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setIsBasePropsModalOpen(false)}
                        title={t('common.done', 'Done')}
                        data-position="left"
                    >
                        {t('common.done', 'Done')}
                    </Button>
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
                    <p className="text-xs text-on-surface-variant">
                        {t('toolbox.checkup.report.ai_verify_desc', 'Enter requirements or release notes. The AI will analyze the report data against these requirements and generate an annotated report.')}
                    </p>
                    <Textarea
                        value={aiRequirementsPrompt}
                        onChange={(e) => setAiRequirementsPrompt(e.target.value)}
                        placeholder={t('toolbox.checkup.report.ai_prompt_placeholder', 'e.g. Expected resolution 1080x2400, app version >= 2.0.0...')}
                        className="min-h-[160px] text-xs"
                        disabled={isAiVerifying}
                    />
                </div>
                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-outline-variant/30">
                    <Button variant="ghost" onClick={() => setIsAiVerifyModalOpen(false)} disabled={isAiVerifying}
                        title={t('toolbox.checkup.report.cancel', 'Cancel')}
                        data-position="top"
                    >
                        {t('toolbox.checkup.report.cancel', 'Cancel')}
                    </Button>
                    <Button variant="primary" onClick={verifyReportWithAI} disabled={isAiVerifying || !aiRequirementsPrompt.trim()}
                        title={t('toolbox.checkup.report.start_verification', 'Start Verification')}
                        data-position="top"
                    >
                        {isAiVerifying ? t('toolbox.checkup.report.ai_verifying', 'Verifying...') : t('toolbox.checkup.report.start_verification', 'Start Verification')}
                    </Button>
                </div>
            </Modal>

            {/* UI Check Modal */}
            <Modal
                isOpen={isUiCheckModalOpen}
                onClose={() => setIsUiCheckModalOpen(false)}
                title={editingUiCheck ? t('toolbox.checkup.edit_ui_check', 'Edit UI Text Check') : t('toolbox.checkup.add_ui_check', 'Add UI Text Check')}
                className="max-w-md"
            >
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="text-xs font-semibold text-on-surface mb-1 block">{t('toolbox.checkup.check_name', 'Check Name')}</label>
                        <Input
                            value={uiCheckNameInput}
                            onChange={(e) => setUiCheckNameInput(e.target.value)}
                            placeholder={t('toolbox.checkup.check_name_placeholder', 'Example: UI Text Check')}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-on-surface mb-1 block">{t('toolbox.checkup.activity_command', 'Activity / Launch Command (Optional)')}</label>
                        <Input
                            value={uiCheckActivityInput}
                            onChange={(e) => setUiCheckActivityInput(e.target.value)}
                            placeholder={t('toolbox.checkup.activity_placeholder', 'Example: com.android.settings')}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-on-surface mb-1 block">{t('toolbox.checkup.wait_delay', 'Wait Delay (ms)')}</label>
                        <Input
                            type="number"
                            value={uiCheckDelayInput}
                            onChange={(e) => setUiCheckDelayInput(e.target.value)}
                            placeholder="1500"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-outline-variant/30">
                    <Button variant="ghost" onClick={() => setIsUiCheckModalOpen(false)}
                        title={t('common.cancel', 'Cancel')}
                        data-position="top"
                    >
                        {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button
                        variant="primary"
                        onClick={() => {
                            if (!uiCheckNameInput.trim()) return;
                            const delayMs = parseInt(uiCheckDelayInput) || 1500;
                            if (editingUiCheck) {
                                setUiTextChecks(prev => prev.map(c => c.id === editingUiCheck.id ? {
                                    ...c,
                                    name: uiCheckNameInput.trim(),
                                    activity: uiCheckActivityInput.trim(),
                                    delayMs
                                } : c));
                            } else {
                                const newCheck: UiTextCheckConfig = {
                                    id: `ui_check_${Date.now()}`,
                                    name: uiCheckNameInput.trim(),
                                    activity: uiCheckActivityInput.trim(),
                                    delayMs,
                                    enabled: true
                                };
                                setUiTextChecks(prev => [...prev, newCheck]);
                            }
                            setIsUiCheckModalOpen(false);
                        }}
                        title={t('common.save', 'Save')}
                        data-position="top"
                    >
                        {t('common.save', 'Save')}
                    </Button>
                </div>
            </Modal>
        </div>
    );
};
export default CheckupSubTab;

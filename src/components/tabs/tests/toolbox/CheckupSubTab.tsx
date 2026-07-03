import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { Button } from '@/components/atoms/Button';
import { Section } from '@/components/organisms/Section';
import { Upload, ShieldCheck, CheckCircle2, XCircle, Search, RefreshCcw, FileText } from 'lucide-react';
import { Input } from '@/components/atoms/Input';
import clsx from 'clsx';
import { ExpressiveLoading } from '@/components/atoms/ExpressiveLoading';

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
}

export function CheckupSubTab({ selectedDevice, isTestRunning, allowActionsDuringTest }: CheckupSubTabProps) {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(false);
    const [comparisons, setComparisons] = useState<PropComparison[]>([]);
    const [filterDivergent, setFilterDivergent] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Standard checks based on POS Checklist
    const [checkResults, setCheckResults] = useState<Record<string, { status: 'idle' | 'running' | 'correct' | 'incorrect', found?: string }>>({});

    const standardChecksBase = useMemo(() => [
        {
            id: 'verified_boot',
            name: t('toolbox.checkup.checks.verified_boot', 'Verified Boot (dm-verity)'),
            command: ['shell', 'getprop', 'ro.boot.verifiedbootstate'],
            expected: (out: string) => out.trim().toLowerCase() === 'green',
            foundDisplay: (out: string) => out.trim() || t('toolbox.checkup.unknown', 'Unknown')
        },
        {
            id: 'adb_default',
            name: t('toolbox.checkup.checks.adb_default', 'Default ADB Disabled'),
            command: ['shell', 'getprop', 'persist.sys.usb.config'],
            expected: (out: string) => !out.includes('adb'),
            foundDisplay: (out: string) => out.trim() || t('toolbox.checkup.none', 'None')
        },
        {
            id: 'debuggable',
            name: t('toolbox.checkup.checks.debuggable', 'Developer Mode (ro.debuggable)'),
            command: ['shell', 'getprop', 'ro.debuggable'],
            expected: (out: string) => out.trim() === '0',
            foundDisplay: (out: string) => out.trim() === '1' ? t('toolbox.checkup.active', '1 (Active)') : t('toolbox.checkup.inactive', '0 (Inactive)')
        },
        {
            id: 'build_tags',
            name: t('toolbox.checkup.checks.build_tags', 'Image Signature (tags)'),
            command: ['shell', 'getprop', 'ro.build.tags'],
            expected: (out: string) => out.trim() === 'release-keys',
            foundDisplay: (out: string) => out.trim() || t('toolbox.checkup.none', 'None')
        },
        {
            id: 'selinux',
            name: t('toolbox.checkup.checks.selinux', 'SELinux Enforcing'),
            command: ['shell', 'getenforce'],
            expected: (out: string) => out.trim().toLowerCase() === 'enforcing',
            foundDisplay: (out: string) => out.trim()
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

            <div className="flex-1 min-h-0 flex flex-col xl:flex-row gap-6">

                {/* Standard Checks Panel */}
                <Section
                    title={t('toolbox.checkup.standard_checks', 'Standard Checklist')}
                    icon={ShieldCheck}
                    className="flex-1 flex flex-col min-h-0 overflow-hidden"
                    contentClassName="flex-1 overflow-y-auto pr-2 space-y-2 min-h-0"
                    actions={
                        <Button
                            variant="secondary"
                            onClick={runStandardChecks}
                            disabled={disabled || standardChecks.some(c => c.status === 'running')}
                            className="flex items-center gap-2 h-9"
                        >
                            <RefreshCcw size={16} className={clsx(standardChecks.some(c => c.status === 'running') && "animate-spin")} />
                            {t('toolbox.checkup.run_checks', 'Run Checks')}
                        </Button>
                    }
                >
                    {standardChecks.map(check => (
                        <div key={check.id} className="flex flex-col p-4 rounded-xl border border-outline-variant/30 bg-surface-variant/20 text-sm">
                            <div className="flex justify-between items-center mb-1 gap-2">
                                <span className="font-medium text-on-surface leading-tight">{check.name}</span>
                                {check.status === 'running' && <ExpressiveLoading variant="circular" size="sm" />}
                                {check.status === 'correct' && <CheckCircle2 size={18} className="text-success shrink-0" />}
                                {check.status === 'incorrect' && <XCircle size={18} className="text-error shrink-0" />}
                            </div>
                            {check.found && (
                                <div className="flex justify-between items-center text-xs mt-2">
                                    <span className="text-on-surface-variant">{t('toolbox.checkup.found', 'Found')}:</span>
                                    <span className={clsx(
                                        "font-mono px-2 py-0.5 rounded",
                                        check.status === 'correct' ? "bg-success/10 text-success" : "bg-error/10 text-error"
                                    )}>
                                        {check.found}
                                    </span>
                                </div>
                            )}
                        </div>
                    ))}
                </Section>

                {/* Props Comparison Panel */}
                <Section
                    title=".prop Compare"
                    icon={FileText}
                    className="flex-[2] flex flex-col min-h-0 overflow-hidden"
                    contentClassName="flex-1 overflow-y-auto pr-2 min-h-0"
                    actions={
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="primary"
                                onClick={handleImportFile}
                                disabled={disabled || isLoading}
                                className="flex items-center gap-2 h-9"
                            >
                                <Upload size={16} />
                                {t('toolbox.checkup.upload_prop', 'Import')}
                            </Button>
                        </div>
                    }
                >
                    <div className="flex items-center justify-end gap-2 mb-4">
                        {comparisons.length > 0 && (
                            <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full font-medium">
                                {matchCount} / {comparisons.length} {t('toolbox.checkup.matches', 'matches')}
                            </span>
                        )}
                        <Button
                            variant={filterDivergent ? "primary" : "ghost"}
                            size="sm"
                            onClick={() => setFilterDivergent(!filterDivergent)}
                            className={clsx("h-9 text-sm px-3", filterDivergent && "bg-error/10 text-error hover:bg-error/20 hover:text-error")}
                        >
                            {filterDivergent
                                ? t('toolbox.checkup.show_all', 'Show all')
                                : t('toolbox.checkup.show_divergent', 'Show only divergences')}
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
                    </div>
                    <div className="flex-1 h-full min-h-0 bg-surface-variant/10 rounded-xl border border-outline-variant/30 overflow-hidden">
                        <div className="h-full overflow-y-auto">
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
                                <table className="w-full text-left border-collapse text-sm">
                                    <thead className="bg-surface/90 backdrop-blur sticky top-0 shadow-sm z-10 text-on-surface-variant">
                                        <tr>
                                            <th className="p-3 font-medium border-b border-outline-variant/30">Key</th>
                                            <th className="p-3 font-medium border-b border-outline-variant/30 w-1/4">{t('toolbox.checkup.expected', 'Expected')}</th>
                                            <th className="p-3 font-medium border-b border-outline-variant/30 w-1/4">{t('toolbox.checkup.found', 'Found')}</th>
                                            <th className="p-3 font-medium border-b border-outline-variant/30 w-16 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredComparisons.map(c => (
                                            <tr key={c.key} className="border-b border-outline-variant/10 hover:bg-surface-variant/20 transition-colors">
                                                <td className="p-3 font-mono text-xs text-on-surface break-all">{c.key}</td>
                                                <td className="p-3 font-mono text-xs text-on-surface-variant break-all">{c.expected}</td>
                                                <td className={clsx(
                                                    "p-3 font-mono text-xs break-all",
                                                    c.isMatch ? "text-success" : "text-error font-semibold"
                                                )}>
                                                    {c.found || <span className="italic opacity-50">{t('toolbox.checkup.not_found', 'Not found')}</span>}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {c.isMatch
                                                        ? <CheckCircle2 size={16} className="text-success mx-auto" />
                                                        : <XCircle size={16} className="text-error mx-auto" />
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

            </div>
        </div>
    );
}

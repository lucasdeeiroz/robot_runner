import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Barcode from 'react-barcode';
import { QRCodeSVG } from 'qrcode.react';
import { Play, Square, Zap, Trash2, Timer, PackageIcon, Save, Download, Columns2, X, ScanLine } from "lucide-react";
import { feedback } from "@/lib/feedback";
import { useLogcatStopwatch } from "@/hooks/useLogcatStopwatch";
import { Button } from "@/components/atoms/Button";
import { Select } from "@/components/atoms/Select";
import { TagInput } from "@/components/atoms/TagInput";
import { Section } from "@/components/organisms/Section";
import { useSettings } from "@/lib/settings";
import { Input } from "@/components/atoms/Input";

class BarcodeErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    componentDidUpdate(prevProps: any) {
        if (this.state.hasError && this.props.children !== prevProps.children) {
            this.setState({ hasError: false });
        }
    }
    render() {
        if (this.state.hasError) {
            return <div className="text-error font-semibold text-center p-4">Invalid payload for selected symbology</div>;
        }
        return this.props.children;
    }
}

function formatDelta(deltaMs: number, unit: 'ms' | 's' | 'min' | 'h'): string {
    switch (unit) {
        case 's': return `+${(deltaMs / 1000).toFixed(3)}s`;
        case 'min': return `+${(deltaMs / 60000).toFixed(2)}m`;
        case 'h': return `+${(deltaMs / 3600000).toFixed(2)}h`;
        case 'ms':
        default:
            return `+${deltaMs.toFixed(0)}ms`;
    }
}

interface StopwatchSubTabProps {
    selectedDevice: string;
    isTestRunning?: boolean;
    allowActionsDuringTest?: boolean;
    onPairWithConsole?: () => void;
}

interface SavedRound {
    id: string;
    totalTimeMs: number;
    laps: any[];
}

export function StopwatchSubTab({ selectedDevice, isTestRunning = false, allowActionsDuringTest = false, onPairWithConsole }: StopwatchSubTabProps) {
    const { t } = useTranslation();
    const { settings, updateSetting } = useSettings();
    const [logLevel, setLogLevel] = useState<string>(settings.logcatLevel || "V");
    const [extraTags, setExtraTags] = useState<string>(settings.logcatExtraTags || "");
    const [selectedPackage, setSelectedPackage] = useState(() => settings.stopwatchSelectedPackage || "");
    const [savedRounds, setSavedRounds] = useState<SavedRound[]>([]);

    const [mode, setMode] = useState<'standard' | 'scanner'>('standard');
    const [symbology, setSymbology] = useState<string>('EAN13');
    const [payload, setPayload] = useState<string>('7891000315507');


    const {
        laps,
        setLaps,
        deltaUnit,
        setDeltaUnit,
        isStopwatchRunning,
        handleRemoveLap,
        handleToggleStopwatch,
        keywords,
    } = useLogcatStopwatch(selectedDevice, selectedPackage);

    const isActionDisabled = isTestRunning && !allowActionsDuringTest;

    const totalTimeMs = laps.reduce((sum, lap) => sum + lap.deltaMs, 0);

    const handleSaveLaps = () => {
        if (laps.length === 0) return;
        const newRound: SavedRound = {
            id: `round_${Date.now()}`,
            totalTimeMs,
            laps: [...laps]
        };
        setSavedRounds([...savedRounds, newRound]);
        setLaps?.([]);
        feedback.toast.success(t('performance.stopwatch.saved', 'Stopwatch results saved!'));
    };

    const handleExportCsv = () => {
        if (savedRounds.length === 0) return;

        let csvContent = "#,";
        savedRounds.forEach((_, i) => {
            csvContent += `Round ${i + 1}${i < savedRounds.length - 1 ? ',' : ''}`;
        });
        csvContent += "\n";

        const maxLaps = Math.max(0, ...savedRounds.map(r => r.laps.length));
        for (let i = 0; i < maxLaps; i++) {
            csvContent += `${i + 1},`;
            savedRounds.forEach((r, roundIndex) => {
                const lap = r.laps[i];
                const deltaStr = lap ? `+${lap.deltaMs}ms` : '-';
                csvContent += `${deltaStr}${roundIndex < savedRounds.length - 1 ? ',' : ''}`;
            });
            csvContent += "\n";
        }

        csvContent += "Total,";
        savedRounds.forEach((r, i) => {
            csvContent += `+${r.totalTimeMs}ms${i < savedRounds.length - 1 ? ',' : ''}`;
        });
        csvContent += "\n";

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `stopwatch_export_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        feedback.toast.success(t('common.export_success', 'Exported successfully!'));
    };

    return (
        <div className="h-full flex-1 min-h-0 flex flex-col p-2 relative">
            <Section
                title={t('performance.stopwatch.title', 'Logcat Stopwatch')}
                icon={Timer}
                variant="transparent"
                className="flex-1 min-h-0 flex flex-col"
                warning={isActionDisabled ? t('common.actions_disabled_during_test') : undefined}
                actions={
                    <div className="flex gap-2 items-center">
                        <div className="flex items-center bg-surface-variant/20 rounded-lg p-1 mr-4 border border-outline-variant/30">
                            <Button
                                onClick={() => setMode('standard')}
                                variant={mode === 'standard' ? "secondary" : "ghost"}
                                size="sm"
                                className={`h-7 px-3 text-xs ${mode === 'standard' ? 'shadow-sm' : 'opacity-70'}`}
                            >
                                <Timer size={14} className="mr-2" />
                                {t('performance.stopwatch.standard_mode', 'Standard')}
                            </Button>
                            <Button
                                onClick={() => setMode('scanner')}
                                variant={mode === 'scanner' ? "secondary" : "ghost"}
                                size="sm"
                                className={`h-7 px-3 text-xs ${mode === 'scanner' ? 'shadow-sm' : 'opacity-70'}`}
                            >
                                <ScanLine size={14} className="mr-2" />
                                {t('performance.stopwatch.scanner_mode', 'Scanner Validation')}
                            </Button>
                        </div>
                        <Button
                            onClick={handleToggleStopwatch}
                            variant={isStopwatchRunning ? "danger" : "primary"}
                            size="sm"
                            disabled={isActionDisabled}
                            leftIcon={isStopwatchRunning ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                        >
                            {isStopwatchRunning
                                ? t('performance.stopwatch.stop', 'Stop Recording')
                                : t('performance.stopwatch.start', 'Start Stopwatch')
                            }
                        </Button>
                        {onPairWithConsole && (
                            <Button
                                onClick={onPairWithConsole}
                                variant="secondary"
                                size="sm"
                                disabled={isActionDisabled}
                                className="h-8 text-on-surface-variant/80 hover:text-primary"
                                data-tooltip={t('common.pair_grid', 'Split with Console')}
                                data-position="left"
                            >
                                <Columns2 size={14} />
                            </Button>
                        )}
                    </div>
                }
            >
                {/* <div className="mb-4 text-on-surface-variant text-sm">
                    {t('performance.stopwatch.description', 'Record timestamp deltas for specific logcat events.')}
                </div> */}
                <div className="flex-1 min-h-0 bg-surface text-on-surface/80 font-mono text-xs relative border border-outline-variant/30 rounded-2xl">
                    <div className="p-4 grid grid-cols-1 grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-2 xl:grid-rows-1 gap-4 w-full h-full min-h-0">
                        {mode === 'standard' ? (
                            <div className="space-y-4">
                                <TagInput
                                    label={t('performance.stopwatch.keywords', 'Keywords')}
                                    tags={keywords}
                                    onChange={(newTags) => updateSetting('logcatKeywords', newTags)}
                                    placeholder={t('performance.stopwatch.placeholder', 'Add logcat keyword (e.g. ActivityResume)')}
                                    disabled={isActionDisabled}
                                />
                                <div className="text-xs text-on-surface-variant/60 bg-surface-variant/10 p-3 rounded-lg border border-outline-variant/20 mt-4">
                                    <p className="mb-2"><strong>{t('common.tip', 'Tip')}:</strong> {t('performance.stopwatch.tip_keywords', 'Use keywords to mark important events in Logcat.')}</p>
                                    <p>{t('performance.stopwatch.tip_delta', 'The stopwatch will automatically calculate the time (Delta) between clicking the "Start" button and the appearance of each registered keyword in the log list.')}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4 flex flex-col h-full min-h-0">
                                <div className="flex gap-2">
                                    <Select 
                                        options={[
                                            { label: 'EAN-13', value: 'EAN13' },
                                            { label: 'EAN-8', value: 'EAN8' },
                                            { label: 'ITF-14', value: 'ITF14' },
                                            { label: 'CODE128', value: 'CODE128' },
                                            { label: 'QR Code', value: 'QR' }
                                        ]}
                                        value={symbology}
                                        onChange={(e) => setSymbology(e.target.value)}
                                        containerClassName="w-32"
                                    />
                                    <Input 
                                        value={payload}
                                        onChange={(e) => setPayload(e.target.value)}
                                        placeholder={t('performance.stopwatch.scanner_payload', 'Barcode content...')}
                                        className="flex-1"
                                    />
                                </div>
                                <div className="flex-1 bg-white rounded-xl border border-outline-variant/30 flex items-center justify-center p-8 overflow-hidden relative min-h-[150px]">
                                    <div className="absolute top-2 left-2 text-[10px] text-black/40 font-mono select-none">
                                        {t('performance.stopwatch.scanner_visualizer', 'Virtual Code Visualizer')}
                                    </div>
                                    <BarcodeErrorBoundary>
                                        {symbology === 'QR' ? (
                                            <QRCodeSVG value={payload || ' '} size={160} />
                                        ) : (
                                            <Barcode value={payload || ' '} format={symbology as any} width={2} height={80} displayValue={true} background="#ffffff" lineColor="#000000" />
                                        )}
                                    </BarcodeErrorBoundary>
                                </div>
                                <div className="text-xs text-on-surface-variant/60 bg-surface-variant/10 p-3 rounded-lg border border-outline-variant/20 shrink-0">
                                    <p className="mb-2"><strong>{t('common.tip', 'Tip')}:</strong> {t('performance.stopwatch.scanner_tip1', 'Point the POS device at the screen. Make sure the stopwatch is running and the correct keywords are set in the right panel.')}</p>
                                    <p>{t('performance.stopwatch.scanner_tip2', 'The first captured keyword starts the timer (0ms). The next matches will show the exact hardware delta (<= 300ms GS1 requirement).')}</p>
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col min-h-0 border-t xl:border-t-0 xl:border-l border-outline-variant/30 pt-6 xl:pt-0 xl:pl-4">
                            <div className="flex justify-between items-center mb-4 shrink-0">
                                <div className="flex items-center gap-4">
                                    <span className="text-sm font-medium opacity-80 flex items-center gap-2">
                                        <Zap size={16} className="text-yellow-500" />
                                        {t('performance.stopwatch.laps', 'Checkpoints')}
                                    </span>
                                    <Select
                                        value={deltaUnit}
                                        onChange={(e) => setDeltaUnit?.(e.target.value as any)}
                                        options={[
                                            { label: 'ms', value: 'ms' },
                                            { label: 's', value: 's' },
                                            { label: 'min', value: 'min' },
                                            { label: 'h', value: 'h' },
                                        ]}
                                        containerClassName="w-24"
                                    />
                                </div>
                                {laps.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <div className="text-xs font-semibold px-2 py-1 bg-surface-variant/20 border border-outline-variant/30 rounded-md">
                                            {t('performance.stopwatch.total_time', 'Total')}: <span className="text-success">{formatDelta(totalTimeMs, deltaUnit)}</span>
                                        </div>
                                        <Button onClick={handleSaveLaps} variant="ghost" size="sm" className="h-6 text-xs hover:bg-primary/10">
                                            <Save size={14} className="mr-1" />
                                            {t('common.save', 'Save')}
                                        </Button>
                                        <Button onClick={() => setLaps?.([])} variant="ghost" size="sm" className="h-6 text-xs text-error/80 hover:bg-error/10">
                                            {t('common.clear', 'Clear')}
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {laps.length === 0 ? (
                                <div className="text-center p-8 border border-dashed border-outline-variant/30 rounded-xl text-xs opacity-50 bg-surface-variant/10 shrink-0">
                                    {t('performance.stopwatch.waiting', 'Waiting for keywords in Logcat... (Make sure Logcat is running)')}
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto border border-outline-variant/30 rounded-xl custom-scrollbar bg-surface-variant/5">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-surface-variant/50 sticky top-0 backdrop-blur-sm z-10">
                                            <tr>
                                                <th className="px-4 py-3 font-medium opacity-70 w-12 text-center">#</th>
                                                <th className="px-4 py-3 font-medium opacity-70">{t('performance.stopwatch.keyword', 'Keyword')}</th>
                                                <th className="px-4 py-3 font-medium opacity-70">{t('performance.stopwatch.time', 'Time')}</th>
                                                <th className="px-4 py-3 font-medium opacity-70">{t('performance.stopwatch.delta', 'Delta')}</th>
                                                <th className="px-4 py-3 font-medium opacity-70 w-12"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-outline-variant/20">
                                            {laps.map((lap, i) => (
                                                <tr key={i} className="hover:bg-surface-variant/20 group transition-colors">
                                                    <td className="px-4 py-3 opacity-50 text-center">{i + 1}</td>
                                                    <td className="px-4 py-3 font-mono">{lap.keyword}</td>
                                                    <td className="px-4 py-3 opacity-80">{new Date(lap.timestamp).toLocaleTimeString()}</td>
                                                    <td className="px-4 py-3 font-mono text-success font-semibold">{formatDelta(lap.deltaMs, deltaUnit)}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <Button
                                                            onClick={() => handleRemoveLap?.(i)}
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 w-8 p-0 text-error/50 hover:text-error hover:bg-error/10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                                            title={t('common.remove', 'Remove')}
                                                        >
                                                            <Trash2 size={14} />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Saved Rounds Table */}
                            {savedRounds.length > 0 && (
                                <div className="mt-4 border-t border-outline-variant/30 pt-4 flex flex-col min-h-[150px]">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium opacity-80">{t('common.saved_rounds', 'Saved Rounds')}</span>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 text-xs text-primary/80 hover:bg-primary/10"
                                                onClick={handleExportCsv}
                                            >
                                                <Download size={12} className="mr-1" />
                                                {t('common.export', 'Export')}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 text-xs text-error/80 hover:bg-error/10"
                                                onClick={() => setSavedRounds([])}
                                            >
                                                <Trash2 size={12} className="mr-1" />
                                                {t('common.clear_all', 'Clear All')}
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-x-auto overflow-y-auto border border-outline-variant/30 rounded-xl custom-scrollbar bg-surface-variant/5">
                                        <table className="w-full text-left text-xs min-w-max">
                                            <thead className="bg-surface-variant/50 sticky top-0 backdrop-blur-sm z-10">
                                                <tr>
                                                    <th className="px-4 py-2 font-medium opacity-70 w-12 text-center border-r border-outline-variant/20">#</th>
                                                    {savedRounds.map((round, i) => (
                                                        <th key={round.id} className="px-4 py-2 font-medium opacity-70 text-center border-r border-outline-variant/20 last:border-0 relative group">
                                                            <div className="flex items-center justify-center gap-2">
                                                                {t('common.round', 'Round')} {i + 1}
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-5 w-5 p-0 text-error opacity-0 group-hover:opacity-100 transition-opacity absolute right-1"
                                                                    onClick={() => setSavedRounds(prev => prev.filter(r => r.id !== round.id))}
                                                                    title={t('common.remove', 'Remove')}
                                                                >
                                                                    <X size={12} />
                                                                </Button>
                                                            </div>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-outline-variant/20">
                                                {Array.from({ length: Math.max(0, ...savedRounds.map(r => r.laps.length)) }).map((_, lapIndex) => (
                                                    <tr key={lapIndex} className="hover:bg-surface-variant/20 transition-colors">
                                                        <td className="px-4 py-2 opacity-50 text-center font-medium border-r border-outline-variant/20">{lapIndex + 1}</td>
                                                        {savedRounds.map((round) => {
                                                            const lap = round.laps[lapIndex];
                                                            return (
                                                                <td key={round.id} className="px-4 py-2 font-mono text-center border-r border-outline-variant/20 last:border-0">
                                                                    {lap ? (
                                                                        <span className="text-success">{formatDelta(lap.deltaMs, deltaUnit)}</span>
                                                                    ) : (
                                                                        <span className="opacity-30">-</span>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="sticky bottom-0 bg-surface-variant/80 backdrop-blur-sm border-t border-outline-variant/30 z-10">
                                                <tr>
                                                    <td className="px-4 py-3 font-semibold opacity-80 text-center border-r border-outline-variant/20">{t('common.total', 'Total')}</td>
                                                    {savedRounds.map(round => (
                                                        <td key={round.id} className="px-4 py-3 font-mono font-bold text-success text-center border-r border-outline-variant/20 last:border-0">
                                                            {formatDelta(round.totalTimeMs, deltaUnit)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </Section>
            <div className="flex items-center justify-between w-full mt-2 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-40">
                        <Select
                            options={[
                                { label: t('logcat.entire_system', 'Entire System'), value: "" },
                                ...(settings.tools?.appPackage ? settings.tools.appPackage.split(',') : []).map(p => ({ label: p.trim(), value: p.trim() })).filter(o => o.value)
                            ]}
                            value={selectedPackage}
                            onChange={(e) => {
                                setSelectedPackage(e.target.value);
                                updateSetting('stopwatchSelectedPackage', e.target.value);
                            }}
                            leftIcon={<PackageIcon size={14} />}
                            disabled={isStopwatchRunning}
                            containerClassName="w-full"
                            dropdownPosition="top"
                        />
                    </div>
                    <div className="w-28">
                        <Select
                            options={[
                                { label: "Verbose", value: "V" },
                                { label: "Debug", value: "D" },
                                { label: "Info", value: "I" },
                                { label: "Warning", value: "W" },
                                { label: "Error", value: "E" },
                                { label: "Fatal", value: "F" },
                                { label: "Silent", value: "S" },
                            ]}
                            value={logLevel}
                            onChange={(e) => {
                                setLogLevel(e.target.value);
                                updateSetting('logcatLevel', e.target.value);
                            }}
                            dropdownPosition="top"
                        />
                    </div>
                    <div className="w-48">
                        <input
                            type="text"
                            value={extraTags}
                            onChange={e => setExtraTags(e.target.value)}
                            onBlur={() => updateSetting('logcatExtraTags', extraTags)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    updateSetting('logcatExtraTags', extraTags);
                                }
                            }}
                            placeholder={t('logcat.custom_tags_placeholder', 'Tags (e.g. App:V)')}
                            className="w-full h-8 bg-surface border border-outline-variant/30 rounded-lg px-3 py-1 text-[13px] font-normal normal-case text-on-surface focus:outline-none focus:border-primary/50 transition-colors"
                            disabled={isStopwatchRunning}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

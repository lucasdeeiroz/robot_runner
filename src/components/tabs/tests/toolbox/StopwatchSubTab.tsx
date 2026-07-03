import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, Square, Zap, Trash2, Timer } from "lucide-react";
import { useLogcatStopwatch } from "@/hooks/useLogcatStopwatch";
import { Button } from "@/components/atoms/Button";
import { Select } from "@/components/atoms/Select";
import { TagInput } from "@/components/atoms/TagInput";
import { Section } from "@/components/organisms/Section";
import { useSettings } from "@/lib/settings";

function formatDelta(deltaMs: number, unit: 'ms' | 's' | 'min' | 'h'): string {
    switch (unit) {
        case 's': return `+${(deltaMs / 1000).toFixed(2)}s`;
        case 'min': return `+${(deltaMs / 60000).toFixed(2)}m`;
        case 'h': return `+${(deltaMs / 3600000).toFixed(2)}h`;
        case 'ms':
        default:
            return `+${deltaMs}ms`;
    }
}

interface StopwatchSubTabProps {
    selectedDevice: string;
    isTestRunning?: boolean;
    allowActionsDuringTest?: boolean;
}

export function StopwatchSubTab({ selectedDevice, isTestRunning = false, allowActionsDuringTest = false }: StopwatchSubTabProps) {
    const { t } = useTranslation();
    const { settings, updateSetting } = useSettings();
    const [logLevel, setLogLevel] = useState<string>(settings.logcatLevel || "V");
    const [extraTags, setExtraTags] = useState<string>(settings.logcatExtraTags || "");
    const [selectedPackage, setSelectedPackage] = useState(() => settings.stopwatchSelectedPackage || "");

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

    return (
        <div className="h-full flex-1 min-h-0 flex flex-col p-4 overflow-y-auto custom-scrollbar">
            <Section
                title={t('performance.stopwatch.title', 'Logcat Stopwatch')}
                icon={Timer}
                variant="transparent"
                warning={isActionDisabled ? t('common.actions_disabled_during_test') : undefined}
                menus={
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
                                disabled={isStopwatchRunning}
                                containerClassName="w-full"
                            />
                        </div>
                        <div className="w-24">
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
                                containerClassName="w-full"
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
                }
                actions={
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
                }
            >
                <div className="mb-4 text-on-surface-variant text-sm">
                    {t('performance.stopwatch.description', 'Record timestamp deltas for specific logcat events.')}
                </div>
                <div className="pt-4 grid grid-cols-1 xl:grid-cols-2 gap-8 w-full h-full min-h-0">
                    <div className="space-y-4">
                        <TagInput
                            label={t('performance.stopwatch.keywords', 'Keywords')}
                            tags={keywords}
                            onChange={(newTags) => updateSetting('logcatKeywords', newTags)}
                            placeholder={t('performance.stopwatch.placeholder', 'Add logcat keyword (e.g. ActivityResume)')}
                            disabled={isActionDisabled}
                        />
                        <div className="text-xs text-on-surface-variant/60 bg-surface-variant/10 p-3 rounded-lg border border-outline-variant/20 mt-4">
                            <p className="mb-2"><strong>Dica:</strong> Use as keywords para marcar eventos importantes no Logcat.</p>
                            <p>O cronômetro irá calcular automaticamente o tempo (Delta) entre o clique no botão "Iniciar" e o aparecimento de cada keyword registrada na lista de logs.</p>
                        </div>
                    </div>

                    <div className="flex flex-col min-h-0 border-t xl:border-t-0 xl:border-l border-outline-variant/30 pt-6 xl:pt-0 xl:pl-8">
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
                                <Button onClick={() => setLaps?.([])} variant="ghost" size="sm" className="h-6 text-xs text-error/80 hover:bg-error/10">
                                    {t('common.clear', 'Clear')}
                                </Button>
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
                    </div>
                </div>
            </Section>
        </div>
    );
}

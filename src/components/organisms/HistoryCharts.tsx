import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { PieChart as PieIcon, BarChart as BarIcon, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

// ... existing interfaces ...
interface TestLog {
    path: string;
    suite_name: string;
    status: 'PASS' | 'FAIL';
    device_udid?: string | null;
    device_model?: string | null;
    android_version?: string | null;
    timestamp: string;
    duration: string;
    pass_count: number;
    fail_count: number;
}

interface HistoryChartsProps {
    logs: TestLog[];
    groupBy: string;
    countMethod: 'suites' | 'tests';
}

const COLORS = {
    PASS: '#22c55e', // success
    FAIL: '#ef4444', // error
    // Additional colors for groups if needed
    blue: '#3b82f6',
    orange: '#f97316',
    purple: '#a855f7',
    yellow: '#eab308'
};

export function HistoryCharts({ logs, groupBy, countMethod }: HistoryChartsProps) {
    const { t } = useTranslation();

    const statusData = useMemo(() => {
        const counts = { PASS: 0, FAIL: 0 };
        logs.forEach(l => {
            if (countMethod === 'suites') {
                if (l.status === 'PASS') counts.PASS++;
                else if (l.status === 'FAIL') counts.FAIL++;
            } else {
                counts.PASS += (l.pass_count || 0);
                counts.FAIL += (l.fail_count || 0);
            }
        });
        return [
            { name: 'PASS', value: counts.PASS },
            { name: 'FAIL', value: counts.FAIL }
        ].filter(d => d.value > 0);
    }, [logs, countMethod]);


    // Helper to decode HTML entities (e.g., &amp; -> &)
    const decodeHtml = (text: string) => {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            return doc.documentElement.textContent || text;
        } catch (e) {
            return text;
        }
    };

    const parseDurationToSeconds = (durationStr: string) => {
        if (!durationStr) return 0;
        const parts = durationStr.split(':');
        let secs = 0;
        if (parts.length === 3) {
            secs += parseInt(parts[0], 10) * 3600;
            secs += parseInt(parts[1], 10) * 60;
            secs += parseInt(parts[2], 10);
        } else if (parts.length === 2) {
            secs += parseInt(parts[0], 10) * 60;
            secs += parseInt(parts[1], 10);
        } else {
            secs += parseInt(parts[0], 10) || 0;
        }
        return secs;
    };

    const groupData = useMemo(() => {
        if (groupBy === 'none') return [];

        const groups: Record<string, { name: string, PASS: number, FAIL: number, totalSeconds: number, runCount: number }> = {};

        logs.forEach(log => {
            let key = 'Unknown';
            if (groupBy === 'device') {
                key = log.device_model || log.device_udid || 'Unknown';
            } else if (groupBy === 'suite') {
                key = log.suite_name || 'Unknown';
            } else if (groupBy === 'os_version') {
                key = log.android_version ? `Android ${log.android_version}` : 'Unknown OS';
            } else if (groupBy === 'status') {
                key = log.status;
            }

            key = decodeHtml(key);

            if (!groups[key]) groups[key] = { name: key, PASS: 0, FAIL: 0, totalSeconds: 0, runCount: 0 };
            
            if (countMethod === 'suites') {
                if (log.status === 'PASS') groups[key].PASS++;
                else groups[key].FAIL++;
            } else {
                groups[key].PASS += (log.pass_count || 0);
                groups[key].FAIL += (log.fail_count || 0);
            }

            groups[key].totalSeconds += parseDurationToSeconds(log.duration || "");
            groups[key].runCount++;
        });

        return Object.values(groups)
            .map(g => ({ ...g, durationAvg: Math.round(g.totalSeconds / g.runCount) }))
            .sort((a, b) => (b.PASS + b.FAIL) - (a.PASS + a.FAIL));
    }, [logs, groupBy, countMethod]);

    if (logs.length === 0) return null;

    return (
        <div className="flex flex-col gap-4 mb-6">
            <motion.div
                initial={{ opacity: 0, height: 0, scale: 0.95 }}
                animate={{ opacity: 1, height: 'auto', scale: 1 }}
                exit={{ opacity: 0, height: 0, scale: 0.95 }}
                transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
                className={clsx(
                    "grid gap-4 overflow-hidden",
                    groupBy === 'none' || groupBy === 'status' ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3"
                )}
            >
                {/* Status Distribution (Pie) */}
                <div className="bg-surface/50 border border-outline-variant/30 rounded-2xl p-4 flex flex-col">
                    <div className="flex items-center gap-2 mb-4 text-on-surface-variant/80 font-medium text-sm border-b border-outline-variant/30 pb-2">
                        <PieIcon size={16} />
                        {t('tests_page.charts.status_distribution')}
                    </div>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS]} strokeWidth={0} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.9)', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Group Performance (Bar) */}
                {groupBy !== 'none' && groupBy !== 'status' && (
                    <>
                        <div className="bg-surface/50 border border-outline-variant/30 rounded-2xl p-4 flex flex-col">
                            <div className="flex items-center gap-2 mb-4 text-on-surface-variant/80 font-medium text-sm border-b border-outline-variant/30 pb-2">
                                <BarIcon size={16} />
                                {t('tests_page.charts.group_performance', { group: t(`tests_page.filter.${groupBy}`) })}
                            </div>
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={groupData}
                                        layout="vertical"
                                        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#52525b" opacity={0.2} />
                                        <XAxis type="number" hide />
                                        <YAxis
                                            type="category"
                                            dataKey="name"
                                            tick={{ fontSize: 11, fill: '#71717a' }}
                                            width={100}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                            contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.9)', border: 'none', borderRadius: '8px', color: '#fff' }}
                                        />
                                        <Legend />
                                        <Bar dataKey="PASS" stackId="a" fill={COLORS.PASS} radius={[0, 4, 4, 0]} />
                                        <Bar dataKey="FAIL" stackId="a" fill={COLORS.FAIL} radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Average Duration by Group (Bar) */}
                        <div className="bg-surface/50 border border-outline-variant/30 rounded-2xl p-4 flex flex-col">
                            <div className="flex items-center gap-2 mb-4 text-on-surface-variant/80 font-medium text-sm border-b border-outline-variant/30 pb-2">
                                <Clock size={16} />
                                {t('tests_page.charts.duration_avg')}
                            </div>
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={groupData}
                                        layout="vertical"
                                        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#52525b" opacity={0.2} />
                                        <XAxis type="number" hide />
                                        <YAxis
                                            type="category"
                                            dataKey="name"
                                            tick={{ fontSize: 11, fill: '#71717a' }}
                                            width={100}
                                        />
                                        <Tooltip
                                            formatter={(value: any) => [`${value}s`, 'Avg Duration']}
                                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                            contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.9)', border: 'none', borderRadius: '8px', color: '#fff' }}
                                        />
                                        <Bar dataKey="durationAvg" fill={COLORS.blue} radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </>
                )}

            </motion.div>
        </div>
    );
}

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { PieChart as PieIcon, BarChart as BarIcon } from 'lucide-react';

interface TestLog {
    path: string;
    suite_name: string;
    status: 'PASS' | 'FAIL';
    device_udid?: string | null;
    device_model?: string | null;
    android_version?: string | null;
    timestamp: string;
    duration: string;
}

interface HistoryChartsProps {
    logs: TestLog[];
    groupBy: string;
}

const COLORS = {
    PASS: '#22c55e', // green-500
    FAIL: '#ef4444', // red-500
    // Additional colors for groups if needed
    blue: '#3b82f6',
    orange: '#f97316',
    purple: '#a855f7',
    yellow: '#eab308'
};

export function HistoryCharts({ logs, groupBy }: HistoryChartsProps) {
    const { t } = useTranslation();

    const statusData = useMemo(() => {
        const counts = { PASS: 0, FAIL: 0 };
        logs.forEach(l => {
            if (l.status === 'PASS') counts.PASS++;
            else if (l.status === 'FAIL') counts.FAIL++;
        });
        return [
            { name: 'PASS', value: counts.PASS },
            { name: 'FAIL', value: counts.FAIL }
        ].filter(d => d.value > 0);
    }, [logs]);


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

    const groupData = useMemo(() => {
        if (groupBy === 'none') return [];

        const groups: Record<string, { name: string, PASS: number, FAIL: number }> = {};

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

            // Decode entities in the key (especially for suite names)
            key = decodeHtml(key);

            if (!groups[key]) groups[key] = { name: key, PASS: 0, FAIL: 0 };
            if (log.status === 'PASS') groups[key].PASS++;
            else groups[key].FAIL++;
        });

        return Object.values(groups).sort((a, b) => (b.PASS + b.FAIL) - (a.PASS + a.FAIL));
    }, [logs, groupBy]);

    if (logs.length === 0) return null;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
            {/* Status Distribution (Pie) */}
            <div className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-700/50 rounded-lg p-4 flex flex-col">
                <div className="flex items-center gap-2 mb-4 text-zinc-600 dark:text-zinc-400 font-medium text-sm border-b border-zinc-200 dark:border-zinc-700 pb-2">
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
                <div className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-700/50 rounded-lg p-4 flex flex-col">
                    <div className="flex items-center gap-2 mb-4 text-zinc-600 dark:text-zinc-400 font-medium text-sm border-b border-zinc-200 dark:border-zinc-700 pb-2">
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
            )}

            {/* Placeholder if no grouping selected */}
            {groupBy === 'none' && (
                <div className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-700/50 rounded-lg p-4 flex flex-col items-center justify-center text-zinc-400 text-sm">
                    <BarIcon size={32} className="mb-2 opacity-50" />
                    <p>{t('tests_page.charts.select_group')}</p>
                </div>
            )}
        </div>
    );
}

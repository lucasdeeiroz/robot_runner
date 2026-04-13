import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    ChevronRight, ChevronDown, CheckCircle2, AlertCircle,
    Brain, MousePointerClick, SearchCode, Bug, RefreshCw, Info, Sparkles,
    XCircle
} from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';

interface LogEntry {
    text: string;
    type: 'action' | 'info' | 'debug' | 'error' | 'ai' | 'rationale' | 'transition' | 'finished' | 'stopped';
    timestamp?: number;
}

interface ExplorationStep {
    number: number;
    status: 'running' | 'pass' | 'fail';
    title: string;
    entries: LogEntry[];
}

interface ExplorationLogTreeProps {
    logs: string[];
}

export const ExplorationLogTree: React.FC<ExplorationLogTreeProps> = ({ logs }) => {
    const { t } = useTranslation();
    const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});
    const prevStepsRef = useRef<ExplorationStep[]>([]);

    const steps = useMemo(() => {
        const parsedSteps: ExplorationStep[] = [];
        let currentStep: ExplorationStep | null = null;

        logs.forEach((log) => {
            // New Step Detection
            const stepMatch = log.match(/--- Step (\d+) ---/);
            if (stepMatch) {
                if (currentStep) {
                    // Update status of previous step if it wasn't marked as fail
                    if (currentStep.status === 'running') currentStep.status = 'pass';
                    parsedSteps.push(currentStep);
                }
                currentStep = {
                    number: parseInt(stepMatch[1]),
                    status: 'running',
                    title: t('mapper.exploration.step_title', { number: stepMatch[1], defaultValue: `Step ${stepMatch[1]}` }),
                    entries: []
                };
                return;
            }

            if (!currentStep) {
                // Initial or preamble logs
                currentStep = {
                    number: 0,
                    status: 'pass',
                    title: t('mapper.exploration.initialization'),
                    entries: []
                };
            }

            // Entry Categorization
            let entry: LogEntry;
            if (log.match(/Rationale:/)) {
                entry = { text: log.replace('Rationale:', '').trim(), type: 'rationale' };
            } else if (log.match(/AI mapped:/)) {
                entry = { text: log.replace('AI mapped:', '').replace('with', t('mapper.exploration.with_text')).replace('elements', t('mapper.exploration.elements_text')).trim(), type: 'ai' };
            } else if (log.match(/Debug/)) {
                entry = { text: log.replace('[Debug]', '').trim(), type: 'debug' };
            } else if (log.toLowerCase().includes('error') && !log.includes('Exploration stopped:')) {
                entry = { text: log.replace('Error during exploration:', '').trim(), type: 'error' };
                currentStep.status = 'fail';
            } else if (log.match(/Clicking|Swiping|Typing|Navigating/)) {
                entry = { text: log.replace('Clicking', t('mapper.exploration.clicking')).replace('Swiping', t('mapper.exploration.swiping')).replace('Typing', t('mapper.exploration.typing')).replace('Navigating', t('mapper.exploration.navigating')).replace('element:', t('mapper.exploration.element_text')).replace('(', '- ').replace(')', '').trim(), type: 'action' };
            } else if (log.match(/Capturing|Preparing|Analyzing/)) {
                entry = { text: log.trim(), type: 'transition' };
            } else if (log.match(/Exploration finished by AI./)) {
                entry = { text: log.replace('Exploration finished by AI.', '').trim(), type: 'finished' };
                currentStep.status = 'pass';
            } else if (log.match(/Exploration stopped:/)) {
                entry = { text: log.replace('Exploration stopped:', '').trim(), type: 'stopped' };
                currentStep.status = 'fail';
            } else {
                entry = { text: log.trim(), type: 'info' };
            }


            currentStep.entries.push(entry);
        });

        if (currentStep) {
            parsedSteps.push(currentStep);
        }

        return parsedSteps;
    }, [logs, t]);

    // Auto-management of expanded steps
    useEffect(() => {
        if (steps.length > 0) {
            const lastStep = steps[steps.length - 1];

            // 1. Auto-expand NEW running steps
            if (lastStep.status === 'running' && !expandedSteps[lastStep.number]) {
                setExpandedSteps(prev => ({ ...prev, [lastStep.number]: true }));
            }

            // 2. Auto-collapse steps that just transitioned to pass
            steps.forEach(step => {
                const prevStep = prevStepsRef.current.find(s => s.number === step.number);
                if (prevStep && prevStep.status === 'running' && step.status === 'pass') {
                    setExpandedSteps(prev => {
                        const next = { ...prev };
                        delete next[step.number];
                        return next;
                    });
                }
            });
        }
        prevStepsRef.current = steps;
    }, [steps]);

    const toggleStep = (stepNumber: number) => {
        setExpandedSteps(prev => ({ ...prev, [stepNumber]: !prev[stepNumber] }));
    };

    return (
        <div className="flex flex-col gap-2 w-full">
            {steps.map((step) => (
                <StepNode
                    key={step.number}
                    step={step}
                    isExpanded={!!expandedSteps[step.number]}
                    onToggle={() => toggleStep(step.number)}
                />
            ))}
        </div>
    );
};

const StepNode: React.FC<{
    step: ExplorationStep;
    isExpanded: boolean;
    onToggle: () => void;
}> = ({ step, isExpanded, onToggle }) => {
    const { t } = useTranslation();

    const statusConfig = {
        running: {
            borderColor: 'border-primary/30',
            bgColor: 'bg-primary/5',
            summaryColor: 'text-primary',
            icon: <RefreshCw size={14} className="animate-spin" />,
            label: t('common.running')
        },
        pass: {
            borderColor: 'border-success/30',
            bgColor: 'bg-success/5',
            summaryColor: 'text-success',
            icon: <CheckCircle2 size={14} />,
            label: t('common.pass')
        },
        fail: {
            borderColor: 'border-error/30',
            bgColor: 'bg-error/5',
            summaryColor: 'text-error',
            icon: <AlertCircle size={14} />,
            label: t('common.fail')
        }
    };

    const config = statusConfig[step.status];

    return (
        <div className={clsx(
            "flex flex-col rounded-xl border transition-all overflow-hidden",
            config.borderColor,
            config.bgColor
        )}>
            {/* Header */}
            <div
                className="flex items-center gap-3 p-3 cursor-pointer hover:bg-on-surface/5 transition-colors"
                onClick={onToggle}
            >
                {isExpanded ? <ChevronDown size={14} className="opacity-50" /> : <ChevronRight size={14} className="opacity-50" />}

                <div className={clsx("p-1.5 rounded-lg bg-surface/50", config.summaryColor)}>
                    <Brain size={16} />
                </div>

                <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-xs font-bold tracking-tight text-on-surface">
                        {step.title}
                    </span>
                    <span className="text-[10px] opacity-60 font-mono truncate">
                        {t('mapper.exploration.events_logged', { count: step.entries.length, defaultValue: `${step.entries.length} events logged` })}
                    </span>
                </div>

                <div className={clsx(
                    "flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                    step.status === 'running' ? 'bg-primary/10' : step.status === 'fail' ? 'bg-error/10' : 'bg-success/10',
                    config.summaryColor
                )}>
                    {config.icon}
                    {config.label}
                </div>
            </div>

            {/* Content */}
            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                    >
                        <div className="flex flex-col gap-1 p-3 pt-0 ml-4 border-l border-on-surface/5">
                            {step.entries.map((entry, idx) => (
                                <LogEntryItem key={idx} entry={entry} />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const LogEntryItem: React.FC<{ entry: LogEntry }> = ({ entry }) => {
    const { t } = useTranslation();

    if (entry.type === 'ai') {
        return (
            <div className="my-1 p-2 bg-on-surface/5 rounded-lg border border-on-surface/5 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-primary/80">
                    <Sparkles size={12} />
                    {t('mapper.exploration.ai_title')}
                </div>
                <div className="text-[11px] leading-relaxed text-on-surface/80 italic">
                    {entry.text}
                </div>
            </div>
        );
    } else if (entry.type === 'rationale') {
        return (
            <div className="my-1 p-2 bg-on-surface/5 rounded-lg border border-on-surface/5 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-orange-400/80">
                    <SearchCode size={12} />
                    {t('mapper.exploration.rationale_title')}
                </div>
                <div className="text-[11px] leading-relaxed text-on-surface/80 italic">
                    "{entry.text}"
                </div>
            </div>
        );
    } else if (entry.type === 'action') {
        return (
            <div className="my-1 p-2 bg-on-surface/5 rounded-lg border border-on-surface/5 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-primary/80">
                    <MousePointerClick size={12} />
                    {t('mapper.exploration.action_title')}
                </div>
                <div className="text-[11px] leading-relaxed text-on-surface/80 italic">
                    {entry.text}
                </div>
            </div>
        );
    } else if (entry.type === 'error') {
        return (
            <div className="my-1 p-2 bg-on-surface/5 rounded-lg border border-on-surface/5 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-error/80">
                    <Bug size={12} />
                    {t('mapper.exploration.error_title')}
                </div>
                <div className="text-[11px] leading-relaxed text-on-surface/80 italic">
                    {entry.text}
                </div>
            </div>
        );
    } else if (entry.type === 'finished') {
        return (
            <div className="my-1 p-2 bg-on-surface/5 rounded-lg border border-on-surface/5 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-success/80">
                    <CheckCircle2 size={12} />
                    {t('mapper.exploration.finished_title')}
                </div>
                <div className="text-[11px] leading-relaxed text-on-surface/80 italic">
                    {entry.text}
                </div>
            </div>
        );
    } else if (entry.type === 'stopped') {
        return (
            <div className="my-1 p-2 bg-on-surface/5 rounded-lg border border-on-surface/5 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-error/80">
                    <XCircle size={12} />
                    {t('mapper.exploration.stopped_title')}
                </div>
                <div className="text-[11px] leading-relaxed text-on-surface/80 italic">
                    {entry.text}
                </div>
            </div>
        );
    } else {
        return (
            <div className="my-0.5 p-1 bg-on-surface/5 rounded-lg border border-on-surface/5 flex flex-col">
                <div className="flex items-center gap-2 text-[10px] font-semibold tracking-wider text-on-surface-variant/50">
                    {entry.type === 'debug' ? <Bug size={12} /> : entry.type === 'transition' ? <RefreshCw size={12} /> : entry.type === 'info' ? <Info size={12} /> : null}
                    {entry.text}
                </div>
            </div>
        );
    }
};


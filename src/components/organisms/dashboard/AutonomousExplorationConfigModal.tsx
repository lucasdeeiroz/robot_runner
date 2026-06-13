import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Compass, Focus, Map, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { ActionCard } from '@/components/atoms/ActionCard';
import { TagInput } from '@/components/atoms/TagInput';
import { Switch } from '@/components/atoms/Switch';
import { Textarea } from '@/components/atoms/Textarea';
import { ExplorationConfig } from '@/lib/dashboard/explorationEngine';

interface AutonomousExplorationConfigModalProps {
    onClose: () => void;
    onStart: (config: ExplorationConfig, prompt: string, useAi: boolean) => void;
}

export function AutonomousExplorationConfigModal({ onClose, onStart }: AutonomousExplorationConfigModalProps) {
    const { t } = useTranslation();

    const [mode, setMode] = useState<'new' | 'all' | 'specific'>('new');
    const [limits, setLimits] = useState<'default' | 'custom'>('default');
    
    // Custom Tags
    const [avoidKeywords, setAvoidKeywords] = useState<string[]>([]);
    const [escapeTargets, setEscapeTargets] = useState<string[]>([]);
    const [priorityKeywords, setPriorityKeywords] = useState<string[]>([]);

    const [useAi, setUseAi] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');

    const handleStart = () => {
        const config: ExplorationConfig = {
            priorityKeywords: mode === 'specific' ? priorityKeywords : [],
            avoidKeywords: limits === 'custom' ? avoidKeywords : [],
            escapeTargets: limits === 'custom' ? escapeTargets : [],
            forceReexplore: [],
            revisitKnownScreens: mode === 'all' || mode === 'specific',
        };
        onStart(config, aiPrompt, useAi);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface/80 backdrop-blur-md p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-surface border border-outline-variant/30 shadow-2xl rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-outline-variant/20 bg-surface-variant/30">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <Compass size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-on-surface">{t('exploration_modal.title')}</h2>
                            <p className="text-sm text-on-surface-variant/80">{t('exploration_modal.subtitle')}</p>
                        </div>
                    </div>
                    <Button variant="ghost" onClick={onClose} className="hover:bg-error/10 hover:text-error text-on-surface-variant">
                        <X size={24} />
                    </Button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8">
                    {/* Mode Selection */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant/60">
                            {t('exploration_modal.mode.title')}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <ActionCard
                                title={t('exploration_modal.mode.new.title')}
                                description={t('exploration_modal.mode.new.desc')}
                                icon={<Sparkles size={20} />}
                                selected={mode === 'new'}
                                onClick={() => setMode('new')}
                                orientation="vertical"
                            />
                            <ActionCard
                                title={t('exploration_modal.mode.all.title')}
                                description={t('exploration_modal.mode.all.desc')}
                                icon={<Map size={20} />}
                                selected={mode === 'all'}
                                onClick={() => setMode('all')}
                                orientation="vertical"
                            />
                            <ActionCard
                                title={t('exploration_modal.mode.specific.title')}
                                description={t('exploration_modal.mode.specific.desc')}
                                icon={<Focus size={20} />}
                                selected={mode === 'specific'}
                                onClick={() => setMode('specific')}
                                orientation="vertical"
                            />
                        </div>
                    </div>

                    {/* Limits Selection */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant/60">
                            {t('exploration_modal.limits.title')}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <ActionCard
                                title={t('exploration_modal.limits.default.title')}
                                description={t('exploration_modal.limits.default.desc')}
                                selected={limits === 'default'}
                                onClick={() => setLimits('default')}
                                orientation="horizontal"
                            />
                            <ActionCard
                                title={t('exploration_modal.limits.custom.title')}
                                description={t('exploration_modal.limits.custom.desc')}
                                selected={limits === 'custom'}
                                onClick={() => setLimits('custom')}
                                orientation="horizontal"
                            />
                        </div>
                    </div>

                    <AnimatePresence>
                        {limits === 'custom' && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="space-y-4 bg-surface-variant/20 p-5 rounded-2xl border border-outline-variant/30"
                            >
                                <TagInput
                                    label={t('exploration_modal.fields.blocked')}
                                    tags={avoidKeywords}
                                    onChange={setAvoidKeywords}
                                    placeholder={t('exploration_modal.fields.blocked_placeholder')}
                                />
                                <TagInput
                                    label={t('exploration_modal.fields.escape')}
                                    tags={escapeTargets}
                                    onChange={setEscapeTargets}
                                    placeholder={t('exploration_modal.fields.escape_placeholder')}
                                />
                                {mode === 'specific' && (
                                    <TagInput
                                        label={t('exploration_modal.fields.priority')}
                                        tags={priorityKeywords}
                                        onChange={setPriorityKeywords}
                                        placeholder={t('exploration_modal.fields.priority_placeholder')}
                                    />
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* AI Section */}
                    <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-primary dark:text-primary/90 flex items-center gap-2">
                                    <Sparkles size={16} />
                                    {t('exploration_modal.ai.title')}
                                </h3>
                                <p className="text-xs text-on-surface-variant/80 mt-1">
                                    {t('exploration_modal.ai.desc')}
                                </p>
                            </div>
                            <Switch checked={useAi} onCheckedChange={setUseAi} />
                        </div>
                        
                        <AnimatePresence>
                            {useAi && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="pt-2"
                                >
                                    <Textarea
                                        value={aiPrompt}
                                        onChange={(e) => setAiPrompt(e.target.value)}
                                        placeholder={t('exploration_modal.ai.placeholder')}
                                        className="w-full bg-surface"
                                        rows={3}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-outline-variant/20 bg-surface-variant/30 flex justify-end gap-3">
                    <Button variant="ghost" onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button variant="primary" onClick={handleStart} className="px-8 shadow-lg shadow-primary/20">
                        {t('common.start')}
                    </Button>
                </div>
            </motion.div>
        </div>
    );
}

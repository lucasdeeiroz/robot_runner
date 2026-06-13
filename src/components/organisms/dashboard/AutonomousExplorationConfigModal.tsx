import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Compass, Focus, Map, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { ActionCard } from '@/components/atoms/ActionCard';
import { TagInput } from '@/components/atoms/TagInput';
import { Switch } from '@/components/atoms/Switch';
import { Textarea } from '@/components/atoms/Textarea';
import { Select } from '@/components/atoms/Select';
import { ExplorationConfig, DESTRUCTIVE_TERMS, ESCAPE_TERMS } from '@/lib/dashboard/explorationEngine';
import { useSettings } from '@/lib/settings';

interface AutonomousExplorationConfigModalProps {
    onClose: () => void;
    onStart: (config: ExplorationConfig, prompt: string, useAi: boolean) => void;
}

export function AutonomousExplorationConfigModal({ onClose, onStart }: AutonomousExplorationConfigModalProps) {
    const { t } = useTranslation();

    const [mode, setMode] = useState<'new' | 'all' | 'specific'>(() => {
        return (localStorage.getItem('exploration_config_mode') as 'new' | 'all' | 'specific') || 'new';
    });
    const [limits, setLimits] = useState<'default' | 'custom'>(() => {
        return (localStorage.getItem('exploration_config_limits') as 'default' | 'custom') || 'default';
    });

    useEffect(() => {
        if (mode === 'specific') {
            setLimits('custom');
        }
    }, [mode]);

    
    // Custom Tags
    const [avoidKeywords, setAvoidKeywords] = useState<string[]>(() => {
        const saved = localStorage.getItem('exploration_config_avoid');
        return saved ? JSON.parse(saved) : [];
    });
    const [escapeTargets, setEscapeTargets] = useState<string[]>(() => {
        const saved = localStorage.getItem('exploration_config_escape');
        return saved ? JSON.parse(saved) : [];
    });
    const [priorityKeywords, setPriorityKeywords] = useState<string[]>(() => {
        const saved = localStorage.getItem('exploration_config_priority');
        return saved ? JSON.parse(saved) : [];
    });

    const { settings } = useSettings();
    const availablePackages = settings.tools.appPackage
        ? settings.tools.appPackage.split(',').map(p => p.trim()).filter(Boolean)
        : [];

    const [targetPackage, setTargetPackage] = useState<string>(() => {
        return localStorage.getItem('exploration_config_targetPackage') || availablePackages[0] || '';
    });
    const [allowedPackages, setAllowedPackages] = useState<string[]>(() => {
        const saved = localStorage.getItem('exploration_config_allowedPackages');
        return saved ? JSON.parse(saved) : [];
    });

    const [useAi, setUseAi] = useState(() => {
        return localStorage.getItem('exploration_config_useAi') === 'true';
    });
    const [aiPrompt, setAiPrompt] = useState(() => {
        return localStorage.getItem('exploration_config_aiPrompt') || '';
    });

    const handleStart = () => {
        // Save preferences to local storage for future sessions
        localStorage.setItem('exploration_config_mode', mode);
        localStorage.setItem('exploration_config_limits', limits);
        localStorage.setItem('exploration_config_avoid', JSON.stringify(avoidKeywords));
        localStorage.setItem('exploration_config_escape', JSON.stringify(escapeTargets));
        localStorage.setItem('exploration_config_priority', JSON.stringify(priorityKeywords));
        localStorage.setItem('exploration_config_targetPackage', targetPackage);
        localStorage.setItem('exploration_config_allowedPackages', JSON.stringify(allowedPackages));
        localStorage.setItem('exploration_config_useAi', String(useAi));
        localStorage.setItem('exploration_config_aiPrompt', aiPrompt);
        const config: ExplorationConfig = {
            priorityKeywords: mode === 'specific' ? priorityKeywords : [],
            avoidKeywords: limits === 'custom' ? (avoidKeywords.length > 0 ? avoidKeywords : DESTRUCTIVE_TERMS) : [],
            escapeTargets: limits === 'custom' ? (escapeTargets.length > 0 ? escapeTargets : ESCAPE_TERMS) : [],
            forceReexplore: [],
            revisitKnownScreens: mode === 'all' || mode === 'specific',
            targetPackage: targetPackage || undefined,
            allowedPackages: allowedPackages,
        };
        onStart(config, aiPrompt, useAi);
    };

    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    if (!mounted) return null;

    return createPortal(
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
                                onClick={() => {
                                    if (mode !== 'specific') setLimits('default');
                                }}
                                orientation="horizontal"
                                className={mode === 'specific' ? 'opacity-50 pointer-events-none' : ''}
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

                    {/* App Bundles / Packages Section */}
                    {availablePackages.length > 0 && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant/60">
                                {t('exploration_modal.packages.title', 'Target & Allowed Apps')}
                            </h3>
                            <div className="bg-surface-variant/20 p-5 rounded-2xl border border-outline-variant/30 space-y-4">
                                <Select
                                    label={t('exploration_modal.packages.target_label', 'Target App')}
                                    value={targetPackage}
                                    onChange={(e) => setTargetPackage(e.target.value)}
                                    options={availablePackages.map(pkg => ({ label: pkg, value: pkg }))}
                                />
                                
                                <div className="space-y-2 pt-2">
                                    <p className="text-sm font-medium text-on-surface">
                                        {t('exploration_modal.packages.allowed_label', 'Secondary Allowed Apps (App Bundles)')}
                                    </p>
                                    <p className="text-xs text-on-surface-variant/80 mb-2">
                                        {t('exploration_modal.packages.allowed_desc', 'If exploration opens these apps, it will continue naturally without force-stopping them.')}
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {availablePackages.filter(pkg => pkg !== targetPackage).map(pkg => (
                                            <div key={pkg} className="flex items-center gap-3 bg-surface p-3 rounded-xl border border-outline-variant/10 cursor-pointer" onClick={() => {
                                                setAllowedPackages(prev => 
                                                    prev.includes(pkg) ? prev.filter(p => p !== pkg) : [...prev, pkg]
                                                );
                                            }}>
                                                <Switch 
                                                    checked={allowedPackages.includes(pkg)}
                                                    onCheckedChange={(checked) => {
                                                        setAllowedPackages(prev => 
                                                            checked ? [...prev, pkg] : prev.filter(p => p !== pkg)
                                                        );
                                                    }}
                                                />
                                                <span className="text-sm text-on-surface truncate" title={pkg}>{pkg}</span>
                                            </div>
                                        ))}
                                        {availablePackages.filter(pkg => pkg !== targetPackage).length === 0 && (
                                            <div className="text-xs text-on-surface-variant italic col-span-2">
                                                {t('exploration_modal.packages.no_secondary', 'No other packages available in Settings.')}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

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
        </div>,
        document.body
    );
}

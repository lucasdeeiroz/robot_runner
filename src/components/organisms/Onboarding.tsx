import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/lib/settings';
import { Button } from '@/components/atoms/Button';
import { Select } from '@/components/atoms/Select';
import { Badge } from '@/components/atoms/Badge';
import { ActionCard } from '@/components/atoms/ActionCard';
import { Compass, Bot, Zap, Terminal, Globe, Smartphone, FileUp, X, Check } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { motion } from 'framer-motion';
import { feedback } from '@/lib/feedback';

interface OnboardingProps {
    onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
    const { t, i18n } = useTranslation();
    const { settings, updateSetting, setMultipleSettings, importSettingsStore, checkSystemVersions } = useSettings();

    const [step, setStep] = useState(1);
    const [selectedLanguage, setSelectedLanguage] = useState(settings.language || 'en_US');
    const [selectedMode, setSelectedMode] = useState<'explorer' | 'automator' | undefined>(settings.usageMode);
    const [selectedFramework, setSelectedFramework] = useState<'robot' | 'appium' | 'maestro' | 'cypress' | 'selenium' | undefined>(settings.automationFramework || 'robot');
    const [selectedExplorerPlatform, setSelectedExplorerPlatform] = useState<'mobile' | 'web' | undefined>(settings.explorerPlatform || 'mobile');

    // Import states
    const [showPathWarning, setShowPathWarning] = useState(false);
    const [importedSettings, setImportedSettings] = useState<any | null>(null);
    const [importing, setImporting] = useState(false);

    const handleImportFile = async () => {
        try {
            setImporting(true);
            const selected = await open({
                multiple: false,
                filters: [{ name: 'JSON', extensions: ['json'] }]
            });

            if (!selected) {
                setImporting(false);
                return;
            }

            const path = Array.isArray(selected) ? selected[0] : selected;
            const fileContent = await readTextFile(path.path || path as string);

            let parsed;
            try {
                parsed = JSON.parse(fileContent);
                if (parsed && parsed.app_config) {
                    parsed = parsed.app_config;
                }
            } catch (e) {
                feedback.toast.error(t('onboarding.error_invalid_json', 'Invalid JSON file'));
                setImporting(false);
                return;
            }

            // Remove AI keys for security
            if (parsed.profiles) {
                Object.values(parsed.profiles).forEach((profile: any) => {
                    if (profile.settings) {
                        delete profile.settings.geminiApiKey;
                        delete profile.settings.antigravityApiKey;
                        delete profile.settings.claudeApiKey;
                        delete profile.settings.openaiApiKey;
                        delete profile.settings.claudeCodeToken;
                    }
                });
            } else {
                delete parsed.geminiApiKey;
                delete parsed.antigravityApiKey;
                delete parsed.claudeApiKey;
                delete parsed.openaiApiKey;
                delete parsed.claudeCodeToken;
            }

            // Check if we have paths
            let hasAutomationRoot = false;
            let hasCustomAdb = false;
            if (parsed.profiles && parsed.activeProfileId) {
                const activeSettings = parsed.profiles[parsed.activeProfileId]?.settings;
                hasAutomationRoot = !!(activeSettings?.paths?.automationRoot);
                hasCustomAdb = !!(activeSettings?.customAdbPath);
            } else {
                hasAutomationRoot = !!(parsed.paths?.automationRoot);
                hasCustomAdb = !!(parsed.customAdbPath);
            }

            setImportedSettings(parsed);

            if (hasAutomationRoot || hasCustomAdb) {
                setShowPathWarning(true);
            } else {
                applyImportedSettings(parsed);
            }

        } catch (e) {
            console.error(e);
            feedback.toast.error(t('onboarding.error_read_file', 'Failed to read file'));
        } finally {
            setImporting(false);
        }
    };

    const applyImportedSettings = (settingsToApply: any) => {
        if (settingsToApply.profiles && settingsToApply.activeProfileId) {
            importSettingsStore(settingsToApply);
        } else {
            setMultipleSettings(settingsToApply);
        }
        feedback.toast.success(t('onboarding.success_import', 'Settings imported successfully'));
        setShowPathWarning(false);

        // Fast forward if we have valid modes
        const activeProfileSettings = settingsToApply.profiles ? settingsToApply.profiles[settingsToApply.activeProfileId]?.settings : settingsToApply;

        if (activeProfileSettings?.usageMode) {
            setSelectedMode(activeProfileSettings.usageMode);
            if (activeProfileSettings.usageMode === 'automator' && activeProfileSettings.automationFramework) {
                setSelectedFramework(activeProfileSettings.automationFramework);
                onComplete();
                return;
            } else if (activeProfileSettings.usageMode === 'explorer' && activeProfileSettings.explorerPlatform) {
                setSelectedExplorerPlatform(activeProfileSettings.explorerPlatform);
                onComplete();
                return;
            }
        }
        setStep(3); // Go to mode selection normally if something missing
    };

    const confirmPaths = (keepAutomationRoot: boolean, keepCustomAdb: boolean) => {
        if (!importedSettings) return;
        const toApply = { ...importedSettings };

        if (toApply.profiles && toApply.activeProfileId) {
            const activeSettings = toApply.profiles[toApply.activeProfileId].settings;
            if (!keepAutomationRoot && activeSettings.paths) {
                activeSettings.paths.automationRoot = '';
            }
            if (!keepCustomAdb) {
                activeSettings.customAdbPath = '';
            }
        } else {
            if (!keepAutomationRoot && toApply.paths) {
                toApply.paths.automationRoot = '';
            }
            if (!keepCustomAdb) {
                toApply.customAdbPath = '';
            }
        }

        applyImportedSettings(toApply);
    };

    useEffect(() => {
        // Apply language choice immediately for the UI
        const langMap: Record<string, string> = {
            'en_US': 'en',
            'pt_BR': 'pt',
            'es_ES': 'es'
        };
        const mappedLang = langMap[selectedLanguage] || 'en';
        if (i18n.language !== mappedLang) {
            i18n.changeLanguage(mappedLang);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedLanguage]);

    const handleComplete = async () => {
        if (!selectedMode) {
            feedback.toast.error(t('onboarding.error_no_mode'));
            return;
        }
        if (selectedMode === 'automator' && !selectedFramework) {
            feedback.toast.error(t('onboarding.error_no_framework'));
            return;
        }
        if (selectedMode === 'explorer' && !selectedExplorerPlatform) {
            feedback.toast.error(t('onboarding.error_no_platform'));
            return;
        }

        updateSetting('usageMode', selectedMode);
        updateSetting('language', selectedLanguage);
        if (selectedMode === 'automator') {
            updateSetting('automationFramework', selectedFramework);
        } else if (selectedMode === 'explorer') {
            updateSetting('explorerPlatform', selectedExplorerPlatform);
        }

        // Re-check system versions so missing automation/tunnelling tools warn
        await checkSystemVersions();

        onComplete();
    };

    return (
        <motion.div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-surface/80 backdrop-blur-md p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-surface border border-outline-variant/30 shadow-2xl rounded-3xl p-8 max-w-2xl w-full"
            >
                <div className="flex flex-col items-center mb-8">
                    <img src="/logo.png" alt="Robot Runner Logo" className="w-16 h-16 object-contain mb-8 shadow-sm bg-surface-variant/30" />
                    <h1 className="text-3xl font-bold text-on-surface">{t('onboarding.title')}</h1>
                    <p className="text-on-surface-variant/80 text-center mt-4 max-w-lg">
                        {t('onboarding.description')}
                    </p>
                </div>

                {step === 1 && (
                    <motion.div
                        key="step1"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="space-y-6"
                    >
                        <div className="flex flex-col items-center">
                            <h2 className="text-xl font-semibold mb-4 text-on-surface">{t('onboarding.step1_title')}</h2>
                            <Select
                                value={selectedLanguage}
                                onChange={(e) => setSelectedLanguage(e.target.value)}
                                options={[
                                    { value: "en_US", label: "English (US)" },
                                    { value: "pt_BR", label: "Português (Brasil)" },
                                    { value: "es_ES", label: "Español" }
                                ]}
                                containerClassName="w-64"
                            />
                        </div>
                        <div className="flex justify-end mt-8">
                            <Button variant="primary" onClick={() => setStep(2)}>
                                {t('common.next')}
                            </Button>
                        </div>
                    </motion.div>
                )}

                {step === 2 && (
                    <motion.div
                        key="step2"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="space-y-6"
                    >
                        {!showPathWarning ? (
                            <>
                                <h2 className="text-xl font-semibold mb-4 text-center text-on-surface">{t('onboarding.step_import_title', 'Import Settings')}</h2>
                                <p className="text-on-surface-variant text-center max-w-md mx-auto mb-6">
                                    {t('onboarding.step_import_description', 'Do you have a previous settings.json file you want to import to skip manual configuration? AI API Keys will be safely ignored.')}
                                </p>
                                <div className="flex flex-col items-center gap-4">
                                    <Button
                                        variant="primary"
                                        className="w-64 justify-center"
                                        onClick={handleImportFile}
                                        disabled={importing}
                                    >
                                        <FileUp size={18} className="mr-2" />
                                        {t('onboarding.import_button', 'Import settings.json')}
                                    </Button>
                                    <Button variant="ghost" onClick={() => setStep(3)}>
                                        {t('onboarding.skip_import', 'No, configure manually')}
                                    </Button>
                                </div>
                                <div className="flex justify-start mt-8">
                                    <Button variant="ghost" onClick={() => setStep(1)}>
                                        {t('common.back')}
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <h2 className="text-xl font-semibold mb-4 text-center text-warning">{t('onboarding.path_warning_title', 'Local Paths Detected')}</h2>
                                <p className="text-on-surface-variant text-sm text-center mb-6">
                                    {t('onboarding.path_warning_description', 'The imported file contains absolute local paths. Do you want to keep them or clear them?')}
                                </p>

                                <div className="space-y-4 bg-surface-variant/30 p-4 rounded-lg border border-outline-variant/30 text-sm">
                                    {(() => {
                                        let automationRoot = '';
                                        if (importedSettings?.profiles && importedSettings?.activeProfileId) {
                                            automationRoot = importedSettings.profiles[importedSettings.activeProfileId]?.settings?.paths?.automationRoot || '';
                                        } else {
                                            automationRoot = importedSettings?.paths?.automationRoot || '';
                                        }
                                        return automationRoot ? (
                                            <div className="flex flex-col gap-2 p-2 border-b border-outline-variant/30">
                                                <span className="font-semibold text-primary">{t('onboarding.path_automation_root', 'Automation Root:')}</span>
                                                <span className="text-on-surface-variant font-mono break-all">{automationRoot}</span>
                                                <div className="flex gap-2 mt-2">
                                                    <Button size="sm" variant="outline" onClick={() => confirmPaths(true, (importedSettings?.profiles ? importedSettings.profiles[importedSettings.activeProfileId]?.settings?.customAdbPath : importedSettings?.customAdbPath) === '')}>
                                                        <Check size={14} className="mr-1" /> {t('common.keep', 'Keep')}
                                                    </Button>
                                                    <Button size="sm" variant="ghost" className="text-error" onClick={() => confirmPaths(false, (importedSettings?.profiles ? importedSettings.profiles[importedSettings.activeProfileId]?.settings?.customAdbPath : importedSettings?.customAdbPath) === '')}>
                                                        <X size={14} className="mr-1" /> {t('common.clear', 'Clear')}
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : null;
                                    })()}
                                    {(() => {
                                        let customAdbPath = '';
                                        let automationRoot = '';
                                        if (importedSettings?.profiles && importedSettings?.activeProfileId) {
                                            customAdbPath = importedSettings.profiles[importedSettings.activeProfileId]?.settings?.customAdbPath || '';
                                            automationRoot = importedSettings.profiles[importedSettings.activeProfileId]?.settings?.paths?.automationRoot || '';
                                        } else {
                                            customAdbPath = importedSettings?.customAdbPath || '';
                                            automationRoot = importedSettings?.paths?.automationRoot || '';
                                        }
                                        return customAdbPath ? (
                                            <div className="flex flex-col gap-2 p-2">
                                                <span className="font-semibold text-primary">{t('onboarding.path_custom_adb', 'Custom ADB Path:')}</span>
                                                <span className="text-on-surface-variant font-mono break-all">{customAdbPath}</span>
                                                <div className="flex gap-2 mt-2">
                                                    <Button size="sm" variant="outline" onClick={() => confirmPaths(automationRoot === '', true)}>
                                                        <Check size={14} className="mr-1" /> {t('common.keep', 'Keep')}
                                                    </Button>
                                                    <Button size="sm" variant="ghost" className="text-error" onClick={() => confirmPaths(automationRoot === '', false)}>
                                                        <X size={14} className="mr-1" /> {t('common.clear', 'Clear')}
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : null;
                                    })()}
                                    {(() => {
                                        let customAdbPath = '';
                                        let automationRoot = '';
                                        if (importedSettings?.profiles && importedSettings?.activeProfileId) {
                                            customAdbPath = importedSettings.profiles[importedSettings.activeProfileId]?.settings?.customAdbPath || '';
                                            automationRoot = importedSettings.profiles[importedSettings.activeProfileId]?.settings?.paths?.automationRoot || '';
                                        } else {
                                            customAdbPath = importedSettings?.customAdbPath || '';
                                            automationRoot = importedSettings?.paths?.automationRoot || '';
                                        }
                                        return (automationRoot && customAdbPath) ? (
                                            <div className="flex justify-center gap-4 mt-4 pt-4 border-t border-outline-variant/30">
                                                <Button size="sm" variant="primary" onClick={() => confirmPaths(true, true)}>{t('common.keep_all', 'Keep All')}</Button>
                                                <Button size="sm" variant="ghost" className="text-error" onClick={() => confirmPaths(false, false)}>{t('common.clear_all', 'Clear All')}</Button>
                                            </div>
                                        ) : null;
                                    })()}
                                </div>
                            </>
                        )}
                    </motion.div>
                )}

                {step === 3 && (
                    <motion.div
                        key="step2"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="space-y-6"
                    >
                        <h2 className="text-xl font-semibold mb-4 text-center text-on-surface">{t('onboarding.step2_title')}</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Explorer Mode */}
                            <ActionCard
                                title={t('onboarding.mode.explorer.title')}
                                description={t('onboarding.mode.explorer.description')}
                                icon={<Compass size={24} />}
                                selected={selectedMode === 'explorer'}
                                onClick={() => setSelectedMode('explorer')}
                            />

                            {/* Automator Mode */}
                            <ActionCard
                                title={t('onboarding.mode.automator.title')}
                                description={t('onboarding.mode.automator.description')}
                                icon={<Bot size={24} />}
                                selected={selectedMode === 'automator'}
                                onClick={() => setSelectedMode('automator')}
                            />
                        </div>

                        <div className="flex justify-between mt-8">
                            <Button variant="ghost" onClick={() => setStep(2)}>
                                {t('common.back')}
                            </Button>
                            <Button
                                variant="primary"
                                className="hover:bg-secondary-container"
                                onClick={() => setStep(4)}
                                disabled={!selectedMode}
                            >
                                {t('common.next')}
                            </Button>
                        </div>
                    </motion.div>
                )}

                {step === 4 && (
                    <motion.div
                        key="step3"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="space-y-6"
                    >
                        <h2 className="text-xl font-semibold mb-4 text-center text-on-surface">
                            {selectedMode === 'explorer' ? t('onboarding.step2_platform_title') : t('onboarding.step3_title')}
                        </h2>

                        {selectedMode === 'explorer' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Mobile Platform */}
                                <ActionCard
                                    title={t('onboarding.platform.mobile.title')}
                                    description={t('onboarding.platform.mobile.description')}
                                    icon={<Smartphone size={28} />}
                                    selected={selectedExplorerPlatform === 'mobile'}
                                    onClick={() => setSelectedExplorerPlatform('mobile')}
                                    centered
                                />

                                {/* Web Platform */}
                                <ActionCard
                                    title={t('onboarding.platform.web.title')}
                                    description={t('onboarding.platform.web.description')}
                                    icon={<Globe size={28} />}
                                    selected={selectedExplorerPlatform === 'web'}
                                    onClick={() => setSelectedExplorerPlatform('web')}
                                    centered
                                />
                            </div>
                        )}

                        {selectedMode === 'automator' && (
                            <div className="space-y-6 max-h-[380px] overflow-y-auto pr-2 custom-scrollbar">
                                <div className="space-y-3">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60">
                                        Mobile Automation Frameworks
                                    </h3>
                                    <div className="grid grid-cols-1 gap-3">
                                        {/* Robot Framework */}
                                        <ActionCard
                                            title={t('onboarding.framework.robot.title')}
                                            description={t('onboarding.framework.robot.description')}
                                            icon={<Bot size={24} />}
                                            selected={selectedFramework === 'robot'}
                                            onClick={() => setSelectedFramework('robot')}
                                            orientation="horizontal"
                                        />

                                        {/* Appium Java */}
                                        <ActionCard
                                            title={t('onboarding.framework.appium.title')}
                                            description={t('onboarding.framework.appium.description')}
                                            icon={<Terminal size={24} />}
                                            selected={selectedFramework === 'appium'}
                                            onClick={() => setSelectedFramework('appium')}
                                            orientation="horizontal"
                                            badge={<Badge variant="info" size="sm" className="font-bold opacity-70">{t('common.beta')}</Badge>}
                                        />

                                        {/* Maestro */}
                                        <ActionCard
                                            title={t('onboarding.framework.maestro.title')}
                                            description={t('onboarding.framework.maestro.description')}
                                            icon={<Zap size={24} />}
                                            selected={selectedFramework === 'maestro'}
                                            onClick={() => setSelectedFramework('maestro')}
                                            orientation="horizontal"
                                            badge={<Badge variant="info" size="sm" className="font-bold opacity-70">{t('common.beta')}</Badge>}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3 pt-2">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60">
                                        Web Automation Frameworks
                                    </h3>
                                    <div className="grid grid-cols-1 gap-3">
                                        {/* Cypress */}
                                        <ActionCard
                                            title={t('onboarding.framework.cypress.title')}
                                            description={t('onboarding.framework.cypress.description')}
                                            icon={<Globe size={24} />}
                                            selected={selectedFramework === 'cypress'}
                                            onClick={() => setSelectedFramework('cypress')}
                                            orientation="horizontal"
                                        />

                                        {/* Selenium Pytest */}
                                        <ActionCard
                                            title={t('onboarding.framework.selenium.title')}
                                            description={t('onboarding.framework.selenium.description')}
                                            icon={<Terminal size={24} />}
                                            selected={selectedFramework === 'selenium'}
                                            onClick={() => setSelectedFramework('selenium')}
                                            orientation="horizontal"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between mt-8">
                            <Button variant="ghost" onClick={() => setStep(3)}>
                                {t('common.back')}
                            </Button>
                            <Button
                                variant="primary"
                                className="hover:bg-secondary-container"
                                onClick={handleComplete}
                                disabled={selectedMode === 'explorer' ? !selectedExplorerPlatform : !selectedFramework}
                            >
                                {t('common.finish')}
                            </Button>
                        </div>
                    </motion.div>
                )}
            </motion.div>
        </motion.div>
    );
}

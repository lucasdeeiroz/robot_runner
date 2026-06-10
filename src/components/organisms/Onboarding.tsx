import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/lib/settings';
import { Button } from '@/components/atoms/Button';
import { Select } from '@/components/atoms/Select';
import { Badge } from '@/components/atoms/Badge';
import { Compass, Bot, CheckCircle2, Zap, Terminal, Globe, Smartphone } from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { feedback } from '@/lib/feedback';

interface OnboardingProps {
    onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
    const { t, i18n } = useTranslation();
    const { settings, updateSetting, checkSystemVersions } = useSettings();

    const [step, setStep] = useState(1);
    const [selectedLanguage, setSelectedLanguage] = useState(settings.language || 'en_US');
    const [selectedMode, setSelectedMode] = useState<'explorer' | 'automator' | undefined>(settings.usageMode);
    const [selectedFramework, setSelectedFramework] = useState<'robot' | 'appium' | 'maestro' | 'cypress' | 'selenium' | undefined>(settings.automationFramework || 'robot');
    const [selectedExplorerPlatform, setSelectedExplorerPlatform] = useState<'mobile' | 'web' | undefined>(settings.explorerPlatform || 'mobile');

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface/80 backdrop-blur-md p-4">
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
                        <h2 className="text-xl font-semibold mb-4 text-center text-on-surface">{t('onboarding.step2_title')}</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Explorer Mode */}
                            <div
                                onClick={() => setSelectedMode('explorer')}
                                className={clsx(
                                    "relative p-6 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-md",
                                    selectedMode === 'explorer'
                                        ? "bg-primary/5 border-primary"
                                        : "bg-surface border-outline-variant/30 hover:bg-surface-variant/30"
                                )}
                            >
                                {selectedMode === 'explorer' && (
                                    <div className="absolute top-4 right-4 text-primary dark:text-primary/80">
                                        <CheckCircle2 size={24} />
                                    </div>
                                )}
                                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary dark:text-primary/80 mb-4">
                                    <Compass size={24} />
                                </div>
                                <h3 className="text-lg font-bold text-on-surface mb-2">{t('onboarding.mode.explorer.title')}</h3>
                                <p className="text-sm text-on-surface-variant/80">
                                    {t('onboarding.mode.explorer.description')}
                                </p>
                            </div>

                            {/* Automator Mode */}
                            <div
                                onClick={() => setSelectedMode('automator')}
                                className={clsx(
                                    "relative p-6 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-md",
                                    selectedMode === 'automator'
                                        ? "bg-primary/5 border-primary"
                                        : "bg-surface border-outline-variant/30 hover:bg-surface-variant/30"
                                )}
                            >
                                {selectedMode === 'automator' && (
                                    <div className="absolute top-4 right-4 text-primary dark:text-primary/80">
                                        <CheckCircle2 size={24} />
                                    </div>
                                )}
                                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary dark:text-primary/80 mb-4">
                                    <Bot size={24} />
                                </div>
                                <h3 className="text-lg font-bold text-on-surface mb-2">{t('onboarding.mode.automator.title')}</h3>
                                <p className="text-sm text-on-surface-variant/80">
                                    {t('onboarding.mode.automator.description')}
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-between mt-8">
                            <Button variant="ghost" onClick={() => setStep(1)}>
                                {t('common.back')}
                            </Button>
                            <Button
                                variant="primary"
                                className="hover:bg-secondary-container"
                                onClick={() => setStep(3)}
                                disabled={!selectedMode}
                            >
                                {t('common.next')}
                            </Button>
                        </div>
                    </motion.div>
                )}

                {step === 3 && (
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
                                <div
                                    onClick={() => setSelectedExplorerPlatform('mobile')}
                                    className={clsx(
                                        "relative p-5 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-md flex flex-col items-center justify-center text-center gap-3",
                                        selectedExplorerPlatform === 'mobile'
                                            ? "bg-primary/5 border-primary"
                                            : "bg-surface border-outline-variant/30 hover:bg-surface-variant/30"
                                    )}
                                >
                                    <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary dark:text-primary/80 mb-2">
                                        <Smartphone size={28} />
                                    </div>
                                    <h3 className="text-lg font-bold text-on-surface">{t('onboarding.platform.mobile.title')}</h3>
                                    <p className="text-sm text-on-surface-variant/80">
                                        {t('onboarding.platform.mobile.description')}
                                    </p>
                                    {selectedExplorerPlatform === 'mobile' && (
                                        <div className="absolute top-4 right-4 text-primary">
                                            <CheckCircle2 size={24} />
                                        </div>
                                    )}
                                </div>

                                {/* Web Platform */}
                                <div
                                    onClick={() => setSelectedExplorerPlatform('web')}
                                    className={clsx(
                                        "relative p-5 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-md flex flex-col items-center justify-center text-center gap-3",
                                        selectedExplorerPlatform === 'web'
                                            ? "bg-primary/5 border-primary"
                                            : "bg-surface border-outline-variant/30 hover:bg-surface-variant/30"
                                    )}
                                >
                                    <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary dark:text-primary/80 mb-2">
                                        <Globe size={28} />
                                    </div>
                                    <h3 className="text-lg font-bold text-on-surface">{t('onboarding.platform.web.title')}</h3>
                                    <p className="text-sm text-on-surface-variant/80">
                                        {t('onboarding.platform.web.description')}
                                    </p>
                                    {selectedExplorerPlatform === 'web' && (
                                        <div className="absolute top-4 right-4 text-primary">
                                            <CheckCircle2 size={24} />
                                        </div>
                                    )}
                                </div>
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
                                        <div
                                            onClick={() => setSelectedFramework('robot')}
                                            className={clsx(
                                                "relative p-4 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-md flex items-center gap-4",
                                                selectedFramework === 'robot'
                                                    ? "bg-primary/5 border-primary"
                                                    : "bg-surface border-outline-variant/30 hover:bg-surface-variant/30"
                                            )}
                                        >
                                            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary dark:text-primary/80 flex-shrink-0">
                                                <Bot size={24} />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="text-base font-bold text-on-surface">{t('onboarding.framework.robot.title')}</h3>
                                                <p className="text-xs text-on-surface-variant/80">
                                                    {t('onboarding.framework.robot.description')}
                                                </p>
                                            </div>
                                            {selectedFramework === 'robot' && (
                                                <div className="text-primary">
                                                    <CheckCircle2 size={24} />
                                                </div>
                                            )}
                                        </div>

                                        {/* Appium Java */}
                                        <div
                                            onClick={() => setSelectedFramework('appium')}
                                            className={clsx(
                                                "relative p-4 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-md flex items-center gap-4",
                                                selectedFramework === 'appium'
                                                    ? "bg-primary/5 border-primary"
                                                    : "bg-surface border-outline-variant/30 hover:bg-surface-variant/30"
                                            )}
                                        >
                                            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary dark:text-primary/80 flex-shrink-0">
                                                <Terminal size={24} />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-base font-bold text-on-surface">{t('onboarding.framework.appium.title')}</h3>
                                                    <Badge variant="info" size="sm" className="font-bold opacity-70">{t('common.beta')}</Badge>
                                                </div>
                                                <p className="text-xs text-on-surface-variant/80">
                                                    {t('onboarding.framework.appium.description')}
                                                </p>
                                            </div>
                                            {selectedFramework === 'appium' && (
                                                <div className="text-primary">
                                                    <CheckCircle2 size={24} />
                                                </div>
                                            )}
                                        </div>

                                        {/* Maestro */}
                                        <div
                                            onClick={() => setSelectedFramework('maestro')}
                                            className={clsx(
                                                "relative p-4 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-md flex items-center gap-4",
                                                selectedFramework === 'maestro'
                                                    ? "bg-primary/5 border-primary"
                                                    : "bg-surface border-outline-variant/30 hover:bg-surface-variant/30"
                                            )}
                                        >
                                            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary dark:text-primary/80 flex-shrink-0">
                                                <Zap size={24} />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-base font-bold text-on-surface">{t('onboarding.framework.maestro.title')}</h3>
                                                    <Badge variant="info" size="sm" className="font-bold opacity-70">{t('common.beta')}</Badge>
                                                </div>
                                                <p className="text-xs text-on-surface-variant/80">
                                                    {t('onboarding.framework.maestro.description')}
                                                </p>
                                            </div>
                                            {selectedFramework === 'maestro' && (
                                                <div className="text-primary">
                                                    <CheckCircle2 size={24} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3 pt-2">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60">
                                        Web Automation Frameworks
                                    </h3>
                                    <div className="grid grid-cols-1 gap-3">
                                        {/* Cypress */}
                                        <div
                                            onClick={() => setSelectedFramework('cypress')}
                                            className={clsx(
                                                "relative p-4 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-md flex items-center gap-4",
                                                selectedFramework === 'cypress'
                                                    ? "bg-primary/5 border-primary"
                                                    : "bg-surface border-outline-variant/30 hover:bg-surface-variant/30"
                                            )}
                                        >
                                            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary dark:text-primary/80 flex-shrink-0">
                                                <Globe size={24} />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="text-base font-bold text-on-surface">{t('onboarding.framework.cypress.title')}</h3>
                                                <p className="text-xs text-on-surface-variant/80">
                                                    {t('onboarding.framework.cypress.description')}
                                                </p>
                                            </div>
                                            {selectedFramework === 'cypress' && (
                                                <div className="text-primary">
                                                    <CheckCircle2 size={24} />
                                                </div>
                                            )}
                                        </div>

                                        {/* Selenium Pytest */}
                                        <div
                                            onClick={() => setSelectedFramework('selenium')}
                                            className={clsx(
                                                "relative p-4 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-md flex items-center gap-4",
                                                selectedFramework === 'selenium'
                                                    ? "bg-primary/5 border-primary"
                                                    : "bg-surface border-outline-variant/30 hover:bg-surface-variant/30"
                                            )}
                                        >
                                            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary dark:text-primary/80 flex-shrink-0">
                                                <Terminal size={24} />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="text-base font-bold text-on-surface">{t('onboarding.framework.selenium.title')}</h3>
                                                <p className="text-xs text-on-surface-variant/80">
                                                    {t('onboarding.framework.selenium.description')}
                                                </p>
                                            </div>
                                            {selectedFramework === 'selenium' && (
                                                <div className="text-primary">
                                                    <CheckCircle2 size={24} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between mt-8">
                            <Button variant="ghost" onClick={() => setStep(2)}>
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
        </div>
    );
}

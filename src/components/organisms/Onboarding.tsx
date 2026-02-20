import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/lib/settings';
import { Button } from '@/components/atoms/Button';
import { Select } from '@/components/atoms/Select';
import { Compass, Bot, CheckCircle2 } from 'lucide-react';
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
        // We might need to ensure updateSetting isn't overwriting itself if called sequentially synchronously in a stale closure. Let's add a small timeout or just call onComplete which will trigger re-renders.
        updateSetting('usageMode', selectedMode);
        updateSetting('language', selectedLanguage);

        // Re-check system versions so missing automation tools warn if they chose automator
        if (selectedMode === 'automator') {
            await checkSystemVersions();
        }

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
                    <h1 className="mt-4 text-3xl font-bold text-on-surface">{t('onboarding.title')}</h1>
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
                                    <div className="absolute top-4 right-4 text-primary">
                                        <CheckCircle2 size={24} />
                                    </div>
                                )}
                                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-4">
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
                                    <div className="absolute top-4 right-4 text-primary">
                                        <CheckCircle2 size={24} />
                                    </div>
                                )}
                                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-4">
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
                                onClick={handleComplete}
                                disabled={!selectedMode}
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

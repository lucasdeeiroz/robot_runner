import { Github, Bot, RefreshCcw, Cpu, Users, Info, User } from "lucide-react";
import { PageHeader } from "@/components/organisms/PageHeader";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import clsx from "clsx";
import packageJson from '../../package.json';
import { useSettings } from "@/lib/settings";
import { Section } from "@/components/organisms/Section";
import { InfoCard } from "@/components/molecules/InfoCard";


const TOOLS = [
    { key: 'tauri', url: 'https://tauri.app' },
    { key: 'react', url: 'https://react.dev' },
    { key: 'rust', url: 'https://www.rust-lang.org' },
    { key: 'vite', url: 'https://vitejs.dev' },
    { key: 'appium', url: 'https://appium.io' },
    { key: 'robot', url: 'https://robotframework.org' },
    { key: 'tailwind', url: 'https://tailwindcss.com' },
    { key: 'lucide', url: 'https://lucide.dev' }
];

export function AboutPage() {
    const { t } = useTranslation();
    const appVersion = packageJson.version;
    const { checkForAppUpdate, updateInfo } = useSettings();
    const [isChecking, setIsChecking] = useState(false);

    // Check global state
    const updateAvailable = updateInfo?.available || false;

    const handleCheckUpdate = async () => {
        if (isChecking) return;
        setIsChecking(true);
        try {
            await checkForAppUpdate(true); // Manual check
        } finally {
            setIsChecking(false);
        }
    };

    return (
        <div className="space-y-4 pb-12">


            <PageHeader
                title={t('sidebar.about')}
                description={t('sidebar.description_about')}
                icon={Info}
                iconSize="xl"
            />

            <div className="grid gap-6">
                {/* Main Info Card */}
                <div className="bg-surface border border-outline-variant/30 rounded-xl p-8 flex flex-col items-center text-center shadow-sm">
                    <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-primary/10">
                        <Bot size={40} className="text-primary" />
                    </div>

                    <h2 className="text-2xl font-bold text-on-surface/80 mb-2">
                        Robot Runner
                    </h2>
                    <div className="inline-flex items-center gap-2 pl-3 pr-1.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
                        <span>v{appVersion}</span>
                        <div className="w-px h-3 bg-primary/20 mx-0.5" />
                        <button
                            onClick={handleCheckUpdate}
                            disabled={isChecking}
                            title={isChecking ? t('about.checking') : t('about.update_check')}
                            className="p-1 rounded-full hover:bg-primary/10 text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <RefreshCcw size={13} className={clsx({ "animate-spin": isChecking })} />
                        </button>

                        {updateAvailable && (
                            <a
                                href="https://github.com/lucasdeeiroz/robot_runner/releases/latest"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 text-[10px] bg-primary text-on-primary px-2 py-0.5 rounded-full font-bold hover:bg-primary/90 transition-colors animate-pulse no-underline"
                            >
                                {t('about.update_badge')}
                            </a>
                        )}
                    </div>
                    <p className="mt-6 text-on-surface-variant/80 max-w-lg mx-auto leading-relaxed">
                        {t('about.long_description')}
                    </p>
                </div>

                {/* Content Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Tools & Tech (Now Left/Top) */}
                    <Section
                        title={t('about.tools_title')}
                        icon={Cpu}
                        description={t('about.tools_desc')}
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {TOOLS.map(tool => (
                                <InfoCard
                                    key={tool.key}
                                    title={t(`about.tools_list.${tool.key}.name` as any)}
                                    href={tool.url}
                                    headerRight={<span className="text-on-surface/80">↗</span>}
                                >
                                    {t(`about.tools_list.${tool.key}.desc` as any)}
                                </InfoCard>
                            ))}
                        </div>
                    </Section>

                    {/* Legal & License (Now Right/Top) */}
                    <Section
                        title={t('about.legal_title')}
                        icon={Github}
                        className="flex flex-col"
                    >
                        <div className="space-y-4 flex-1">
                            <div className="p-4 bg-surface/50 rounded-lg border border-outline-variant/30">
                                <div className="font-medium text-on-surface/80 mb-1 flex items-center gap-2">
                                    {t('about.license')}
                                    <span className="text-[10px] uppercase font-bold bg-success-container text-on-success-container px-1.5 py-0.5 rounded border border-success-container/20">Open Source</span>
                                </div>
                                <p className="text-sm text-on-surface-variant/80 leading-relaxed">
                                    {t('about.license_desc')}
                                </p>
                            </div>

                            <p className="text-xs text-on-surface-variant/80 text-center italic mt-4">
                                {t('about.disclaimer')}
                            </p>
                        </div>

                        <div className="flex justify-center pt-6 text-on-surface-variant/80 text-sm gap-6 mt-auto">
                            <a href="https://github.com/lucasdeeiroz/robot_runner" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors flex items-center gap-2">
                                <Github size={16} /> Repository
                            </a>
                        </div>
                    </Section>

                    {/* Credits (Now Bottom Full Width) */}
                    <Section
                        title={t('about.developed_by')}
                        icon={Users}
                        className="md:col-span-2"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <InfoCard
                                title="Lucas de Eiroz Rodrigues"
                                href="https://github.com/lucasdeeiroz"
                                headerRight={<span>↗</span>}
                                icon={
                                    <div className="w-12 h-12 bg-surface-variant/30 rounded-full flex items-center justify-center text-on-surface-variant/80">
                                        <User size={24} />
                                    </div>
                                }
                            >
                                {t('about.lead')}
                            </InfoCard>
                            <InfoCard
                                title="Alessandra Gomes de Almeida"
                                href="https://github.com/alealmeida31"
                                headerRight={<span>↗</span>}
                                icon={
                                    <div className="w-12 h-12 bg-surface-variant/30 rounded-full flex items-center justify-center text-on-surface-variant/80">
                                        <User size={24} />
                                    </div>
                                }
                            >
                                {t('about.collaborator')}
                            </InfoCard>
                        </div>
                    </Section>
                </div>
            </div>
        </div >
    );
}

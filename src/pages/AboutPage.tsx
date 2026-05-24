import { Scale, GitBranch, Bot, RefreshCcw, Cpu, Users, Info, User } from "lucide-react";
import { PageHeader } from "@/components/organisms/PageHeader";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import packageJson from '../../package.json';
import { useSettings } from "@/lib/settings";
import { Button } from "@/components/atoms/Button";
import { Select } from "@/components/atoms/Select";
import { Section } from "@/components/organisms/Section";
import { InfoCard } from "@/components/molecules/InfoCard";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";
import { UpdateModal } from "@/components/organisms/UpdateModal";
import ReactMarkdown from 'react-markdown';


const TOOLS = [
    { key: 'tauri', url: 'https://tauri.app' },
    { key: 'react', url: 'https://react.dev' },
    { key: 'rust', url: 'https://www.rust-lang.org' },
    { key: 'vite', url: 'https://vitejs.dev' },
    { key: 'appium', url: 'https://appium.io' },
    { key: 'robot', url: 'https://robotframework.org' },
    { key: 'maestro', url: 'https://maestro.mobile.dev' },
    { key: 'maven', url: 'https://maven.apache.org' },
    { key: 'tailwind', url: 'https://tailwindcss.com' },
    { key: 'lucide', url: 'https://lucide.dev' }
];

interface AboutPageProps {
    onNavigate?: (page: string) => void;
}

type UpdateChannel = 'stable' | 'beta' | 'alpha';

export function AboutPage({ onNavigate: _onNavigate }: AboutPageProps) {
    const { t } = useTranslation();
    const appVersion = packageJson.version;
    const { checkForAppUpdate, updateInfo, settings, updateSetting } = useSettings();
    const [isChecking, setIsChecking] = useState(false);
    const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

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

    const [clickCount, setClickCount] = useState(0);
    const handleTitleClick = () => {
        const newCount = clickCount + 1;
        setClickCount(newCount);
        if (newCount >= 5) {
            updateSetting('presentationEnabled', true);
            setClickCount(0);
        }
    };

    return (
        <div className="h-full flex flex-col gap-4 overflow-hidden">
            <PageHeader
                title={t('sidebar.about')}
                description={t('sidebar.description_about')}
                icon={Info}
                iconSize="xl"
            />

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                <div className="grid gap-6">
                    {/* Main Info Card */}
                    <div className="bg-surface border border-outline-variant/30 rounded-2xl p-8 flex flex-col items-center text-center shadow-sm">
                        <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-primary/10">
                            <Bot size={40} className="text-primary" />
                        </div>

                        <h2 
                            className="text-2xl font-bold text-on-surface/80 mb-2 select-none cursor-default"
                            onClick={handleTitleClick}
                        >
                            Robot Runner
                        </h2>
                        <p className="mt-6 text-on-surface-variant/80 max-w-lg mx-auto leading-relaxed">
                            {t('about.long_description')}
                        </p>
                        <div className="mt-6 inline-flex items-center gap-2 pl-3 pr-1.5 py-1 rounded-2xl bg-primary/10 border border-primary/20 text-primary dark:text-primary/80 text-sm font-medium">

                            <div className="flex items-center gap-2 bg-surface-variant/20 px-3 py-1.5 rounded-2xl border border-outline-variant/30 w-max mr-2">
                                <span className="text-xs text-on-surface-variant font-medium whitespace-nowrap">{t('about.update_channel')}:</span>
                                <div className="w-28">
                                    <Select
                                        value={settings.updateChannel || 'stable'}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            if (value === 'stable' || value === 'beta' || value === 'alpha') {
                                                updateSetting('updateChannel', value as UpdateChannel);
                                            }
                                        }}
                                        containerClassName="!space-y-0"
                                        className="!py-1 !px-2 !min-h-0 bg-transparent border-none shadow-none focus:ring-0 text-xs font-medium"
                                        options={[
                                            { value: 'stable', label: t('about.channel_stable') },
                                            { value: 'beta', label: t('about.channel_beta') },
                                            { value: 'alpha', label: t('about.channel_alpha') }
                                        ]}
                                    />
                                </div>
                            </div>
                            <span>v{appVersion}</span>
                            <div className="w-px h-3 bg-primary/20 mx-0.5" />
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCheckUpdate}
                                disabled={isChecking}
                                title={isChecking ? t('about.checking') : t('about.update_check')}
                                className="p-1 h-auto rounded-2xl hover:bg-primary/10 text-primary dark:text-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isChecking ? (
                                    <ExpressiveLoading size="xsm" variant="circular" />
                                ) : (
                                    <RefreshCcw size={13} />
                                )}
                            </Button>

                            {updateAvailable && (
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => setIsUpdateModalOpen(true)}
                                    className="ml-2 h-6 px-2 py-0 text-[10px] rounded-2xl font-bold animate-pulse"
                                >
                                    {t('about.update_badge')}
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Content Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

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
                            icon={Scale}
                        >
                            <div className="space-y-4">
                                <div className="p-4 bg-surface/50 rounded-2xl border border-outline-variant/30">
                                    <div className="font-medium text-on-surface/80 mb-3 flex items-center gap-2 shrink-0">
                                        {t('about.license')}
                                        <span className="text-[10px] uppercase font-bold bg-success-container text-on-success-container px-1.5 py-0.5 rounded border border-success-container/20">Non-Commercial</span>
                                    </div>
                                    <div className="max-h-91.5 overflow-y-auto custom-scrollbar pr-2">
                                        <div className="text-sm text-on-surface-variant/80 leading-relaxed">
                                            <ReactMarkdown
                                                components={{
                                                    p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                                                    strong: ({ children }) => <strong className="font-bold text-on-surface/90">{children}</strong>,
                                                    ul: ({ children }) => <ul className="space-y-0.5 mb-2">{children}</ul>,
                                                    li: ({ children }) => <li className="ml-4 list-disc mb-1 last:mb-0">{children}</li>,
                                                    h1: ({ children }) => <h1 className="text-lg font-bold text-on-surface mb-2 mt-4 first:mt-0">{children}</h1>,
                                                    h2: ({ children }) => <h2 className="text-md font-bold text-on-surface mb-2 mt-3 first:mt-0">{children}</h2>
                                                }}
                                            >
                                                {t('about.license_desc')}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                </div>

                                <p className="text-xs text-on-surface-variant/80 text-center italic mt-4">
                                    {t('about.disclaimer')}
                                </p>
                            </div>

                            <div className="flex justify-center pt-6 text-on-surface-variant/80 text-sm gap-6 mt-auto">
                                <a href="https://github.com/lucasdeeiroz/robot_runner" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors flex items-center gap-2">
                                    <GitBranch size={16} /> {t('about.github_repo')}
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
                                        <div className="w-12 h-12 bg-surface-variant/30 rounded-2xl flex items-center justify-center text-on-surface-variant/80">
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
                                        <div className="w-12 h-12 bg-surface-variant/30 rounded-2xl flex items-center justify-center text-on-surface-variant/80">
                                            <User size={24} />
                                        </div>
                                    }
                                >
                                    {t('about.dev_collaborator')}
                                </InfoCard>
                                <InfoCard
                                    title="Sarah Shelly Da Silva Farias"
                                    href="https://github.com/sarahssf"
                                    headerRight={<span>↗</span>}
                                    icon={
                                        <div className="w-12 h-12 bg-surface-variant/30 rounded-2xl flex items-center justify-center text-on-surface-variant/80">
                                            <User size={24} />
                                        </div>
                                    }
                                >
                                    {t('about.qa_collaborator')}
                                </InfoCard>
                                <InfoCard
                                    title="Abel Freire de Andrade"
                                    href="https://github.com/abelandrad"
                                    headerRight={<span>↗</span>}
                                    icon={
                                        <div className="w-12 h-12 bg-surface-variant/30 rounded-2xl flex items-center justify-center text-on-surface-variant/80">
                                            <User size={24} />
                                        </div>
                                    }
                                >
                                    {t('about.qa_collaborator')}
                                </InfoCard>
                            </div>
                        </Section>
                    </div>
                </div>
            </div>
            <UpdateModal
                isOpen={isUpdateModalOpen}
                onClose={() => setIsUpdateModalOpen(false)}
                assets={updateInfo?.assets || []}
                latestVersion={updateInfo?.latestVersion || ''}
            />
        </div>
    );
}

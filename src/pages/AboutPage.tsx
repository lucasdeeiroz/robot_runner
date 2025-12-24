import { Github, Bot } from "lucide-react";
import { useTranslation } from "react-i18next";


export function AboutPage() {
    const { t } = useTranslation();
    const appVersion = "2.0.3";

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-12">
            <div>
                <h1 className="text-3xl font-bold mb-2">{t('sidebar.about')}</h1>
                <p className="text-zinc-400">{t('about.description')}</p>
            </div>

            <div className="grid gap-6">
                {/* Main Info Card */}
                <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 flex flex-col items-center text-center shadow-sm">
                    <div className="w-20 h-20 bg-primary rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-primary/20 dark:shadow-blue-900/20">
                        <Bot size={40} className="text-white" />
                    </div>

                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        Robot Runner
                    </h2>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
                        v{appVersion}
                    </div>
                    <p className="mt-6 text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto leading-relaxed">
                        {t('about.long_description')}
                    </p>
                </div>

                {/* Credits */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <section className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                            {t('about.developed_by')}
                        </h3>
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-xl">
                                    👨‍💻
                                </div>
                                <div>
                                    <div className="font-medium text-gray-900 dark:text-white">Lucas de Eiroz</div>
                                    <div className="text-sm text-zinc-500">{t('about.lead')}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-xl">
                                    👩‍💻
                                </div>
                                <div>
                                    <div className="font-medium text-gray-900 dark:text-white">Alessandra Gomes de Almeida</div>
                                    <div className="text-sm text-zinc-500">{t('about.collaborator')}</div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                            {t('about.powered_by')}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {['Tauri', 'React', 'Rust', 'Vite', 'Appium', 'Robot Framework'].map(tech => (
                                <span key={tech} className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                                    {tech}
                                </span>
                            ))}
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="flex justify-center pt-8 text-zinc-500 text-sm gap-6">
                    <a href="https://github.com/lucasdeeiroz" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-2">
                        <Github size={16} /> GitHub
                    </a>
                </div>
            </div>
        </div >
    );
}

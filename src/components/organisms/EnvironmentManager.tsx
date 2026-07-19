import { useState, useEffect, useRef } from "react";
import { useSettings } from "@/lib/settings";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/atoms/Button";
import { X, Terminal, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { createPortal } from "react-dom";
import { feedback } from "@/lib/feedback";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";

interface EnvStatus {
    has_requirements: boolean;
    requirements_files: string[];
    has_venv: boolean;
    venv_path?: string;
}

interface EnvInstallEvent {
    type: string; // "stdout", "stderr", "exit", "error"
    data: string;
}

export function EnvironmentManager() {
    const { settings, loading } = useSettings();
    const { t } = useTranslation();
    const [showModal, setShowModal] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [logs, setLogs] = useState<{ type: string; data: string }[]>([]);
    const [status, setStatus] = useState<EnvStatus | null>(null);
    const [setupFinished, setSetupFinished] = useState(false);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll logs
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs]);

    useEffect(() => {
        if (loading || !settings.paths.automationRoot) return;

        const checkEnv = async () => {
            console.log("[EnvManager] Checking environment for path:", settings.paths.automationRoot);
            try {
                const result = await invoke<EnvStatus>("check_environment", {
                    projectPath: settings.paths.automationRoot
                });
                
                console.log("[EnvManager] Check result:", result);
                setStatus(result);
                
                if (result.has_requirements && !result.has_venv) {
                    setShowModal(true);
                    setSetupFinished(false);
                }
            } catch (e) {
                console.error("[EnvManager] Environment check failed:", e);
            }
        };

        checkEnv();
    }, [settings.paths.automationRoot, loading]);

    useEffect(() => {
        const unlisten = listen<EnvInstallEvent>("env-install-log", (event) => {
            setLogs(prev => [...prev, event.payload]);
        });
        return () => {
            unlisten.then(f => f());
        };
    }, []);

    useEffect(() => {
        const handleOpen = () => {
            setShowModal(true);
            setSetupFinished(false);
            setLogs([]);
        };
        window.addEventListener("open-env-manager", handleOpen);
        return () => window.removeEventListener("open-env-manager", handleOpen);
    }, []);

    const handleInstall = async () => {
        if (!status || status.requirements_files.length === 0) return;
        
        setInstalling(true);
        setLogs([]);
        setSetupFinished(false);
        try {
            if (!status.has_venv) {
                setLogs(prev => [...prev, { type: "stdout", data: "Creating virtual environment..." }]);
                await invoke("create_venv", { projectPath: settings.paths.automationRoot });
            }

            // For simplicity, pick the first requirements file found
            const reqFile = status.requirements_files[0];
            
            await invoke("install_requirements", { 
                projectPath: settings.paths.automationRoot,
                requirementsFile: reqFile
            });
            
            setSetupFinished(true);
            feedback.toast.success(t("env_setup.success", "Environment setup completed successfully."));
        } catch (e: any) {
            feedback.toast.error(t("env_setup.failed", "Environment Setup Failed"), e);
            setLogs(prev => [...prev, { type: "error", data: `Error: ${e}` }]);
        } finally {
            setInstalling(false);
        }
    };

    if (!showModal) return null;

    return createPortal(
        <AnimatePresence>
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
                        onClick={() => !installing && setShowModal(false)} 
                    />
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-surface border border-outline-variant/30 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden relative flex flex-col max-h-[85vh]"
                    >
                        <div className="flex items-center justify-between p-4 border-b border-outline-variant/10 bg-surface-variant/20">
                            <h3 className="text-sm font-bold flex items-center gap-2">
                                <Terminal size={18} className="text-primary" />
                                {t("env_setup.title", "Environment Setup")}
                            </h3>
                            {!installing && (
                                <Button variant="ghost" size="icon" onClick={() => setShowModal(false)} className="rounded-full">
                                    <X size={18} />
                                </Button>
                            )}
                        </div>

                        <div className="p-6 flex flex-col gap-4 overflow-y-auto">
                            {!installing && !setupFinished && logs.length === 0 && (
                                <div className="flex flex-col gap-2 items-center text-center py-4">
                                    <AlertTriangle size={48} className="text-warning mb-2" />
                                    <h4 className="font-bold text-lg">{t("env_setup.missing_venv", "Virtual Environment Missing")}</h4>
                                    <p className="text-on-surface-variant/80 text-sm">
                                        {t("env_setup.prompt_desc", "We detected requirements files in your project but no isolated virtual environment (.venv). Would you like to create one and install dependencies?")}
                                    </p>
                                    <div className="flex gap-2 mt-4 w-full">
                                        <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>
                                            {t("common.skip", "Skip")}
                                        </Button>
                                        <Button variant="primary" className="flex-1 font-bold" onClick={handleInstall}>
                                            {t("env_setup.install", "Create & Install")}
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {(installing || logs.length > 0) && (
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-on-surface-variant">{t("env_setup.logs", "Installation Logs")}</span>
                                        {installing && <Loader2 size={14} className="animate-spin text-primary" />}
                                        {setupFinished && <CheckCircle2 size={14} className="text-success" />}
                                    </div>
                                    <div className="bg-[#1e1e1e] rounded-xl p-4 overflow-y-auto h-64 font-mono text-[11px] text-gray-300 leading-relaxed shadow-inner">
                                        {logs.map((log, i) => (
                                            <div key={i} className={clsx(
                                                "whitespace-pre-wrap break-all",
                                                log.type === "stderr" ? "text-red-400" : 
                                                log.type === "error" ? "text-red-500 font-bold" : 
                                                log.type === "exit" ? "text-green-400 font-bold mt-2" : ""
                                            )}>
                                                {log.data}
                                            </div>
                                        ))}
                                        <div ref={logsEndRef} />
                                    </div>
                                </div>
                            )}
                            
                            {setupFinished && (
                                <Button variant="primary" className="w-full mt-2 font-bold" onClick={() => setShowModal(false)}>
                                    {t("common.done", "Done")}
                                </Button>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, FolderOpen, FileText, FileCode, History } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { useTestSessions } from "@/lib/testSessionStore";
import { Device } from "@/lib/types";
import { FileExplorer } from "@/components/common/FileExplorer";
import { v4 as uuidv4 } from 'uuid';
import clsx from "clsx";
import { useTranslation } from "react-i18next";

interface TestsSubTabProps {
    selectedDevices: string[];
    devices: Device[]; // New prop
    onNavigate?: (page: string) => void;
}

interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
}

type SelectionMode = 'file' | 'folder' | 'args';

export function TestsSubTab({ selectedDevices, devices, onNavigate }: TestsSubTabProps) {
    const { t } = useTranslation();
    const [mode, setMode] = useState<SelectionMode>('file');
    const [selectedPath, setSelectedPath] = useState<string>("");
    const [launchStatus, setLaunchStatus] = useState<string>("");
    const [isLaunching, setIsLaunching] = useState(false);
    const [dontOverwrite, setDontOverwrite] = useState(false);

    // Responsive State
    const containerRef = useRef<HTMLDivElement>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setIsNarrow(entry.contentRect.width < 660);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const { settings } = useSettings();
    const { addSession, sessions } = useTestSessions();

    const handleRun = async (pathOverride?: string) => {
        const targetPath = typeof pathOverride === 'string' ? pathOverride : selectedPath;
        if (!targetPath) return;

        // Check for busy devices
        const busyDeviceIds = sessions.filter(s => s.status === 'running' && s.type === 'test').map(s => s.deviceUdid);
        const conflictingDevices = selectedDevices.filter(d => busyDeviceIds.includes(d));

        if (conflictingDevices.length > 0) {
            alert(t('tests.alerts.busy', { devices: conflictingDevices.join('\n') }));
            return;
        }

        setIsLaunching(true);
        setLaunchStatus(t('tests.status.checking'));

        try {
            // 1. Check/Start Appium
            const status = await invoke<{ running: boolean }>('get_appium_status');
            if (!status.running) {
                setLaunchStatus(t('tests.status.starting'));
                await invoke('start_appium_server', {
                    host: settings.appiumHost,
                    port: settings.appiumPort,
                    args: settings.tools.appiumArgs
                });

                let basePath = "";
                const argsLower = settings.tools.appiumArgs.toLowerCase();
                const basePathMatch = argsLower.match(/--base-path[=\s]([^\s]+)/);

                if (basePathMatch) {
                    basePath = basePathMatch[1]; // e.g. /wd/hub
                } else if (settings.tools.appiumArgs.includes("/wd/hub")) {
                    // Fallback loose check if they just typed it without full arg (unlikely but safe)
                    basePath = "/wd/hub";
                }

                // Remove trailing slash if user added it
                if (basePath.endsWith('/')) basePath = basePath.slice(0, -1);

                const statusPath = `${basePath}/status`;
                const baseUrl = `http://${settings.appiumHost}:${settings.appiumPort}${statusPath}`;

                for (let i = 0; i < 20; i++) {
                    try {
                        const controller = new AbortController();
                        const id = setTimeout(() => controller.abort(), 1000);
                        const response = await fetch(baseUrl + `?t=${Date.now()}`, { signal: controller.signal, cache: 'no-store' });
                        clearTimeout(id);
                        if (response.ok || response.status === 304) break;
                    } catch (e) { }
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

            setLaunchStatus(t('tests.status.launching'));

            // 2. Launch Tests
            const targets = selectedDevices.length > 0 ? selectedDevices : [null];
            // const { devices } = useDeviceStore.getState(); // Removed


            for (const deviceUdid of targets) {
                const runId = uuidv4();

                // Find device info
                const deviceObj = devices.find((d: Device) => d.udid === deviceUdid);
                const devModel = deviceObj ? deviceObj.model.replace(/\s+/g, '') : "UnknownModel";
                const devVer = deviceObj ? deviceObj.android_version || "0" : "0";

                // Avoid duplicate UDID if model already contains it
                let devName = deviceObj?.model || "Device";
                if (deviceUdid && deviceUdid !== 'local') {
                    const ver = deviceObj?.android_version ? `Android ${deviceObj.android_version}` : deviceUdid;
                    devName = `${devName} (${ver})`;
                } else {
                    devName = "Local/Web";
                }

                // Prepare Args
                let testPathArg: string | null = null;
                let argFileArg: string | null = null;

                if (mode === 'file' || mode === 'folder') {
                    testPathArg = targetPath;
                } else if (mode === 'args') {
                    argFileArg = targetPath;
                }

                addSession(runId, deviceUdid || "local", devName, testPathArg || argFileArg || "Unknown", argFileArg, devModel, devVer);

                // Extract Suite Name from path
                let suiteName = "UnknownSuite";
                if (testPathArg) {
                    // C:/Users/xyz/Tests/MySuite.robot -> MySuite
                    const parts = testPathArg.split(/[\\/]/);
                    const file = parts[parts.length - 1];
                    suiteName = file.split('.')[0];
                } else if (argFileArg) {
                    const parts = argFileArg.split(/[\\/]/);
                    suiteName = parts[parts.length - 1].split('.')[0];
                }

                // Clean strings
                const cleanModel = devModel.replace(/[^a-zA-Z0-9]/g, "");
                const cleanVer = devVer.replace(/[^0-9.]/g, "");
                const cleanUdid = deviceUdid ? deviceUdid.replace(/[^a-zA-Z0-9]/g, "") : "Local";
                const cleanSuite = suiteName.replace(/[^a-zA-Z0-9_-]/g, "");

                const legacyFolder = `A${cleanVer}_${cleanModel}_${cleanUdid}/${cleanSuite}`;

                const logDir = settings.paths.logs
                    ? `${settings.paths.logs}/${legacyFolder}`
                    : `../test_results/${legacyFolder}`;

                let workingDir = null;
                if (mode === 'args' && settings.paths.automationRoot) {
                    workingDir = settings.paths.automationRoot;
                }

                invoke("run_robot_test", {
                    runId,
                    testPath: testPathArg, // Now optional
                    outputDir: logDir,
                    device: deviceUdid === 'Start local Server' ? null : deviceUdid,
                    argumentsFile: argFileArg,
                    timestampOutputs: dontOverwrite,
                    workingDir
                }).catch(e => {
                    console.error("Launch failed", e);
                });
            }

            // 3. Redirect
            setLaunchStatus(t('tests.status.redirecting'));
            setTimeout(() => {
                if (onNavigate) onNavigate('tests');
                setIsLaunching(false);
                setLaunchStatus("");
            }, 500);

        } catch (e: any) {
            console.error(e);
            let errStr = String(e);
            if (errStr.includes("Error:")) errStr = errStr.replace("Error:", "").trim();
            setLaunchStatus(`${t('tests.status.failed')}: ${errStr}`);
            setIsLaunching(false);
        }
    };

    const getInitialPath = () => {
        if (mode === 'args') return settings.paths.suites;
        return settings.paths.tests || ".";
    };

    return (
        <div ref={containerRef} className="h-full flex flex-col gap-4 p-4 w-full overflow-y-auto">
            {/* Main Content Area: Explorer + Side Menu */}
            <div className="flex-1 min-h-0 flex gap-4">
                {/* Embedded File Explorer */}
                <div className="flex-1 border border-zinc-200 dark:border-zinc-700 rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-zinc-900/50">
                    <FileExplorer
                        initialPath={getInitialPath()}
                        selectionMode={mode === 'folder' ? 'directory' : 'file'}
                        allowHideFooter={true}
                        onCancel={() => { }} // Not used in embedded mode
                        onSelect={(path) => {
                            if (mode !== 'folder') {
                                handleRun(path);
                            }
                        }}
                        onSelectionChange={(entry: FileEntry | null) => {
                            if (entry) {
                                if (mode === 'folder') {
                                    if (entry.is_dir) setSelectedPath(entry.path);
                                    else setSelectedPath("");
                                } else {
                                    if (!entry.is_dir) {
                                        if (mode === 'file' && !entry.name.endsWith('.robot')) {
                                            setSelectedPath("");
                                        } else if (mode === 'args' && !(entry.name.endsWith('.txt') || entry.name.endsWith('.args'))) {
                                            setSelectedPath("");
                                        } else {
                                            setSelectedPath(entry.path);
                                        }
                                    } else {
                                        setSelectedPath("");
                                    }
                                }
                            } else {
                                setSelectedPath("");
                            }
                        }}
                    />
                </div>

                {/* Vertical Sidebar: Mode Selection + Run Controls */}
                <div className={clsx(
                    "flex flex-col gap-6 shrink-0 h-full transition-all duration-300",
                    isNarrow ? "w-fit" : "w-[200px]"
                )}>
                    {/* Mode Selection */}
                    <div className="flex flex-col gap-2 bg-zinc-100 dark:bg-zinc-800 p-1.5 rounded-xl shadow-sm">
                        <ModeButton active={mode === 'file'} onClick={() => { setMode('file'); setSelectedPath(""); }} icon={<FileCode size={18} />} label={t('tests.mode.file')} hideText={isNarrow} />
                        <ModeButton active={mode === 'folder'} onClick={() => { setMode('folder'); setSelectedPath(""); }} icon={<FolderOpen size={18} />} label={t('tests.mode.folder')} hideText={isNarrow} />
                        <ModeButton active={mode === 'args'} onClick={() => { setMode('args'); setSelectedPath(""); }} icon={<FileText size={18} />} label={t('tests.mode.args')} hideText={isNarrow} />
                    </div>

                    <div className="flex-1" /> {/* Spacer */}

                    {/* Run Controls */}
                    <div className="flex flex-col gap-4">
                        <button
                            onClick={() => setDontOverwrite(!dontOverwrite)}
                            className={clsx(
                                "flex items-center gap-2 px-4 py-3 rounded-xl transition-all duration-200 border shadow-sm select-none",
                                dontOverwrite
                                    ? "bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100"
                                    : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-600"
                            )}
                            title={t('tests.options.dont_overwrite', "Não sobrescrever logs")}
                        >
                            <History size={18} className={clsx(dontOverwrite ? "text-amber-600 dark:text-amber-400" : "text-current")} />
                            {!isNarrow && <span className="text-sm font-medium">{t('tests.options.dont_overwrite', "Não sobrescrever logs")}</span>}
                        </button>

                        <button
                            onClick={() => handleRun()}
                            disabled={!selectedPath || isLaunching}
                            title={mode === 'folder' ? t('tests.run_all') : t('tests.run_selected')}
                            className={clsx(
                                !selectedPath || isLaunching
                                    ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed shadow-none"
                                    : "bg-primary hover:opacity-90 text-white active:scale-[0.98]",
                                "w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20"
                            )}
                        >
                            {isLaunching ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    {launchStatus}
                                </>
                            ) : (
                                <>
                                    <Play size={18} fill="currentColor" />
                                    {!isNarrow && (
                                        <span>
                                            {mode === 'folder' ? t('tests.run_all') : t('tests.run_selected')}
                                        </span>
                                    )}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>


    );
}

function ModeButton({ active, onClick, icon, label, hideText }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, hideText?: boolean }) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
                active
                    ? "bg-white dark:bg-zinc-700 text-primary shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
            title={label}
        >
            {icon}
            {!hideText && <span>{label}</span>}
        </button>
    );
}

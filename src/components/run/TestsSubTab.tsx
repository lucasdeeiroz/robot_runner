import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, FolderOpen, FileText, FileCode } from "lucide-react";
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

    const { settings } = useSettings();
    const { addSession, sessions } = useTestSessions();

    const handleRun = async () => {
        if (!selectedPath) return;

        // Check for busy devices
        const busyDeviceIds = sessions.filter(s => s.status === 'running').map(s => s.deviceUdid);
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

                // Poll for readiness
                const baseUrl = `http://${settings.appiumHost}:${settings.appiumPort}/wd/hub/status`;
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
                    testPathArg = selectedPath;
                } else if (mode === 'args') {
                    argFileArg = selectedPath;
                }

                addSession(runId, deviceUdid || "local", devName, testPathArg || argFileArg || "Unknown", argFileArg, devModel, devVer);

                // Construct Legacy Path: {base}/A{ver}_{model}_{udid}/{runId}/
                // Actually user said: {logs_folder}/A{AndroidVersion}_{ModelName}_{DeviceUdid}/{SuiteName}/
                // We rely on backend to append SuiteName if passed, but testPathArg implies suite.
                // However, `outputDir` in robot is where validation output goes.
                // If we want {SuiteName} as subfolder, we should append it here or let Robot do it?
                // Robot -d puts report IN that dir.
                // So we should construct: base/A{ver}_{model}_{udid}/{SuiteName}

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

                // Determine Working Directory for Argument Files
                // User requirement: When select arg file, execute from automationRoot if set.
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

        } catch (e) {
            console.error(e);
            setLaunchStatus(`${t('tests.status.failed')}: ${e}`);
            setIsLaunching(false);
        }
    };

    const getInitialPath = () => {
        if (mode === 'args') return settings.paths.suites;
        return settings.paths.tests || ".";
    };

    return (
        <div className="h-full flex flex-col gap-6 p-6 max-w-4xl mx-auto w-full">
            {/* Mode Selection */}
            <div className="flex justify-center bg-zinc-100 dark:bg-zinc-800 p-1.5 rounded-xl shrink-0 self-center shadow-sm">
                <ModeButton active={mode === 'file'} onClick={() => { setMode('file'); setSelectedPath(""); }} icon={<FileCode size={18} />} label={t('tests.mode.file')} />
                <ModeButton active={mode === 'folder'} onClick={() => { setMode('folder'); setSelectedPath(""); }} icon={<FolderOpen size={18} />} label={t('tests.mode.folder')} />
                <ModeButton active={mode === 'args'} onClick={() => { setMode('args'); setSelectedPath(""); }} icon={<FileText size={18} />} label={t('tests.mode.args')} />
            </div>

            {/* Embedded File Explorer */}
            <div className="flex-1 min-h-[400px] border border-zinc-200 dark:border-zinc-700 rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-zinc-900/50">
                <FileExplorer
                    initialPath={getInitialPath()}
                    selectionMode={mode === 'folder' ? 'directory' : 'file'}
                    allowHideFooter={true}
                    onCancel={() => { }} // Not used in embedded mode
                    onSelect={() => { }} // Not actually used as we track via selectionChange
                    onSelectionChange={(entry: FileEntry | null) => {
                        if (entry) {
                            if (mode === 'folder') {
                                // For folder mode, if they click a folder, that IS the selection?
                                // Or do they enter it?
                                // Usually if you click it, it highlights.
                                // If I click a folder in explorer, I select it.
                                // Double click enters it.
                                if (entry.is_dir) setSelectedPath(entry.path);
                                else setSelectedPath(""); // Can't select file in folder mode
                            } else {
                                // File mode
                                if (!entry.is_dir) {
                                    // Check extension?
                                    if (mode === 'file' && !entry.name.endsWith('.robot')) {
                                        setSelectedPath("");
                                    } else if (mode === 'args' && !(entry.name.endsWith('.txt') || entry.name.endsWith('.args'))) {
                                        setSelectedPath("");
                                    } else {
                                        setSelectedPath(entry.path);
                                    }
                                } else {
                                    // Clicking folder in file mode -> don't select it as target
                                    // But maybe we want to select it to navigate?
                                    // Navigation is handled by double-click in FileExplorer.
                                    setSelectedPath("");
                                }
                            }
                        } else {
                            setSelectedPath("");
                        }
                    }}
                />
            </div>

            {/* Run Button Area */}
            <div className="shrink-0 flex items-center gap-4 bg-white dark:bg-zinc-900/50 p-4 border border-zinc-200 dark:border-zinc-700 rounded-xl">
                <div className="flex-1 min-w-0 flex items-center">
                    <label className="flex items-center gap-2 cursor-pointer select-none group">
                        <div className={clsx(
                            "w-5 h-5 rounded border flex items-center justify-center transition-colors shadow-sm",
                            dontOverwrite
                                ? "bg-blue-600 border-blue-600 text-white"
                                : "bg-zinc-50 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 group-hover:border-blue-400"
                        )}>
                            {dontOverwrite && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
                        </div>
                        <input
                            type="checkbox"
                            checked={dontOverwrite}
                            onChange={(e) => setDontOverwrite(e.target.checked)}
                            className="hidden"
                        />
                        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">
                            {t('tests.options.dont_overwrite', "Não sobrescrever logs")}
                        </span>
                    </label>
                </div>
                <button
                    onClick={handleRun}
                    disabled={!selectedPath || isLaunching}
                    className={clsx(
                        "px-8 py-3 rounded-lg font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20",
                        !selectedPath || isLaunching
                            ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed shadow-none"
                            : "bg-blue-600 hover:bg-blue-500 text-white active:scale-[0.98]"
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
                            {mode === 'folder' ? t('tests.run_all') : t('tests.run_selected')}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

function ModeButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
                active
                    ? "bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-400 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}
// END OF UPDATED COMPONENT

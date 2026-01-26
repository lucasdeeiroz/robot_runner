import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, FolderOpen, FileText, FileCode, History } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { useTestSessions } from "@/lib/testSessionStore";
import { Device } from "@/lib/types";
import { FileExplorer } from "@/components/organisms/FileExplorer";
import { v4 as uuidv4 } from 'uuid';
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { TabBar } from "@/components/organisms/TabBar";
import { WarningModal } from "@/components/organisms/WarningModal";
import { feedback } from "@/lib/feedback";
import { Button } from "@/components/atoms/Button";

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
    const [warningModal, setWarningModal] = useState<{ isOpen: boolean, message: string }>({ isOpen: false, message: '' });

    // Responsive State
    const containerRef = useRef<HTMLDivElement>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setIsNarrow(entry.contentRect.width < 768);
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
            setWarningModal({
                isOpen: true,
                message: t('tests.alerts.busy', { devices: conflictingDevices.join('\n') })
            });
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


                // Allow process to initialize (Backend Check + Delay)
                setLaunchStatus(t('tests.status.waiting_server'));
                let isReady = false;
                for (let i = 0; i < 20; i++) {
                    const s = await invoke<{ running: boolean }>('get_appium_status');
                    if (s.running) {
                        isReady = true;
                        break;
                    }
                    await new Promise(r => setTimeout(r, 500));
                }

                // Check if Appium is ready
                if (!isReady) {
                    // Appium did not report as running within the timeout
                    setLaunchStatus(t('tests.status.server_not_ready'));
                    setWarningModal({
                        isOpen: true,
                        message: t('tests.alerts.server_not_ready'),
                    });
                    setIsLaunching(false);
                    return;
                }

                // Stabilization delay to ensure port binding
                if (isReady) {
                    await new Promise(r => setTimeout(r, 3000));
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
                    feedback.toast.error("tests.launch_failed", e);
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
            feedback.toast.error("tests.status.failed", e);
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

    const tabs = [
        { id: 'file', label: !isNarrow ? t('tests.mode.file') : '', icon: FileCode },
        { id: 'folder', label: !isNarrow ? t('tests.mode.folder') : '', icon: FolderOpen },
        { id: 'args', label: !isNarrow ? t('tests.mode.args') : '', icon: FileText },
    ];

    return (
        <div ref={containerRef} className="h-full flex flex-col w-full overflow-hidden p-4">
            <WarningModal
                isOpen={warningModal.isOpen}
                onClose={() => setWarningModal(prev => ({ ...prev, isOpen: false }))}
                title={t('common.attention', "Attention")}
                description={warningModal.message}
            />

            <div className="flex-1 min-h-0 flex gap-4">
                {/* Embedded File Explorer */}
                <div className="flex-1 overflow-hidden bg-transparent relative">
                    <div className="absolute inset-0">
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
                </div>

                <TabBar
                    tabs={tabs}
                    activeId={mode}
                    onChange={(id) => { setMode(id as SelectionMode); setSelectedPath(""); }}
                    variant="pills"
                    orientation="vertical"
                    className={clsx(
                        "shrink-0 gap-6 justify-between",
                        isNarrow ? "w-fit" : "w-[200px]"
                    )}
                    actions={
                        <>
                            <Button
                                variant="secondary"
                                onClick={() => setDontOverwrite(!dontOverwrite)}
                                className={clsx(
                                    "w-full justify-start py-6",
                                    dontOverwrite
                                        ? "bg-warning-container text-on-warning-container/50 border-warning-container/20 hover:bg-warning-container/80"
                                        : ""
                                )}
                                leftIcon={<History size={18} className={clsx(dontOverwrite ? "text-on-surface/80" : "text-on-surface/80")} />}
                                title={t('tests.options.dont_overwrite', "Não sobrescrever logs")}
                            >
                                {!isNarrow && <span>{t('tests.options.dont_overwrite', "Não sobrescrever logs")}</span>}
                            </Button>

                            <Button
                                variant="primary"
                                onClick={() => handleRun()}
                                disabled={!selectedPath || isLaunching}
                                isLoading={isLaunching}
                                title={mode === 'folder' ? t('tests.run_all') : t('tests.run_selected')}
                                className="w-full py-6 font-bold shadow-primary/20"
                                leftIcon={!isLaunching ? <Play size={18} fill="currentColor" /> : undefined}
                            >
                                {!isNarrow && (
                                    <span>
                                        {isLaunching ? launchStatus : (mode === 'folder' ? t('tests.run_all') : t('tests.run_selected'))}
                                    </span>
                                )}
                            </Button>
                        </>
                    }
                />
            </div>
        </div>
    );
}

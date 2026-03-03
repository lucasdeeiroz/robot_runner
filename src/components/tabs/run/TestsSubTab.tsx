import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { Play, FolderOpen, FileText, FileCode, History, ChartNoAxesGantt } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { useTestSessions } from "@/lib/testSessionStore";
import { Device } from "@/lib/types";
import { FileExplorer, FileEntry } from "@/components/organisms/FileExplorer";
import { v4 as uuidv4 } from 'uuid';
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { TabBar } from "@/components/organisms/TabBar";
import { WarningModal } from "@/components/organisms/WarningModal";
import { feedback } from "@/lib/feedback";
import { Button } from "@/components/atoms/Button";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";

interface TestsSubTabProps {
    selectedDevices: string[];
    devices: Device[]; // New prop
    onNavigate?: (page: string) => void;
}

type SelectionMode = 'file' | 'folder' | 'args';

function isValidTestFile(path: string, automationFramework?: string): boolean {
    const lower = path.toLowerCase();
    if (automationFramework === 'maestro') {
        return lower.endsWith('.yaml') || lower.endsWith('.yml');
    }
    return lower.endsWith('.robot');
}

export function TestsSubTab({ selectedDevices, devices, onNavigate }: TestsSubTabProps) {
    const { t } = useTranslation();
    const [mode, setMode] = useState<SelectionMode>('file');
    const [selectedPath, setSelectedPath] = useState<string>("");
    const [launchStatus, setLaunchStatus] = useState<string>("");
    const [isLaunching, setIsLaunching] = useState(false);
    const [dontOverwrite, setDontOverwrite] = useState(false);
    const [warningModal, setWarningModal] = useState<{ isOpen: boolean, message: string }>({ isOpen: false, message: '' });
    const [selectedEntry, setSelectedEntry] = useState<FileEntry | null>(null);

    // Test selection state
    const [selectedTestsByPath, setSelectedTestsByPath] = useState<Record<string, string[]>>({});
    const [selectorState, setSelectorState] = useState<{
        isOpen: boolean,
        availableTests: string[],
        selectedTests: string[],
        activePath: string,
        isLoading: boolean
    }>({
        isOpen: false,
        availableTests: [],
        selectedTests: [],
        activePath: '',
        isLoading: false
    });

    const handleOpenTestSelector = async (path: string) => {
        setSelectorState(prev => ({
            ...prev,
            isOpen: true,
            isLoading: true,
            activePath: path,
            availableTests: [],
            selectedTests: selectedTestsByPath[path] || []
        }));

        // UX: Auto-select the path when opening selector
        setSelectedPath(path);
        setSelectedEntry({
            path,
            name: path.split(/[\\/]/).pop() || "",
            is_dir: false
        });

        try {
            const tests = await invoke<string[]>("get_robot_test_cases", { path });
            setSelectorState(prev => ({
                ...prev,
                availableTests: tests,
                isLoading: false
            }));
        } catch (e) {
            feedback.toast.error("tests.selector.load_error", e);
            setSelectorState(prev => ({ ...prev, isOpen: false, isLoading: false }));
        }
    };

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

        const fw = settings.automationFramework || 'robot';

        try {
            // 1. Check/Start Appium (Skip for Maestro)
            if (fw !== 'maestro') {
                const status = await invoke<{ running: boolean }>('get_appium_status');
                if (!status.running) {
                    setLaunchStatus(t('tests.status.starting'));
                    await invoke('start_appium_server', {
                        host: settings.appiumHost,
                        port: Number(settings.appiumPort),
                        basePath: settings.appiumBasePath,
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
                        // Ensure no double slashes in URL
                        const cleanBasePath = settings.appiumBasePath.startsWith('/')
                            ? settings.appiumBasePath
                            : `/${settings.appiumBasePath}`;
                        const statusUrl = `http://${settings.appiumHost}:${settings.appiumPort}${cleanBasePath.endsWith('/') ? cleanBasePath : cleanBasePath + '/'}status`.replace(/([^:]\/)\/+/g, "$1");
                        let isRestReady = false;

                        // Poll REST API for up to 15 seconds
                        for (let j = 0; j < 30; j++) {
                            try {
                                const response = await fetch(statusUrl);
                                if (response.ok) {
                                    isRestReady = true;
                                    break;
                                }
                            } catch (e) {
                                // Connection refused or other network error
                            }
                            await new Promise(r => setTimeout(r, 500));
                        }

                        setLaunchStatus(t('tests.status.waiting_server_rest'));
                        if (!isRestReady) {
                            console.warn("Appium process is running but REST API did not respond in time.");
                            // We continue anyway as a fallback, but the warning helps debugging.
                        }

                        // Final short breath
                        await new Promise(r => setTimeout(r, 1000));
                    }
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

                const fw = settings.automationFramework || 'robot';

                // Get selected tests for this path
                const selectedTests = selectedTestsByPath[targetPath] || [];

                addSession(
                    runId,
                    deviceUdid || "local",
                    devName,
                    testPathArg || argFileArg || "Unknown",
                    fw as 'robot' | 'maestro' | 'appium',
                    dontOverwrite,
                    argFileArg,
                    devModel,
                    devVer,
                    selectedTests.length > 0 ? selectedTests : undefined
                );

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

                if (fw === 'robot') {
                    invoke("run_robot_test", {
                        runId: runId,
                        testPath: testPathArg,
                        outputDir: logDir,
                        device: deviceUdid === 'Start local Server' ? null : deviceUdid,
                        argumentsFile: argFileArg,
                        timestampOutputs: dontOverwrite,
                        deviceModel: devModel,
                        androidVersion: devVer,
                        workingDir: workingDir,
                        selectedTests: selectedTests.length > 0 ? selectedTests : undefined
                    }).catch(e => {
                        feedback.toast.error("tests.launch_failed", e);
                    });
                } else if (fw === 'maestro') {
                    invoke("run_maestro_test", {
                        runId,
                        testPath: targetPath,
                        outputDir: logDir,
                        device: deviceUdid === 'local' ? null : deviceUdid,
                        maestroArgs: settings.tools.maestroArgs,
                        working_dir: settings.paths.automationRoot,
                        timestampOutputs: dontOverwrite
                    }).catch(e => {
                        feedback.toast.error("tests.launch_failed", e);
                    });
                } else if (fw === 'appium') {
                    invoke("run_appium_test", {
                        runId,
                        projectPath: targetPath,
                        outputDir: logDir,
                        appiumJavaArgs: settings.tools.appiumJavaArgs
                    }).catch(e => {
                        feedback.toast.error("tests.launch_failed", e);
                    });
                }
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
        {
            id: 'folder',
            label: !isNarrow ? (settings.automationFramework === 'appium' ? t('tests.mode.project') : t('tests.mode.folder')) : '',
            icon: FolderOpen
        },
        { id: 'args', label: !isNarrow ? t('tests.mode.args') : '', icon: FileText, disabled: settings.automationFramework && settings.automationFramework !== 'robot' },
    ].filter(tab => {
        if (tab.id === 'args' && settings.automationFramework && settings.automationFramework !== 'robot') return false;
        if (tab.id === 'file' && settings.automationFramework === 'appium') return false; // Appium Java usually runs the whole project
        return true;
    });

    useEffect(() => {
        // Validation: If current mode is disabled/filtered out, switch to first available
        const currentTab = tabs.find(t => t.id === mode);
        if (!currentTab && tabs.length > 0) {
            setMode(tabs[0].id as SelectionMode);
        }
    }, [settings.automationFramework, mode, tabs]);

    return (
        <div ref={containerRef} className="h-full flex flex-col w-full overflow-hidden">
            <WarningModal
                isOpen={warningModal.isOpen}
                onClose={() => setWarningModal(prev => ({ ...prev, isOpen: false }))}
                title={t('common.attention', "Attention")}
                description={warningModal.message}
            />

            <div className="flex-1 min-h-0 flex gap-4">
                {/* Embedded File Explorer */}
                <div className="flex-1 overflow-hidden bg-transparent relative">
                    <FileExplorer
                        key={mode}
                        initialPath={getInitialPath()}
                        selectionMode={mode === 'args' || mode === 'file' ? 'file' : 'directory'}
                        onSelect={setSelectedPath}
                        onCancel={() => { setSelectedPath(""); setSelectedEntry(null); }}
                        onSelectionChange={(entry) => {
                            setSelectedPath(entry?.path || "");
                            setSelectedEntry(entry);
                        }}
                        allowHideFooter
                        renderEntryExtra={(entry) => {
                            if (mode === 'file' && entry.name.endsWith('.robot')) {
                                const isSelected = selectedPath === entry.path;
                                const selection = selectedTestsByPath[entry.path] || [];
                                return (
                                    <div className="flex items-center gap-1">
                                        {selection.length > 0 && (
                                            <span className="text-[10px] bg-primary text-on-primary px-1.5 py-0.5 rounded-full font-bold">
                                                {selection.length}
                                            </span>
                                        )}
                                        <Button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenTestSelector(entry.path);
                                            }}
                                            className={clsx(
                                                "p-1.5 bg-transparent shadow-none hover:bg-transparent rounded-full transition-all group/btn",
                                                isSelected ? "text-primary" : "text-on-surface-variant/40 hover:text-primary"
                                            )}
                                            title={t('tests.select_tests')}
                                        >
                                            <ChartNoAxesGantt size={14} className="group-hover/btn:scale-110 transition-transform" />
                                        </Button>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                </div>

                <TabBar
                    layoutId="tests-sub-tab"
                    tabs={tabs}
                    activeId={mode}
                    onChange={(id) => { setMode(id as SelectionMode); setSelectedPath(""); setSelectedEntry(null); }}
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
                                disabled={
                                    !selectedEntry ||
                                    isLaunching ||
                                    (mode === 'file' && (selectedEntry.is_dir || !isValidTestFile(selectedEntry.path, settings.automationFramework))) ||
                                    (mode === 'folder' && !selectedEntry.is_dir) ||
                                    (mode === 'args' && (selectedEntry.is_dir || (!selectedEntry.path.toLowerCase().endsWith('.args') && !selectedEntry.path.toLowerCase().endsWith('.txt'))))
                                }
                                title={mode === 'folder' ? t('tests.run_all') : t('tests.run_selected')}
                                className="w-full py-6 font-bold shadow-primary/20"
                                leftIcon={!isLaunching ? <Play size={18} fill="currentColor" /> : <ExpressiveLoading size="sm" variant="circular" />}
                            >
                                {!isNarrow && (
                                    <span>
                                        {isLaunching ? launchStatus : (
                                            (!selectedEntry || (
                                                (mode === 'file' && (selectedEntry.is_dir || !isValidTestFile(selectedEntry.path, settings.automationFramework))) ||
                                                (mode === 'folder' && !selectedEntry.is_dir) ||
                                                (mode === 'args' && (selectedEntry.is_dir || (!selectedEntry.path.toLowerCase().endsWith('.args') && !selectedEntry.path.toLowerCase().endsWith('.txt'))))
                                            )) ? t('tests.no_selection') : (mode === 'folder' ? t('tests.run_all') : t('tests.run_selected'))
                                        )}
                                    </span>
                                )}
                            </Button>
                        </>
                    }
                />
            </div>

            {/* Framework specific tips */}
            {settings.automationFramework === 'appium' && mode === 'folder' && (
                <div className="absolute bottom-4 left-4 right-4 animate-in fade-in slide-in-from-bottom-2 duration-300 pointer-events-none">
                    <div className="bg-surface-container/80 backdrop-blur-md border border-outline/10 text-on-surface-variant text-[11px] px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 max-w-fit">
                        <FileText size={14} className="text-primary" />
                        <span>{t('tests.tips.appium_maven')}</span>
                    </div>
                </div>
            )}

            {/* Test Selector Modal */}
            {selectorState.isOpen && createPortal(
                <TestSelectorModal
                    isOpen={selectorState.isOpen}
                    onClose={() => setSelectorState(prev => ({ ...prev, isOpen: false }))}
                    tests={selectorState.availableTests}
                    selected={selectorState.selectedTests}
                    onToggle={(test) => {
                        setSelectorState(prev => {
                            const next = [...prev.selectedTests];
                            const idx = next.indexOf(test);
                            if (idx !== -1) next.splice(idx, 1);
                            else next.push(test);
                            return { ...prev, selectedTests: next };
                        });
                    }}
                    onSelectAll={() => setSelectorState(prev => ({ ...prev, selectedTests: [...prev.availableTests] }))}
                    onClearAll={() => setSelectorState(prev => ({ ...prev, selectedTests: [] }))}
                    onConfirm={() => {
                        setSelectedTestsByPath(prev => ({
                            ...prev,
                            [selectorState.activePath]: selectorState.selectedTests
                        }));
                        setSelectorState(prev => ({ ...prev, isOpen: false }));
                    }}
                    isLoading={selectorState.isLoading}
                />,
                document.body
            )}
        </div>
    );
}

// Sub-component for Test Selector
import { X } from "lucide-react";

function TestSelectorModal({ isOpen, onClose, tests, selected, onToggle, onSelectAll, onClearAll, onConfirm, isLoading }: {
    isOpen: boolean;
    onClose: () => void;
    tests: string[];
    selected: string[];
    onToggle: (test: string) => void;
    onSelectAll: () => void;
    onClearAll: () => void;
    onConfirm: () => void;
    isLoading: boolean;
}) {
    const { t } = useTranslation();
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-surface border border-outline-variant/30 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-outline-variant/10 bg-surface-variant/20">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                        <FileCode size={18} className="text-primary" />
                        {t('tests.selector.title')}
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-surface-variant/50 rounded-lg transition-colors">
                        <X size={18} />
                    </button>
                </div>
                {selected.length > 0 && (
                    <span className="px-4 text-[10px] text-on-surface-variant/80 font-medium">
                        {t('tests.selector.selected', { count: selected.length })}
                    </span>
                )}

                <div className="p-4 max-h-[400px] overflow-y-auto custom-scrollbar">
                    {isLoading ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-4 text-on-surface-variant">
                            <ExpressiveLoading size="md" variant="circular" />
                            <span className="text-xs animate-pulse">{t('tests.selector.loading')}</span>
                        </div>
                    ) : tests.length === 0 ? (
                        <div className="py-12 text-center text-on-surface-variant italic text-sm">
                            {t('tests.selector.empty')}
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {tests.map(test => {
                                const isChecked = selected.includes(test);
                                return (
                                    <div
                                        key={test}
                                        onClick={() => onToggle(test)}
                                        className={clsx(
                                            "flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-pointer transition-all select-none",
                                            isChecked
                                                ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                                                : "hover:bg-surface-variant/30 text-on-surface-variant"
                                        )}
                                    >
                                        <div className={clsx(
                                            "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all",
                                            isChecked ? "bg-primary border-primary" : "border-outline-variant"
                                        )}>
                                            {isChecked && <div className="w-2 h-2 bg-on-primary rounded-sm" />}
                                        </div>
                                        <span className="text-xs font-mono font-medium truncate flex-1">{test}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-outline-variant/10 flex items-center justify-between bg-surface-variant/10">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onSelectAll}
                            className="text-[11px] font-bold text-primary hover:underline"
                        >
                            {t('tests.selector.all')}
                        </button>
                        <div className="w-1 h-1 bg-outline-variant rounded-full" />
                        <button
                            onClick={onClearAll}
                            className="text-[11px] font-bold text-on-surface-variant/60 hover:text-error"
                        >
                            {t('tests.selector.none')}
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={onConfirm}
                            disabled={isLoading}
                            className="rounded-xl px-6"
                        >
                            {t('tests.selector.close')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

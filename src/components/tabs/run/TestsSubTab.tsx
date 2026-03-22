import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { Play, FolderOpen, FileText, FileCode, History, ChartNoAxesGantt, X, Settings2, Info } from "lucide-react";
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
import { useSelection, SelectionItem } from "@/lib/selectionStore";
import { SelectionCounter } from "@/components/molecules/SelectionCounter";

interface TestsSubTabProps {
    selectedDevices: string[];
    devices: Device[];
    onNavigate?: (page: string) => void;
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
    const [selectedEntry, setSelectedEntry] = useState<FileEntry | null>(null);
    const { items, setTests, setArgs, clearSelection } = useSelection();

    // Selector state
    const [selectorState, setSelectorState] = useState<{
        isOpen: boolean,
        availableTests: string[],
        selectedTests: string[],
        activePath: string,
        isLoading: boolean,
        type: 'test' | 'arg'
    }>({
        isOpen: false,
        availableTests: [],
        selectedTests: [],
        activePath: '',
        isLoading: false,
        type: 'test'
    });

    const handleOpenTestSelector = async (path: string) => {
        const existingItem = items.find(i => i.path === path);
        setSelectorState({
            isOpen: true,
            isLoading: true,
            activePath: path,
            availableTests: [],
            selectedTests: existingItem?.tests || [],
            type: 'test'
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

    const handleOpenArgSelector = async (path: string) => {
        const existingItem = items.find(i => i.path === path);
        setSelectorState({
            isOpen: true,
            isLoading: true,
            activePath: path,
            availableTests: [],
            selectedTests: existingItem?.args || [],
            type: 'arg'
        });

        try {
            const content = await invoke<string>("read_file", { path });
            const lines = content.split('\n')
                .map(l => l.trim())
                .filter(l => l && !l.startsWith('#'));

            setSelectorState(prev => ({
                ...prev,
                availableTests: lines,
                isLoading: false
            }));
        } catch (e) {
            feedback.toast.error("common.error", e);
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

    const handleRun = async () => {
        if (items.length === 0 && !selectedPath) return;

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
                const status = await invoke<{ running: boolean }>('get_appium_status', {
                    host: settings.appiumHost,
                    port: Number(settings.appiumPort)
                });
                if (!status.running) {
                    setLaunchStatus(t('tests.status.starting'));
                    await invoke('start_appium_server', {
                        host: settings.appiumHost,
                        port: Number(settings.appiumPort),
                        basePath: settings.appiumBasePath,
                        args: settings.tools.appiumArgs
                    });

                    setLaunchStatus(t('tests.status.waiting_server'));
                    let isReady = false;
                    for (let i = 0; i < 20; i++) {
                        const s = await invoke<{ running: boolean }>('get_appium_status', {
                            host: settings.appiumHost,
                            port: Number(settings.appiumPort)
                        });
                        if (s.running) {
                            isReady = true;
                            break;
                        }
                        await new Promise(r => setTimeout(r, 500));
                    }

                    if (!isReady) {
                        setLaunchStatus(t('tests.status.server_not_ready'));
                        setWarningModal({ isOpen: true, message: t('tests.alerts.server_not_ready') });
                        setIsLaunching(false);
                        return;
                    }
                }
            }

            setLaunchStatus(t('tests.status.launching'));

            // 187: Prepare selection items
            let selections: SelectionItem[] = [...items];
            if (selections.length === 0 && selectedPath) {
                selections.push({
                    id: uuidv4(),
                    path: selectedPath,
                    name: selectedPath.split(/[\\/]/).pop() || "",
                    type: mode === 'folder' ? 'folder' : mode === 'args' ? 'args' : 'file',
                    tests: [],
                    args: []
                });
            }

            const targets = selectedDevices.length > 0 ? selectedDevices : [null];
            const workingDir = settings.paths.automationRoot || "";

            for (const deviceUdid of targets) {
                const runId = uuidv4();
                const deviceObj = devices.find((d: Device) => d.udid === deviceUdid);
                const devModel = deviceObj ? deviceObj.model.replace(/\s+/g, '') : "UnknownModel";
                const devVer = deviceObj ? deviceObj.android_version || "0" : "0";

                let devName = deviceObj?.model || "Device";
                if (deviceUdid && deviceUdid !== 'local') {
                    devName = `${devName} (${deviceObj?.android_version ? `Android ${deviceObj.android_version}` : deviceUdid})`;
                } else {
                    devName = "Local/Web";
                }

                // If multiple items, create a temporary argument file
                let finalTestPath: string | null = null;
                let finalArgsFile: string | null = null;
                let finalTests: string[] | null = null;

                if (selections.length === 1 && (selections[0].tests?.length || 0) === 0 && (selections[0].args?.length || 0) === 0) {
                    // Simple case: single path
                    if (selections[0].type === 'args') finalArgsFile = selections[0].path;
                    else finalTestPath = selections[0].path;
                } else {
                    // Complex case: generate temp .args file
                    const tempArgsPath = `${settings.paths.logs || '../temp'}/run_${runId}.args`.replace(/\\/g, '/');
                    let content = "";
                    const isWindows = navigator.platform.toLowerCase().includes('win');
                    const lineEnding = isWindows ? "\r\n" : "\n";


                    const allTests: string[] = [];
                    const hasAnySpecificTest = selections.some(s => (s.tests?.length || 0) > 0);

                    for (const item of selections) {
                        const basename = item.path.split(/[\\/]/).pop() || "";
                        const name = basename.replace(/\.(robot|args|txt)$/i, "");

                        if (item.type === 'file' || item.type === 'folder') {
                            if (item.tests && item.tests.length > 0) {
                                for (const test of item.tests) {
                                    allTests.push(`*.${name}.${test}`);
                                }
                            } else {
                                allTests.push(`*.${name}.*`);
                            }

                            // Add the file or folder as a POSITIONAL data source in the .args file
                            const normalizedPath = item.path.replace(/\\/g, '/');
                            content += `${normalizedPath}${lineEnding}`;

                        } else if (item.type === 'args') {
                            // Add a broad pattern for the argument file to ensure its tests are included if filtering is active
                            allTests.push(`*.${name}.*`);

                            // FLATTEN argument files: read them and append their content cleanly
                            try {
                                const fileContent = await invoke<string>("read_file", { path: item.path });
                                const lines = fileContent.split(/\r?\n/);

                                for (let line of lines) {
                                    line = line.trim();
                                    if (!line || line.startsWith('#') || line.startsWith('--doc')) continue;

                                    // Handle multi-word flags correctly for Robot (.args format)
                                    // If a line starts with a flag (e.g., --include) and has a space, 
                                    // split it into two lines: the flag and its value.
                                    if (line.startsWith('--') && line.includes(' ')) {
                                        const firstSpaceIndex = line.indexOf(' ');
                                        const flag = line.substring(0, firstSpaceIndex).trim();
                                        const value = line.substring(firstSpaceIndex + 1).trim();
                                        content += `${flag}${lineEnding}${value}${lineEnding}`;
                                        continue;
                                    }

                                    // Fall-through: Write the line as is
                                    content += `${line}${lineEnding}`;
                                }
                            } catch (e) {
                                console.error("Failed to read selection args file", item.path, e);
                                const normalizedPath = item.path.replace(/\\/g, '/');
                                content += `-A${lineEnding}${normalizedPath}${lineEnding}`;
                            }
                        }
                    }

                    if (hasAnySpecificTest && allTests.length > 0) {
                        finalTests = allTests;
                    }

                    finalArgsFile = tempArgsPath;

                    try {
                        await invoke("save_file", { path: tempArgsPath, content, append: false });
                    } catch (e) {
                        feedback.toast.error("common.error", e);
                        setIsLaunching(false);
                        return;
                    }
                }

                addSession(
                    runId,
                    deviceUdid || "local",
                    devName,
                    finalTestPath || finalArgsFile || "MultiSelection",
                    fw as 'robot' | 'maestro' | 'appium',
                    dontOverwrite,
                    finalArgsFile,
                    devModel,
                    devVer,
                    finalTests || undefined
                );

                const suiteName = selections.length === 1 ? selections[0].name.split('.')[0] : "MultiSelection";
                const cleanModel = devModel.replace(/[^a-zA-Z0-9]/g, "");
                const cleanVer = devVer.replace(/[^0-9.]/g, "");
                const cleanUdid = (deviceUdid || "Local").replace(/[^a-zA-Z0-9]/g, "");
                const cleanSuite = suiteName.replace(/[^a-zA-Z0-9_-]/g, "");

                const legacyFolder = `A${cleanVer}_${cleanModel}_${cleanUdid}/${cleanSuite}`;
                const logDir = settings.paths.logs
                    ? `${settings.paths.logs}/${legacyFolder}`
                    : `../test_results/${legacyFolder}`;

                if (fw === 'robot') {
                    invoke("run_robot_test", {
                        runId,
                        testPath: finalTestPath,
                        outputDir: logDir,
                        device: deviceUdid === 'local' ? null : deviceUdid,
                        argumentsFile: finalArgsFile,
                        timestampOutputs: dontOverwrite,
                        deviceModel: devModel,
                        androidVersion: devVer,
                        workingDir,
                        selectedTests: finalTests
                    }).catch(e => feedback.toast.error("tests.launch_failed", e));
                } else if (fw === 'maestro') {
                    invoke("run_maestro_test", {
                        runId,
                        testPath: finalTestPath,
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
                        projectPath: finalTestPath,
                        outputDir: logDir,
                        appiumJavaArgs: settings.tools.appiumJavaArgs
                    }).catch(e => {
                        feedback.toast.error("tests.launch_failed", e);
                    });
                }
            }

            setLaunchStatus(t('tests.status.redirecting'));
            setTimeout(() => {
                if (onNavigate) onNavigate('tests');
                setIsLaunching(false);
                setLaunchStatus("");
                clearSelection();
            }, 500);

        } catch (e: any) {
            feedback.toast.error("tests.status.failed", e);
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
        if (tab.id === 'file' && settings.automationFramework === 'appium') return false;
        return true;
    });

    useEffect(() => {
        const currentTab = tabs.find(t => t.id === mode);
        if (!currentTab && tabs.length > 0) {
            setMode(tabs[0].id as SelectionMode);
        }
    }, [settings.automationFramework, mode, tabs]);

    const handleTabChange = useCallback((id: string) => {
        setMode(id as SelectionMode);
        setSelectedPath("");
        setSelectedEntry(null);
    }, []);

    return (
        <div ref={containerRef} className="h-full flex flex-col w-full overflow-hidden">
            <WarningModal
                isOpen={warningModal.isOpen}
                onClose={() => setWarningModal(prev => ({ ...prev, isOpen: false }))}
                title={t('common.attention', "Attention")}
                description={warningModal.message}
            />

            <div className="flex-1 min-h-0 flex gap-4">
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
                        allowHideFooter={true}
                        renderEntryExtra={(entry, isSelected) => {
                            if (mode === 'file' && entry.name.endsWith('.robot')) {
                                const item = items.find(i => i.path === entry.path);
                                const selection = item?.tests || [];
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
                                            <ChartNoAxesGantt size={14} />
                                        </Button>
                                    </div>
                                );
                            }
                            if (mode === 'args' && (entry.name.endsWith('.args') || entry.name.endsWith('.txt'))) {
                                const item = items.find(i => i.path === entry.path);
                                const selection = item?.args || [];
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
                                                handleOpenArgSelector(entry.path);
                                            }}
                                            className={clsx(
                                                "p-1.5 bg-transparent shadow-none hover:bg-transparent rounded-full transition-all group/btn",
                                                isSelected ? "text-primary" : "text-on-surface-variant/40 hover:text-primary"
                                            )}
                                            title={t('tests.select_args')}
                                        >
                                            <Settings2 size={14} />
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
                    onChange={handleTabChange}
                    variant="pills"
                    orientation="vertical"
                    className={clsx("shrink-0 gap-6 justify-between", isNarrow ? "w-fit" : "w-[200px]")}
                    actions={
                        <>
                            <Button
                                variant="secondary"
                                onClick={() => setDontOverwrite(!dontOverwrite)}
                                className={clsx("w-full justify-start py-6", dontOverwrite && "bg-warning-container text-on-warning-container/50")}
                                leftIcon={<History size={18} />}
                                title={t('tests.options.dont_overwrite')}
                            >
                                {!isNarrow && <span>{t('tests.options.dont_overwrite')}</span>}
                            </Button>

                            <Button
                                variant="primary"
                                onClick={() => handleRun()}
                                disabled={selectedDevices.length === 0 || (items.length === 0 && !selectedEntry) || isLaunching}
                                title={t('tests.run_selected')}
                                className="w-full py-6 font-bold hover:bg-secondary-container"
                                leftIcon={!isLaunching ? <Play size={18} fill="currentColor" /> : <ExpressiveLoading size="sm" variant="circular" />}
                            >
                                {!isNarrow && (
                                    <span>{isLaunching ? launchStatus : ((items.length === 0 && !selectedEntry) ? t('tests.no_selection') : t('tests.run_selected'))}</span>
                                )}
                            </Button>
                        </>
                    }
                />
            </div>

            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
                <SelectionCounter />
            </div>

            {selectorState.isOpen && createPortal(
                <TestSelectorModal
                    isOpen={selectorState.isOpen}
                    onClose={() => setSelectorState(prev => ({ ...prev, isOpen: false }))}
                    tests={selectorState.availableTests}
                    selected={selectorState.selectedTests}
                    type={selectorState.type}
                    onToggle={(id) => {
                        setSelectorState(prev => {
                            const next = [...prev.selectedTests];
                            const idx = next.indexOf(id);
                            if (idx !== -1) next.splice(idx, 1);
                            else next.push(id);
                            return { ...prev, selectedTests: next };
                        });
                    }}
                    onSelectAll={() => setSelectorState(prev => ({ ...prev, selectedTests: [...prev.availableTests] }))}
                    onClearAll={() => setSelectorState(prev => ({ ...prev, selectedTests: [] }))}
                    onConfirm={() => {
                        if (selectorState.type === 'arg') {
                            setArgs(selectorState.activePath, selectorState.selectedTests, selectorState.activePath.split(/[\\/]/).pop() || "");
                        } else {
                            setTests(selectorState.activePath, selectorState.selectedTests, selectorState.activePath.split(/[\\/]/).pop() || "");
                        }
                        setSelectorState(prev => ({ ...prev, isOpen: false }));
                    }}
                    isLoading={selectorState.isLoading}
                />,
                document.body
            )}
        </div>
    );
}

function TestSelectorModal({ isOpen, onClose, tests, selected, onToggle, onSelectAll, onClearAll, onConfirm, isLoading, type }: {
    isOpen: boolean;
    onClose: () => void;
    tests: string[];
    selected: string[];
    onToggle: (id: string) => void;
    onSelectAll: () => void;
    onClearAll: () => void;
    onConfirm: () => void;
    isLoading: boolean;
    type: 'test' | 'arg';
}) {
    const { t } = useTranslation();
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-surface border border-outline-variant/30 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-outline-variant/10 bg-surface-variant/20">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                        {type === 'test' ? <FileCode size={18} className="text-primary" /> : <Settings2 size={18} className="text-primary" />}
                        {type === 'test' ? t('tests.selector.title') : t('tests.selector.args_title', "Selecione Argumentos")}
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-surface-variant/50 rounded-lg transition-colors"><X size={18} /></button>
                </div>

                {type === 'test' && (
                    <div className="px-4 py-2 bg-primary/5 flex items-center gap-2 text-[11px] text-primary/80 border-b border-primary/10">
                        <Info size={14} />
                        <span>{t('tests.selector.suite_info')}</span>
                    </div>
                )}

                <div className="p-4 max-h-[400px] overflow-y-auto custom-scrollbar">
                    {isLoading ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-4 text-on-surface-variant">
                            <ExpressiveLoading size="md" variant="circular" />
                            <span className="text-xs animate-pulse">{t('tests.selector.loading')}</span>
                        </div>
                    ) : tests.length === 0 ? (
                        <div className="py-12 text-center text-on-surface-variant italic text-sm">{t('tests.selector.empty')}</div>
                    ) : (
                        <div className="space-y-1">
                            {tests.map(id => {
                                const isChecked = selected.includes(id);
                                return (
                                    <div
                                        key={id}
                                        onClick={() => onToggle(id)}
                                        className={clsx(
                                            "flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-pointer transition-all select-none",
                                            isChecked ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "hover:bg-surface-variant/30 text-on-surface-variant"
                                        )}
                                    >
                                        <div className={clsx("w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all", isChecked ? "bg-primary border-primary" : "border-outline-variant")}>
                                            {isChecked && <div className="w-2 h-2 bg-on-primary rounded-sm" />}
                                        </div>
                                        <span className="text-xs font-mono font-medium truncate flex-1">{id}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-outline-variant/10 flex items-center justify-between bg-surface-variant/10">
                    <div className="flex items-center gap-2">
                        <button onClick={onSelectAll} className="text-[11px] font-bold text-primary hover:underline">{t('tests.selector.all')}</button>
                        <div className="w-1 h-1 bg-outline-variant rounded-full" />
                        <button onClick={onClearAll} className="text-[11px] font-bold text-on-surface-variant/60 hover:text-error">{t('tests.selector.none')}</button>
                    </div>
                    <Button variant="primary" size="sm" onClick={onConfirm} disabled={isLoading} className="rounded-xl px-6 hover:bg-secondary-container">{t('tests.selector.close')}</Button>
                </div>
            </div>
        </div>
    );
}

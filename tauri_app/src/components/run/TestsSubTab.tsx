import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { Play, FolderOpen, StopCircle } from "lucide-react";
import { RunConsole } from "@/components/RunConsole";
import { useSettings } from "@/lib/settings";

interface TestsSubTabProps {
    selectedDevices: string[];
}

export function TestsSubTab({ selectedDevices }: TestsSubTabProps) {
    const [testPath, setTestPath] = useState<string>("");
    const [logs, setLogs] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const { settings } = useSettings();

    // Refs for cancelling?
    const stopRef = useRef<boolean>(false);

    useEffect(() => {
        console.log("TestsSubTab Mounted - Verified Version");
        // alert("TestsSubTab Loaded - Version 2.0"); 
        // Keeping alert commented to not annoy, trusting the button change first.
    }, []);

    useEffect(() => {
        // Global listeners for output are set up per run, but we can keep a general one?
        // Actually, the loop needs to wait for finish.
        // We will attach listeners inside handleRun or use a global one that resolves a promise.
        // But "test-output" is global.

        const unlisten = listen<string>("test-output", (event) => {
            setLogs((prev) => [...prev, event.payload]);
        });

        return () => {
            unlisten.then(f => f());
        };
    }, []);

    const handleSelectFile = async () => {
        try {
            const selected = await open({
                directory: false,
                multiple: false,
                filters: [{ name: 'Robot Framework', extensions: ['robot'] }] // TODO: Add .txt for arguments later
            });
            if (selected) {
                setTestPath(selected as string);
                setLogs([]); // Clear logs on new file
            }
        } catch (err) {
            console.error("Failed to open dialog", err);
        }
    };

    // Helper: Wait for test finish
    const runTestOnDevice = async (device: string | null) => {
        return new Promise<void>((resolve, reject) => {
            let unlistenFinish: any;

            const cleanup = () => {
                if (unlistenFinish) unlistenFinish.then((f: any) => f());
            };

            unlistenFinish = listen("test-finished", (event: any) => {
                setLogs((prev) => [...prev, `\n[System] Test finished on ${device}: ${event.payload}`]);
                cleanup();
                resolve();
            });

            const deviceArg = device === 'Start local Server' ? null : device; // Handle potential special cases, though we pass strings

            invoke("run_robot_test", {
                testPath,
                outputDir: "../test_results",
                device: deviceArg
            }).catch(err => {
                cleanup();
                reject(err);
            });
        });
    };

    const handleRun = async () => {
        if (!testPath) return;

        setIsRunning(true);
        stopRef.current = false;
        setLogs([`[System] Starting test suite: ${testPath}`]);

        // Auto-Start Check (Once)
        try {
            // 1. Check process
            const status = await invoke<{ running: boolean }>('get_appium_status');

            if (!status.running) {
                setLogs(prev => [...prev, "[System] Appium not running. Attempting to auto-start..."]);

                await invoke('start_appium_server', {
                    host: settings.appiumHost,
                    port: settings.appiumPort,
                    args: settings.tools.appiumArgs
                });

                setLogs(prev => [...prev, "[System] Appium start command sent. Polling for readiness..."]);

                // 2. Poll HTTP Endpoint for Readiness
                const baseUrl = `http://${settings.appiumHost}:${settings.appiumPort}/wd/hub/status`;

                let appiumReady = false;
                for (let i = 0; i < 20; i++) {
                    try {
                        const controller = new AbortController();
                        const id = setTimeout(() => controller.abort(), 800);

                        const response = await fetch(baseUrl + `?t=${Date.now()}`, {
                            signal: controller.signal,
                            cache: 'no-store'
                        });
                        clearTimeout(id);

                        if (response.ok || response.status === 304) {
                            appiumReady = true;
                            setLogs(prev => [...prev, "[System] Appium Server is responsive."]);
                            break;
                        }
                    } catch (err) { }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                if (!appiumReady) {
                    setLogs(prev => [...prev, "[System] Warning: Appium did not respond to time. Attempting run anyway..."]);
                }
            }
        } catch (e) {
            setLogs(prev => [...prev, `[System] Warning: Failed to check/start Appium: ${e}`]);
        }

        // Run Loop
        const targets = selectedDevices.length > 0 ? selectedDevices : [null]; // If empty, run once without device (local/web)

        for (const device of targets) {
            if (stopRef.current) {
                setLogs(prev => [...prev, "[System] Execution stopped by user."]);
                break;
            }

            const devName = device ? `Device ${device}` : "Default (Local/Web)";
            setLogs(prev => [...prev, `\n[System] ---------------------------------------------------`]);
            setLogs(prev => [...prev, `[System] Running on ${devName}...`]);
            setLogs(prev => [...prev, `[System] ---------------------------------------------------`]);

            try {
                // If device is string, pass it
                await runTestOnDevice(device as string);

                // Optional delay between tests
                if (!stopRef.current) await new Promise(r => setTimeout(r, 1000));

            } catch (err) {
                setLogs(prev => [...prev, `[Error] Failed to run on ${devName}: ${err}`]);
            }
        }

        setIsRunning(false);
    };

    const handleStop = async () => {
        stopRef.current = true;
        try {
            await invoke("stop_robot_test");
            setLogs((prev) => [...prev, "[System] Stopping test..."]);
        } catch (err) {
            setLogs((prev) => [...prev, `[Error] Failed to stop test: ${err}`]);
        }
    };

    return (
        <div className="h-full flex flex-col space-y-4">
            {/* Controls Row */}
            <div className="flex gap-4 items-center shrink-0">
                <button
                    onClick={handleSelectFile}
                    className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-lg border border-zinc-200 dark:border-zinc-700 flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                    <FolderOpen size={18} />
                    Select Suite
                </button>
                <input
                    type="text"
                    value={testPath}
                    readOnly
                    placeholder="No file selected"
                    className="flex-1 bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-700 dark:text-zinc-300 font-mono text-sm"
                />

                <button
                    onClick={isRunning ? handleStop : handleRun}
                    disabled={(!testPath && !isRunning)}
                    className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-all shadow-md ${(!testPath && !isRunning)
                        ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed shadow-none"
                        : isRunning
                            ? "bg-red-600 hover:bg-red-500 text-white shadow-red-900/20"
                            : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20"
                        }`}
                >
                    {isRunning ? <StopCircle size={18} className="" /> : <Play size={18} />}
                    {isRunning ? "Stop Test" : "Run Test"}
                </button>
            </div>

            {/* Console / Output */}
            <div className="flex-1 min-h-0 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                <RunConsole logs={logs} />
            </div>
        </div>
    );
}

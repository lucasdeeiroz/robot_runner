import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface ProcessStat {
    pid: number;
    user: string;
    pr: string;
    ni: string;
    virt: string;
    res: string;
    shr: string;
    s: string;
    cpu: number;
    mem: number;
    time: string;
    command: string;
}

export interface ProcessStatsPayload {
    device: string;
    processes: ProcessStat[];
}

export type SortField = "cpu" | "mem" | "name" | "pid";
export type SortDirection = "asc" | "desc";

export function useProcessMonitor(
    selectedDevice: string,
    isActive: boolean,
    autoRefresh: boolean,
    isTestRunning: boolean = false,
    allowActionsDuringTest: boolean = false,
    forceEnable: boolean = false
) {
    const [processes, setProcesses] = useState<ProcessStat[]>([]);
    const [error, setError] = useState<string | null>(null);
    
    // Sort state
    const [sortField, setSortField] = useState<SortField>("cpu");
    const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

    // History state for a SINGLE process (to avoid memory leaks)
    const [selectedPid, setSelectedPid] = useState<number | null>(null);
    const [processHistory, setProcessHistory] = useState<(ProcessStat & { timestamp: number })[]>([]);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let isSubscribed = true;

        const canUpdateDuringTest = allowActionsDuringTest || forceEnable;
        const shouldUpdate = selectedDevice && isActive && autoRefresh && (!isTestRunning || canUpdateDuringTest);

        if (shouldUpdate) {
            const intervalMs = 2000;

            // Start stream
            invoke("start_process_monitor_stream", {
                device: selectedDevice,
                intervalMs
            }).catch(e => {
                console.error("Failed to start process monitor stream:", e);
                setError(String(e));
            });

            // Listen to stream
            import("@tauri-apps/api/event").then(({ listen }) => {
                listen<ProcessStatsPayload>("process_monitor_update", (event) => {
                    if (event.payload.device === selectedDevice && isSubscribed) {
                        setProcesses(event.payload.processes);
                        setError(null);
                    }
                }).then(un => {
                    if (isSubscribed) unlisten = un;
                    else un();
                });
            });
        } else if (!isActive || !selectedDevice) {
            // Clean up if not active, but retain if just autoRefresh is off
            setProcesses([]);
            setProcessHistory([]);
        }

        return () => {
            isSubscribed = false;
            if (unlisten) unlisten();
            if (selectedDevice) {
                invoke("stop_process_monitor_stream", { device: selectedDevice }).catch(console.error);
            }
        };
    }, [selectedDevice, isActive, autoRefresh, isTestRunning, allowActionsDuringTest, forceEnable]);

    // Handle history updates when selectedPid changes or processes update
    useEffect(() => {
        if (!selectedPid) {
            setProcessHistory([]);
            return;
        }

        const selectedProcess = processes.find(p => p.pid === selectedPid);
        if (selectedProcess) {
            setProcessHistory(prev => {
                const newHistory = [...prev, { ...selectedProcess, timestamp: Date.now() }];
                // Keep last 60 ticks (approx 2 minutes if 2s interval)
                if (newHistory.length > 60) return newHistory.slice(newHistory.length - 60);
                return newHistory;
            });
        }
    }, [processes, selectedPid]);

    // Derived sorted processes
    const sortedProcesses = useMemo(() => {
        const sorted = [...processes];
        sorted.sort((a, b) => {
            let valA: string | number = sortField === "name" ? a.command.toLowerCase() : (a[sortField as keyof ProcessStat] as string | number);
            let valB: string | number = sortField === "name" ? b.command.toLowerCase() : (b[sortField as keyof ProcessStat] as string | number);

            if (valA < valB) return sortDirection === "asc" ? -1 : 1;
            if (valA > valB) return sortDirection === "asc" ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [processes, sortField, sortDirection]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortDirection("desc"); // Default to desc for numbers (e.g., cpu, mem)
        }
    };

    return {
        processes: sortedProcesses,
        error,
        sortField,
        sortDirection,
        handleSort,
        selectedPid,
        setSelectedPid,
        processHistory,
    };
}

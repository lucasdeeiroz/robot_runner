import { useEffect, useRef } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";

interface RunConsoleProps {
    logs: string[];
    isRunning?: boolean;
}

export function RunConsole({ logs, isRunning }: RunConsoleProps) {
    const { t } = useTranslation();
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs]);

    const openLink = async (path: string) => {
        try {
            await invoke('open_log_folder', { path });
        } catch (e) {
            console.error("Failed to open link", e);
        }
    };

    const renderLogLine = (log: string, i: number) => {
        // Check for specific Robot Framework output patterns: "Output: list/path..."
        // Regex to capture "Type:  Path"
        const linkMatch = log.match(/^(Output|Log|Report):\s+(.*)$/);

        if (linkMatch) {
            const label = linkMatch[1]; // Output, Log, or Report
            const path = linkMatch[2].trim();
            return (
                <div key={i} className="mb-0.5">
                    <span className="text-zinc-300">{label}: </span>
                    <span
                        onClick={() => openLink(path)}
                        className="text-blue-400 hover:text-blue-300 cursor-pointer hover:underline"
                        title="Open File"
                    >
                        {path}
                    </span>
                </div>
            );
        }

        return (
            <div key={i} className={clsx(
                "whitespace-pre-wrap break-all leading-tight mb-0.5",
                log.includes("[Error]") || log.includes("STDERR") ? "text-red-400" :
                    log.includes("[System]") ? "text-blue-400 font-semibold" :
                        log.includes("PASS") ? "text-green-400" :
                            log.includes("FAIL") ? "text-red-500 font-bold" :
                                "text-zinc-300"
            )}>
                {log}
            </div>
        );
    };

    return (
        <div className="h-full bg-black/90 rounded-lg p-4 font-mono text-sm overflow-auto border border-zinc-800 shadow-inner">
            {logs.length === 0 && (
                <div className="text-zinc-500 italic opacity-50 select-none">{t('console.waiting')}</div>
            )}
            {logs.map((log, i) => renderLogLine(log, i))}
            {isRunning && (
                <div className="animate-pulse text-blue-500 mt-2">_</div>
            )}
            <div ref={bottomRef} />
        </div>
    );
}


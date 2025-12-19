import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface RunConsoleProps {
    logs: string[];
}

export function RunConsole({ logs }: RunConsoleProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div className="bg-black/90 rounded-lg border border-zinc-800 font-mono text-sm h-[500px] flex flex-col shadow-inner">
            <div className="p-2 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
                <span className="text-zinc-400 text-xs">Console Output</span>
                <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/50" />
                </div>
            </div>

            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar"
            >
                {logs.length === 0 && (
                    <div className="text-zinc-600 italic">Waiting for test execution...</div>
                )}
                {logs.map((log, i) => {
                    let colorClass = "text-zinc-300";
                    if (log.includes("PASS")) colorClass = "text-green-400";
                    if (log.includes("FAIL") || log.includes("Error") || log.includes("STDERR")) colorClass = "text-red-400";
                    if (log.includes("WARN")) colorClass = "text-yellow-400";

                    return (
                        <div key={i} className={cn("break-words whitespace-pre-wrap", colorClass)}>
                            {log}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

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

    <div className="bg-zinc-50 dark:bg-black/90 rounded-xl border border-zinc-200 dark:border-zinc-800 font-mono text-sm h-[500px] flex flex-col shadow-inner transition-colors duration-300">
        <div className="p-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/50 flex justify-between items-center rounded-t-xl transition-colors duration-300">
            <span className="text-zinc-500 dark:text-zinc-400 text-xs font-semibold tracking-wide">Console Output</span>
            <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400/20 border border-red-400/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/20 border border-yellow-400/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-400/20 border border-green-400/50" />
            </div>
        </div>

        <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar"
        >
            {logs.length === 0 && (
                <div className="text-zinc-400 dark:text-zinc-600 italic">Waiting for test execution...</div>
            )}
            {logs.map((log, i) => {
                let colorClass = "text-zinc-700 dark:text-zinc-300";
                if (log.includes("PASS")) colorClass = "text-green-600 dark:text-green-400";
                if (log.includes("FAIL") || log.includes("Error") || log.includes("STDERR")) colorClass = "text-red-600 dark:text-red-400";
                if (log.includes("WARN")) colorClass = "text-yellow-600 dark:text-yellow-400";

                return (
                    <div key={i} className={cn("break-words whitespace-pre-wrap transition-colors duration-0", colorClass)}>
                        {log}
                    </div>
                );
            })}
        </div>
    </div>
}

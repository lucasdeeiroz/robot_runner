import { Bot } from "lucide-react";
import clsx from "clsx";

interface AndroidVersionPillProps {
    version: string | null | undefined;
    className?: string; // Allow external styling overrides/positioning
}

export function AndroidVersionPill({ version, className }: AndroidVersionPillProps) {
    if (!version) return null;

    return (
        <div 
            className={clsx(
                "flex items-center gap-1 text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full",
                className
            )} 
            title={`Android ${version}`}
        >
            <Bot size={12} className="text-zinc-400" />
            <span>{version}</span>
        </div>
    );
}

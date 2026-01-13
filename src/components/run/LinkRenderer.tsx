import { invoke } from "@tauri-apps/api/core";
import clsx from "clsx";
import { feedback } from "@/lib/feedback";

interface LinkRendererProps {
    content: string;
}

export function LinkRenderer({ content }: LinkRendererProps) {
    const openLink = async (path: string) => {
        try {
            await invoke('open_log_folder', { path });
        } catch (e) {
            feedback.toast.error("common.errors.open_link_failed", e);
        }
    };

    const linkMatch = content.match(/^(Output|Log|Report):\s+(.*)$/);

    if (linkMatch) {
        const label = linkMatch[1];
        const path = linkMatch[2].trim();
        return (
            <div className="mb-0.5 pl-4">
                <span className="text-zinc-500">{label}: </span>
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
        <div className={clsx(
            "whitespace-pre-wrap break-all leading-tight mb-0.5",
            content.includes("[Error]") || content.includes("STDERR") ? "text-red-400" :
                content.includes("[System]") ? "text-blue-400 font-semibold" :
                    "text-zinc-600 dark:text-zinc-300"
        )}>
            {content}
        </div>
    );
}

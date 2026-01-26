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
                <span className="text-on-surface-variant/80">{label}: </span>
                <span
                    onClick={() => openLink(path)}
                    className="text-primary hover:underline cursor-pointer"
                    title="Open File"
                >
                    {path}
                </span>
            </div>
        );
    }

    return (
        <div className={clsx(
            "on-primaryspace-pre-wrap break-all leading-tight mb-0.5",
            content.includes("[Error]") || content.includes("STDERR") ? "text-error" :
                content.includes("[System]") ? "text-primary font-semibold" :
                    "text-on-surface/80"
        )}>
            {content}
        </div>
    );
}

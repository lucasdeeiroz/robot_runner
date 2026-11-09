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
                    className="text-primary dark:text-primary/80 hover:underline cursor-pointer"
                    title="Open File"
                >
                    {path}
                </span>
            </div>
        );
    }

    const trimmed = content.trim();

    // RRT Action item formatting (e.g. -> Click: ..., -> Launching Application: ...)
    if (trimmed.startsWith('->')) {
        const actionText = trimmed.replace(/^->\s*/, '');
        const isError = actionText.includes('failed') || actionText.includes('Error') || actionText.includes('Verification failed');
        const isSuccess = actionText.includes('verified') || actionText.includes('Passed');

        return (
            <div className={clsx(
                "flex items-center gap-2 py-1 px-3 my-0.5 rounded-lg text-xs font-mono transition-colors",
                isError ? "bg-error/10 text-error border border-error/20 font-semibold" :
                isSuccess ? "bg-success/10 text-success border border-success/20 font-medium" :
                "bg-surface-variant/20 text-on-surface-variant hover:bg-surface-variant/30"
            )}>
                <span className={clsx(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    isError ? "bg-error" : isSuccess ? "bg-success" : "bg-primary/60"
                )} />
                <span className="break-all">{actionText}</span>
            </div>
        );
    }

    return (
        <div className={clsx(
            "on-primaryspace-pre-wrap break-all leading-tight mb-0.5",
            content.includes("[Error]") || content.includes("STDERR") ? "text-error" :
                content.includes("[System]") ? "text-primary dark:text-primary/80 font-semibold" :
                    "text-on-surface/80"
        )}>
            {content}
        </div>
    );
}

import { Terminal } from "lucide-react";

interface CommandsSubTabProps {
    selectedDevice: string;
}

export function CommandsSubTab({ selectedDevice }: CommandsSubTabProps) {
    if (!selectedDevice) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400">
                <Terminal size={48} className="mb-4 opacity-20" />
                <p>Select a device to execute commands</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col space-y-4">
            <div className="flex items-center gap-2 text-zinc-500">
                <Terminal size={20} />
                <span className="font-medium">ADB Commands</span>
            </div>

            <div className="flex-1 bg-zinc-50 dark:bg-black/20 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 flex items-center justify-center">
                <p className="text-zinc-400 italic">Command execution panel coming soon...</p>
            </div>
        </div>
    );
}

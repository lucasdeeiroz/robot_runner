import { FileText, Smartphone } from "lucide-react";

export function TestTab() {
    return (
        <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-4">
            <div className="flex gap-4">
                <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex flex-col items-center w-32">
                    <FileText size={32} className="mb-2 text-blue-500" />
                    <span className="font-medium">Logs</span>
                </div>
                <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex flex-col items-center w-32">
                    <Smartphone size={32} className="mb-2 text-purple-500" />
                    <span className="font-medium">Device Logcat</span>
                </div>
            </div>
            <p className="text-lg">Results & Monitoring Dashboard</p>
            <p className="text-sm opacity-70">Implementation pending (Output XML parsing & Per-device Console)</p>
        </div>
    );
}

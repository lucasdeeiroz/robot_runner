import { Smartphone, Battery, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Device {
    udid: string;
    model: string;
    state: string;
    product?: string;
}

interface DeviceCardProps {
    device: Device;
    onClick?: () => void;
}

export function DeviceCard({ device, onClick }: DeviceCardProps) {
    const isOnline = device.state === 'device';

    return (
        <div
            onClick={isOnline ? onClick : undefined}
            className={cn(
                "p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 transition-all duration-300",
                isOnline
                    ? "hover:border-blue-500/50 hover:bg-zinc-900 hover:shadow-lg hover:shadow-blue-900/10 cursor-pointer group"
                    : "opacity-60 cursor-not-allowed"
            )}
        >
            <div className="flex items-start justify-between mb-4">
                <div className={cn(
                    "p-3 rounded-full bg-zinc-800 transition-colors",
                    isOnline && "group-hover:bg-blue-500/10 group-hover:text-blue-400"
                )}>
                    <Smartphone size={24} />
                </div>
                <div className="flex items-center gap-2">
                    {isOnline && <Wifi size={16} className="text-zinc-500" />}
                    <Battery size={16} className="text-zinc-500" />
                </div>
            </div>

            <div>
                <h3 className="font-semibold text-lg text-white mb-1 truncate" title={device.model}>
                    {device.model}
                </h3>
                <p className="text-xs text-zinc-500 font-mono mb-2">{device.udid}</p>

                <div className="flex items-center gap-2">
                    <span className={cn(
                        "w-2 h-2 rounded-full",
                        isOnline ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-red-500"
                    )} />
                    <span className="text-xs text-zinc-400 capitalize">{device.state}</span>
                </div>
            </div>
        </div>
    );
}

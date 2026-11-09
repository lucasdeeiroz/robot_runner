import { useState, useEffect } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { feedback } from '@/lib/feedback';

interface CustomLogoProps {
    path: string;
    className?: string;
}

export function CustomLogo({ path, className }: CustomLogoProps) {
    const [src, setSrc] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        setSrc(null);
        setError(null);

        async function load() {
            try {
                if (!path) {
                    throw new Error("Empty path");
                }

                // If path is already a data URI (Base64), use it directly
                if (path.startsWith('data:')) {
                    if (active) setSrc(path);
                    return;
                }

                // Try reading with the exact path first
                let data: Uint8Array | null = null;
                let lastError: any = null;

                try {
                    data = await readFile(path);
                } catch (e) {
                    lastError = e;
                    // If explicit path fails, try force-converting to Windows backslashes
                    if (path.includes('/')) {
                        try {
                            const winPath = path.replace(/\//g, '\\');
                            data = await readFile(winPath);
                        } catch (e2) {
                            lastError = e2;
                        }
                    }
                }

                if (!data) throw lastError;

                // Convert to Base64
                const uint8Array = new Uint8Array(data);
                let binaryString = '';
                const chunkSize = 8192;
                for (let i = 0; i < uint8Array.length; i += chunkSize) {
                    const chunk = uint8Array.subarray(i, i + chunkSize);
                    binaryString += String.fromCharCode.apply(null, Array.from(chunk));
                }
                const base64 = btoa(binaryString);

                const ext = path.split('.').pop()?.toLowerCase();
                const mime = ext === 'svg' ? 'image/svg+xml' : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png';

                if (active) setSrc(`data:${mime};base64,${base64}`);
            } catch (e: any) {
                const msg = e instanceof Error ? e.message : String(e);
                feedback.toast.error("components.logo.load_error", msg);
                // Simplify error message for UI but include path hint
                if (active) setError(`${msg} (${path})`);
            }
        }

        load();

        return () => { active = false; };
    }, [path]);

    if (error) return <span className="text-[10px] text-error font-mono break-all px-2" title={error}>{error}</span>;
    if (!src) return <span className="text-xs text-on-surface-variant/80 animate-pulse px-2">Loading...</span>;
    return <img src={src} alt="Logo" className={className || "h-8 object-contain"} />;
}

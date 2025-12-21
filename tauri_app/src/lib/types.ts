
export interface Device {
    udid: string;
    model: string;
    state?: string;
    is_emulator?: boolean;
    android_version?: string | null; // Added field
}

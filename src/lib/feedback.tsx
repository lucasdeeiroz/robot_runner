import { toast } from 'sonner';
import { sendNotification, isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import i18next from 'i18next';
import { ExpandableToast, ToastType } from '@/components/molecules/ExpandableToast';

// Helper to extract details from args if it's an Error or object with message
const extractDetails = (args: any): string | null => {
    if (!args) return null;
    if (args instanceof Error) {
        return args.stack || args.message;
    }
    if (typeof args === 'object') {
        if (args.details && typeof args.details === 'string') return args.details;
        if (args.message && typeof args.message === 'string') return args.message;
        if (args.error && typeof args.error === 'string') return args.error;
        if (args.err && typeof args.err === 'string') return args.err;
    }
    if (typeof args === 'string') return args;
    return null;
};

// Helper to render custom toast
const showCustomToast = (type: ToastType, msg: string, args?: any) => {
    const details = extractDetails(args);
// Extend timeout to 10 seconds for error toasts that include details.
// Sonner pauses the timer automatically while the mouse is over the toast.
    const duration = (type === 'error' && details) ? 10000 : undefined;

    return toast.custom((t) => (
        <ExpandableToast 
            type={type} 
            title={msg} 
            details={details} 
            onClose={() => toast.dismiss(t)} 
        />
    ), { duration });
};

export const feedback = {
    // Trivial In-App Feedback (Toasts)
    toast: {
        success: (msgKey: string, args?: any) => showCustomToast('success', i18next.t(msgKey, args) as string, args),
        error: (msgKey: string, args?: any) => showCustomToast('error', i18next.t(msgKey, args) as string, args),
        info: (msgKey: string, args?: any) => showCustomToast('info', i18next.t(msgKey, args) as string, args),
        loading: (msgKey: string, args?: any) => showCustomToast('loading', i18next.t(msgKey, args) as string, args),
        dismiss: (id?: string | number) => toast.dismiss(id),
        // Raw string support if needed (for dynamic messages not in i18n)
        raw: {
            success: (msg: string, details?: any) => showCustomToast('success', msg, details),
            error: (msg: string, details?: any) => showCustomToast('error', msg, details),
            info: (msg: string, details?: any) => showCustomToast('info', msg, details),
            loading: (msg: string, details?: any) => showCustomToast('loading', msg, details),
        }
    },

    // Important System Feedback (Notifications)
    notify: async (titleKey: string, bodyKey: string, bodyArgs?: any) => {
        let permission = await isPermissionGranted();
        if (!permission) {
            const permissionRequested = await requestPermission();
            permission = permissionRequested === 'granted';
        }

        if (permission) {
            sendNotification({
                title: i18next.t(titleKey) as string,
                body: i18next.t(bodyKey, bodyArgs) as string
            });
        }
    }
};

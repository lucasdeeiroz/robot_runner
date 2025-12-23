import { toast } from 'sonner';
import { sendNotification, isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import i18next from 'i18next';

export const feedback = {
    // Trivial In-App Feedback (Toasts)
    toast: {
        success: (msgKey: string, options?: any) => toast.success(i18next.t(msgKey) as string, options),
        error: (msgKey: string, options?: any) => toast.error(i18next.t(msgKey) as string, options),
        info: (msgKey: string, options?: any) => toast.info(i18next.t(msgKey) as string, options),
        loading: (msgKey: string, options?: any) => toast.loading(i18next.t(msgKey) as string, options),
        dismiss: (id: string | number) => toast.dismiss(id),
        // Raw string support if needed (for dynamic messages not in i18n)
        raw: {
            success: (msg: string) => toast.success(msg),
            error: (msg: string) => toast.error(msg),
            info: (msg: string) => toast.info(msg),
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

import { useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { join } from '@tauri-apps/api/path';
import { AppSettings, useSettings } from '@/lib/settings';
import { feedback } from '@/lib/feedback';
import { useTranslation } from 'react-i18next';

interface UseFileSaveOptions {
    fileType: string;         // e.g. 'Image', 'Video', 'Log'
    extensions: string[];     // e.g. ['png'], ['mp4'], ['txt']
    defaultNamePrefix: string; // e.g. 'screenshot', 'recording'
    settingPathKey?: keyof AppSettings['paths']; // Optional key to check in settings for auto-save path
}

export function useFileSave({ fileType, extensions, defaultNamePrefix, settingPathKey }: UseFileSaveOptions) {
    const { settings } = useSettings();
    const { t } = useTranslation();
    const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const generateFilename = () => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        return `${defaultNamePrefix}_${timestamp}.${extensions[0]}`;
    };

    /**
     * Handles the file save flow.
     * @param actionCallback - Async function that performs the actual write/save using the determined path.
     * @param successMessageKey - Optional i18n key for success toast.
     */
    const saveFile = async (
        actionCallback: (path: string) => Promise<void>,
        successMessageKey: string = 'feedback.saved'
    ): Promise<string | null> => {
        setIsSaving(true);
        try {
            const filename = generateFilename();
            let filePath: string | null = null;

            // 1. Check Auto-Save Path
            if (settingPathKey && settings.paths[settingPathKey] && settings.paths[settingPathKey].trim() !== '') {
                try {
                    filePath = await join(settings.paths[settingPathKey], filename);
                } catch (e) {
                    console.warn("Failed to join auto-save path", e);
                }
            }

            // 2. Fallback to Dialog
            if (!filePath) {
                filePath = await save({
                    filters: [{ name: fileType, extensions }],
                    defaultPath: filename
                });
            }

            // 3. Execute Action
            if (filePath) {
                await actionCallback(filePath);
                setLastSavedPath(filePath);
                feedback.toast.success(successMessageKey);
                // Optionally notify generic 'saved to' if needed, but feedback component usually handles display
                return filePath;
            }
        } catch (e) {
            console.error(`Failed to save ${fileType}`, e);
            feedback.toast.error(`${t('common.error_occurred')}: ${e}`);
        } finally {
            setIsSaving(false);
        }
        return null;
    };

    const clearFeedback = () => setLastSavedPath(null);

    return {
        saveFile,
        lastSavedPath,
        isSaving,
        clearFeedback
    };
}

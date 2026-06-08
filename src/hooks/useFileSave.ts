import { useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { join, dirname } from '@tauri-apps/api/path';
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
    const { settings, updateSetting } = useSettings();
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
            if (settingPathKey) {
                const autoSaveBasePath = settings.paths?.[settingPathKey];
                if (autoSaveBasePath && autoSaveBasePath.trim() !== '') {
                    try {
                        filePath = await join(autoSaveBasePath, filename);
                    } catch (e) {
                        console.warn("Failed to join auto-save path", e);
                    }
                }
            }

            // 2. Fallback to Dialog
            let dialogUsed = false;
            if (!filePath) {
                filePath = await save({
                    filters: [{ name: fileType, extensions }],
                    defaultPath: filename
                });
                if (filePath) dialogUsed = true;
            }

            // 3. Execute Action
            if (filePath) {
                await actionCallback(filePath);

                // 4. Persist Path if chosen via Dialog
                if (dialogUsed && settingPathKey) {
                    try {
                        const newPath = await dirname(filePath);
                        const currentPaths = settings.paths || {};
                        await updateSetting('paths', {
                            ...currentPaths,
                            [settingPathKey]: newPath
                        });
                        feedback.toast.success('settings_page.path_auto_updated', { path: newPath });
                    } catch (e) {
                        console.error("Failed to persist auto-selected path", e);
                    }
                }

                setLastSavedPath(filePath);
                feedback.toast.success(successMessageKey);
                return filePath;
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            let translatedError = errorMessage;
            if (errorMessage.includes("Failed to pull video")) {
                const details = (errorMessage.split("Failed to pull video:")[1] || "").trim();
                translatedError = t("common.failed_to_pull_video") + (details ? `: ${details}` : "");
            } else if (errorMessage.includes("Failed to pull screenshot from device")) {
                const details = (errorMessage.split("Failed to pull screenshot from device:")[1] || "").trim();
                translatedError = t("common.failed_to_pull_screenshot") + (details ? `: ${details}` : "");
            }
            feedback.toast.raw.error(t('common.error_occurred', { error: translatedError }));
            throw e;
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

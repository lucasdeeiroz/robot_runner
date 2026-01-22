
import { Input, InputProps } from '../atoms/Input';
import { Button } from '../atoms/Button';
import { FolderOpen } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { feedback } from '@/lib/feedback';
import { useTranslation } from 'react-i18next';

interface PathInputProps extends Omit<InputProps, 'onChange' | 'onSelect'> {
    value: string;
    onSelect: (path: string) => void;
    dialogTitle?: string;
    directory?: boolean;
    extensions?: string[];
}

export function PathInput({
    value,
    onSelect,
    dialogTitle,
    directory = true,
    extensions,
    disabled,
    ...props
}: PathInputProps) {
    const { t } = useTranslation();

    const handleBrowse = async () => {
        try {
            const selected = await open({
                title: dialogTitle,
                directory,
                multiple: false,
                defaultPath: value || undefined,
                filters: extensions ? [{ name: 'Filter', extensions }] : undefined
            });

            if (selected) {
                onSelect(selected as string);
            }
        } catch (err) {
            feedback.toast.error("settings.paths.select_error", err);
        }
    };

    return (
        <div className="flex gap-2 items-end">
            <div className="flex-1">
                <Input
                    {...props}
                    value={value}
                    readOnly
                    disabled={disabled}
                    className="font-mono text-xs sm:text-sm"
                />
            </div>
            <Button
                type="button"
                onClick={handleBrowse}
                disabled={disabled}
                title={t('settings.folder_select')}
                variant="secondary"
                size="icon"
                className="mb-[1px]" // Align visually with input
            >
                <FolderOpen size={16} />
            </Button>
        </div>
    );
}

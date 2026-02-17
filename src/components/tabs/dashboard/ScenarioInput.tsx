
import { useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { useTranslation } from 'react-i18next';
import { Wand2, Eraser } from 'lucide-react';
import clsx from 'clsx';

interface ScenarioInputProps {
    onGenerate: (text: string, language: string) => void;
    onClear: () => void;
    isLoading?: boolean;
}

export function ScenarioInput({ onGenerate, onClear, isLoading = false }: ScenarioInputProps) {
    const { t, i18n } = useTranslation();
    const [input, setInput] = useState('');

    const handleGenerate = () => {
        if (!input.trim()) return;
        onGenerate(input, i18n.language);
    };

    const handleClear = () => {
        setInput('');
        onClear();
    };

    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
                    {t('dashboard.input.title', "Requirements")}
                </h3>
                <div className="flex gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClear}
                        className="text-on-surface-variant hover:text-error"
                        title={t('common.clear')}
                    >
                        <Eraser size={16} />
                    </Button>
                </div>
            </div>

            <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('dashboard.input.placeholder', "Paste your requirements or acceptance criteria here...")}
                className={clsx(
                    "flex-1 w-full bg-surface-variant/30 text-on-surface p-3 rounded-2xl resize-none outline-none border border-transparent focus:border-primary/50 transition-all text-sm font-mono custom-scrollbar",
                    "placeholder:text-on-surface-variant/50"
                )}
            />

            <Button
                variant="primary"
                onClick={handleGenerate}
                disabled={!input.trim() || isLoading}
                leftIcon={!isLoading ? <Wand2 size={16} /> : undefined}
                className="w-full justify-center shadow-lg shadow-primary/20"
            >
                {isLoading ? "Generating..." : t('dashboard.actions.generate', "Generate Scenarios")}
            </Button>
        </div>
    );
}

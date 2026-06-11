import { useState, useEffect, useRef } from 'react';
import { Modal } from '@/components/organisms/Modal';
import { Button } from '@/components/atoms/Button';
import { ScreenMap } from '@/lib/types';
import { processAndEnhanceMaps } from '@/lib/dashboard/enhancerEngine';
import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/lib/settings';
import { Select } from '@/components/atoms/Select';

interface EnhanceMapsModalProps {
    isOpen: boolean;
    onClose: () => void;
    savedMaps: ScreenMap[];
    onEnhanceComplete: (enhancedMaps: ScreenMap[]) => void;
}

export default function EnhanceMapsModal({ isOpen, onClose, savedMaps, onEnhanceComplete }: EnhanceMapsModalProps) {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [logs, setLogs] = useState<{msg: string, time: string}[]>([]);
    const [isComplete, setIsComplete] = useState(false);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [selectedProvider, setSelectedProvider] = useState<string>('gemini');

    // Default to the settings provider when opening
    useEffect(() => {
        if (isOpen) {
            const supported = ['gemini', 'claude', 'openai'];
            if (settings.aiProvider && supported.includes(settings.aiProvider)) {
                setSelectedProvider(settings.aiProvider);
            } else {
                setSelectedProvider('gemini');
            }
        }
    }, [isOpen, settings.aiProvider]);

    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    // Reset when modal opens
    useEffect(() => {
        if (isOpen) {
            setIsEnhancing(false);
            setIsComplete(false);
            setLogs([]);
            abortControllerRef.current = null;
        }
    }, [isOpen]);

    const handleStart = async () => {
        setIsEnhancing(true);
        setIsComplete(false);
        setLogs([]);
        
        abortControllerRef.current = new AbortController();

        try {
            const keys = {
                gemini: selectedProvider === 'gemini' ? settings.geminiApiKey : undefined,
                claude: selectedProvider === 'claude' ? settings.claudeApiKey : undefined,
                openai: selectedProvider === 'openai' ? settings.openaiApiKey : undefined,
                antigravity: selectedProvider === 'antigravity-cli' ? settings.antigravityApiKey : undefined
            };

            const { enhancedMaps } = await processAndEnhanceMaps(
                savedMaps, 
                selectedProvider, 
                keys, 
                (msg: string) => { setLogs(prev => [...prev, { msg, time: new Date().toLocaleTimeString() }]); },
                abortControllerRef.current.signal,
                (k: string, d: string, opts?: any) => t(k, d, opts) as string
            );
            await onEnhanceComplete(enhancedMaps);
            setIsComplete(true);
        } catch (err: any) {
            if (err.name === 'AbortError' || err.message === 'Cancelled by user') {
                setLogs(prev => [...prev, { msg: t('mapper.exploration.cancelled', 'Process cancelled by user.'), time: new Date().toLocaleTimeString() }]);
            } else {
                setLogs(prev => [...prev, { msg: `Critical Error: ${err.message}`, time: new Date().toLocaleTimeString() }]);
            }
        } finally {
            setIsEnhancing(false);
        }
    };

    const handleCancel = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={!isEnhancing ? onClose : () => { }} title={t('mapper.enhancer.title')}>
            <div className="flex flex-col gap-4 min-w-[500px]">
                <p className="text-sm text-on-surface-variant/80">
                    {t('mapper.enhancer.description')}
                </p>

                <div className="bg-surface-variant/20 border border-outline-variant/30 rounded-xl p-3 h-48 overflow-y-auto font-mono text-xs text-on-surface-variant custom-scrollbar flex flex-col gap-1">
                    {logs.length === 0 && !isEnhancing && !isComplete && (
                        <div className="text-on-surface-variant/50 italic h-full flex items-center justify-center">
                            {t('mapper.enhancer.ready', { count: savedMaps.length })}
                        </div>
                    )}
                    {logs.map((log, i) => (
                        <div key={i} className="animate-in fade-in duration-200">
                            <span className="text-primary/70 mr-2">[{log.time}]</span>
                            {log.msg}
                        </div>
                    ))}
                    <div ref={logsEndRef} />
                </div>

                <div className="flex justify-between items-center mt-2">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-on-surface-variant/70">AI Provider:</span>
                        <Select
                            value={selectedProvider}
                            onChange={(e) => setSelectedProvider(e.target.value)}
                            className="h-8 text-xs py-0 w-32 border-outline-variant/30 bg-surface-variant/20 rounded-md"
                            disabled={isEnhancing}
                            dropdownPosition="top"
                            options={[
                                { label: 'Gemini', value: 'gemini' },
                                { label: 'Claude', value: 'claude' },
                                { label: 'OpenAI', value: 'openai' }
                            ]}
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        {isEnhancing ? (
                            <Button variant="ghost" onClick={handleCancel} className="text-error hover:bg-error/10">
                                {t('mapper.enhancer.btn_cancel', { defaultValue: 'Cancel' })}
                            </Button>
                        ) : (
                            <Button variant="ghost" onClick={onClose} disabled={isEnhancing}>
                                {isComplete ? t('mapper.enhancer.btn_close') : t('mapper.enhancer.btn_cancel')}
                            </Button>
                        )}
                        {!isComplete && (
                            <Button
                                variant="primary"
                                onClick={handleStart}
                                disabled={isEnhancing || savedMaps.length === 0}
                                className="gap-2"
                            >
                                {isEnhancing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                {isEnhancing ? t('mapper.enhancer.btn_enhancing') : t('mapper.enhancer.btn_start')}
                            </Button>
                        )}
                        {isComplete && (
                            <Button variant="success" onClick={onClose} className="gap-2 !text-green-950 font-semibold dark:!text-green-950">
                                <CheckCircle2 size={16} /> {t('mapper.enhancer.btn_done')}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

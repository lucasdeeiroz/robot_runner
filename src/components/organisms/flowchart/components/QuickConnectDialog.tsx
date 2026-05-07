import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { GroupedScreenSelect } from '@/components/molecules/GroupedScreenSelect';
import { GroupedElementSelect } from '@/components/molecules/GroupedElementSelect';
import { ScreenMap } from '@/lib/types';

interface QuickConnectDialogProps {
    maps: ScreenMap[];
    sourceNodeId: string;
    onClose: () => void;
    onConfirm: (target: string, element: string) => void;
}

export function QuickConnectDialog({ maps = [], sourceNodeId, onClose, onConfirm }: QuickConnectDialogProps) {
    const { t } = useTranslation();
    const sourceMap = (maps || []).find(m => m.name === sourceNodeId);

    const availableElements = useMemo(() => (sourceMap?.elements || []).filter(el => !el.navigates_to), [sourceMap]);
    const availableTargets = useMemo(() => (maps || []).filter(m => m.name !== sourceNodeId).map(m => m.name), [maps, sourceNodeId]);

    const [selectedElement, setSelectedElement] = useState<string>(availableElements[0]?.name || "");
    const [selectedTarget, setSelectedTarget] = useState<string>(availableTargets[0] || "");

    useEffect(() => {
        if (!selectedElement && availableElements.length > 0) setSelectedElement(availableElements[0].name);
    }, [availableElements, selectedElement]);

    useEffect(() => {
        if (!selectedTarget && availableTargets.length > 0) setSelectedTarget(availableTargets[0]);
    }, [availableTargets, selectedTarget]);

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-surface p-6 rounded-2xl shadow-xl w-96 border border-outline-variant/30" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-semibold mb-4 text-on-surface flex items-center gap-2">
                    <Plus size={20} className="text-primary" />
                    {t('mapper.flowchart.quick_connect', 'Quick Connect')}
                </h3>

                <div className="space-y-4">
                    <div className="space-y-1">
                        <GroupedElementSelect
                            label={t('mapper.flowchart.source_element', 'Source Element')}
                            value={selectedElement}
                            onChange={setSelectedElement}
                            elements={availableElements}
                            disabled={availableElements.length === 0}
                        />
                        {availableElements.length === 0 && (
                            <p className="text-xs text-error">{t('mapper.flowchart.no_elements', 'No unmapped elements available.')}</p>
                        )}
                    </div>

                    <div className="space-y-1">
                        <GroupedScreenSelect
                            label={t('mapper.flowchart.target_screen', 'Target Screen')}
                            value={selectedTarget}
                            onChange={setSelectedTarget}
                            maps={availableTargets
                                .map(name => (maps || []).find(m => m.name === name))
                                .filter((m): m is ScreenMap => m !== undefined)}
                        />
                    </div>

                    <div className="flex justify-end gap-2 mt-6">
                        <Button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-variant/20 rounded-lg">
                            {t('mapper.flowchart.cancel', 'Cancel')}
                        </Button>
                        <Button
                            onClick={() => onConfirm(selectedTarget, selectedElement)}
                            className="px-4 py-2 text-sm bg-primary text-on-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!selectedElement || !selectedTarget}
                        >
                            {t('mapper.flowchart.connect', 'Connect')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

import React from 'react';
import clsx from 'clsx';
import { Pencil, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/atoms/Button';
import { NODE_WIDTH, NODE_HEIGHT } from './types';
import { ScreenMap } from '@/lib/types';

interface FlowNodeProps {
    data: ScreenMap;
    pixel: { x: number, y: number };
    isVisible: boolean;
    isInteracting: boolean;
    isDraggingThis: boolean;
    isDraggingCanvas: boolean;
    onMouseDown: (e: React.MouseEvent) => void;
    onEditScreen?: (name: string) => void;
}

export const FlowNode = React.memo(({
    data,
    pixel,
    isVisible,
    isInteracting,
    isDraggingThis,
    isDraggingCanvas,
    onMouseDown,
    onEditScreen
}: FlowNodeProps) => {
    const { t } = useTranslation();

    if (!isVisible && !isInteracting) return null;

    return (
        <div
            className={clsx(
                "absolute flex flex-col bg-surface border rounded-xl overflow-visible shadow-sm hover:shadow-xl transition-shadow group/card",
                data.type === 'modal' ? 'border-dashed border-tertiary' : 'border-outline-variant/60',
                isDraggingThis ? 'z-[55] ring-2 ring-primary shadow-2xl opacity-90' : 'z-40',
                !isVisible && "opacity-20 pointer-events-none"
            )}
            style={{
                left: pixel.x,
                top: pixel.y,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
                cursor: isDraggingCanvas ? 'move' : 'grab'
            }}
            onMouseDown={onMouseDown}
        >
            {/* Content - Full Card Image */}
            <div className="absolute inset-0 z-0 flex items-center justify-center bg-surface-variant/20 rounded-xl overflow-hidden">
                {data.base64_preview ? (
                    <img
                        src={`data:image/png;base64,${data.base64_preview}`}
                        className="w-full h-full object-contain opacity-90 transition-opacity group-hover/card:opacity-100 placeholder:opacity-100"
                        alt={data.name}
                    />
                ) : (
                    <div className="flex flex-col items-center gap-1">
                        <AlertTriangle className="text-warning h-6 w-6 opacity-80" />
                        <span className="text-[10px] text-on-surface-variant/50">{t('mapper.flowchart.no_preview', 'No Preview')}</span>
                    </div>
                )}
                {/* Type Badge - Top Right */}
                <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white backdrop-blur-sm z-10">
                    {t(`mapper.screen_types.${data.type}`, data.type)}
                </div>
            </div>

            {/* Footer Overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-3 flex flex-col justify-center bg-surface/50 border-t border-outline-variant/10 rounded-b-xl z-20 transition-colors group-hover/card:bg-surface/70">
                <div className="flex items-center justify-between gap-2 pointer-events-auto">
                    <h3 className="font-semibold text-sm text-on-surface truncate" title={data.name}>
                        {data.name}
                    </h3>
                    {onEditScreen && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEditScreen(data.name);
                            }}
                            className="p-1.5 hover:bg-primary/10 text-on-surface-variant hover:text-primary rounded-full transition-all"
                            title={t('mapper.action.edit')}
                        >
                            <Pencil size={14} />
                        </Button>
                    )}
                </div>
                <div className="text-xs text-on-surface-variant/70 mt-1 pointer-events-auto">
                    {t('mapper.elements_mapped_count', { count: data.elements.length })}
                </div>
            </div>
        </div>
    );
}, (prev, next) => {
    // Custom comparison to ensure stability
    return (
        prev.pixel.x === next.pixel.x &&
        prev.pixel.y === next.pixel.y &&
        prev.isVisible === next.isVisible &&
        prev.isInteracting === next.isInteracting &&
        prev.isDraggingThis === next.isDraggingThis &&
        prev.isDraggingCanvas === next.isDraggingCanvas &&
        prev.data.elements.length === next.data.elements.length &&
        prev.data.base64_preview === next.data.base64_preview
    );
});

FlowNode.displayName = 'FlowNode';

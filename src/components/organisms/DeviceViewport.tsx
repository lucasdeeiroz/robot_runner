
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Maximize } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { InspectorNode, getHighlighterStyle } from '@/lib/inspectorUtils';
import { Button } from '@/components/atoms/Button';
import { ExpressiveLoading } from '@/components/atoms/ExpressiveLoading';
import { GestureOverlay } from '@/components/molecules/GestureOverlay';

interface DeviceViewportProps {
    screenshot: string | null;
    loading: boolean;
    imgRef: React.RefObject<HTMLImageElement | null>;
    imgLayout: { width: number, height: number, naturalWidth: number, naturalHeight: number } | null;
    onImgLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;

    // Nodes for Highlighting
    hoveredNode: InspectorNode | null;
    selectedNode: InspectorNode | null;
    searchResults?: InspectorNode[];

    // Interactions
    taps: { id: number, x: number, y: number }[];
    swipes: { id: number, startX: number, startY: number, endX: number, endY: number }[];

    // Handlers
    onRefresh: () => void;
    handlers: {
        onMouseMove: (e: React.MouseEvent<HTMLImageElement>) => void;
        onMouseDown: (e: React.MouseEvent<HTMLImageElement>) => void;
        onMouseUp: (e: React.MouseEvent<HTMLImageElement>) => void;
        onDoubleClick: (e: React.MouseEvent<HTMLImageElement>) => void;
    };

    // Customization
    hoverColor?: string;
    selectionColor?: string;
    searchColor?: string;
    maxHeight?: string;
    className?: string;
}

export const DeviceViewport: React.FC<DeviceViewportProps> = ({
    screenshot,
    loading,
    imgRef,
    imgLayout,
    onImgLoad,
    hoveredNode,
    selectedNode,
    searchResults = [],
    taps,
    swipes,
    onRefresh,
    handlers,
    hoverColor = '#60a5fa',
    selectionColor = '#ef4444',
    searchColor = '#22c55e',
    maxHeight = '650px',
    className
}) => {
    const { t } = useTranslation();

    if (!screenshot) {
        return (
            <div className={clsx("flex flex-col items-center justify-center min-h-[300px]", className)}>
                {loading ? (
                    <ExpressiveLoading size="lg" variant="circular" className="mb-2" />
                ) : (
                    <Maximize size={32} className="mb-2 opacity-50 text-on-surface" />
                )}
                <p className="text-on-surface/80">
                    {loading ? t('common.loading') : t('inspector.no_screenshot')}
                </p>
            </div>
        );
    }

    return (
        <div className={clsx("relative inline-block shadow-2xl rounded-lg border border-outline-variant/30 flex-shrink-0 overflow-hidden group/screen", className)}>
            {/* Camera-cutout style Refresh Button */}
            <AnimatePresence mode="wait">
                {loading ? (
                    <Button
                        key="loading-btn"
                        initial={{ scaleX: 0.2, opacity: 1, x: "-50%" }}
                        animate={{ scaleX: 1, opacity: 1, x: "-50%" }}
                        exit={{ scaleX: 0.2, opacity: 1, x: "-50%" }}
                        transition={{ type: false }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onRefresh();
                        }}
                        disabled={loading}
                        className={clsx(
                            "absolute top-0.5 left-1/2 z-[60] w-auto h-6 rounded-full text-[10px]",
                            "bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center",
                            "text-white/80 hover:text-white hover:bg-black/80 transition-all shadow-lg",
                            "cursor-wait"
                        )}
                        title={t('inspector.refresh')}
                        leftIcon={<RefreshCw size={12} className="animate-spin" />}
                    >
                        {t('common.loading')}
                    </Button>
                ) : (
                    <motion.button
                        key="static-btn"
                        initial={{ scaleX: 3, opacity: 1, x: "-50%" }}
                        animate={{ scaleX: 1, opacity: 1, x: "-50%" }}
                        exit={{ scaleX: 3, opacity: 1, x: "-50%" }}
                        transition={{ type: false }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onRefresh();
                        }}
                        className={clsx(
                            "absolute top-0.5 left-1/2 z-[60] w-6 h-6 rounded-full",
                            "bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center",
                            "text-white/80 hover:text-white hover:bg-black/80 transition-all shadow-lg"
                        )}
                        title={t('inspector.refresh')}
                    >
                        <RefreshCw size={12} />
                    </motion.button>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {loading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 z-50 pointer-events-none"
                    >
                        <GestureOverlay />
                    </motion.div>
                )}
            </AnimatePresence>

            <img
                ref={imgRef}
                src={`data:image/png;base64,${screenshot}`}
                alt="Device Screenshot"
                className="block w-auto h-auto max-w-full select-none rounded-lg"
                style={{ maxHeight }}
                onLoad={onImgLoad}
                onMouseMove={handlers.onMouseMove}
                onMouseDown={handlers.onMouseDown}
                onMouseUp={handlers.onMouseUp}
                onDoubleClick={handlers.onDoubleClick}
                draggable={false}
            />

            {/* Animation Layers - Taps */}
            {taps.map(tap => (
                <motion.div
                    key={tap.id}
                    initial={{ scale: 0.5, opacity: 1 }}
                    animate={{ scale: 2, opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="absolute rounded-full bg-primary/30 border-2 border-primary pointer-events-none"
                    style={{ left: tap.x - 20, top: tap.y - 20, width: 40, height: 40 }}
                />
            ))}

            {/* Animation Layers - Swipes (Advanced SVG) */}
            {swipes.map(swipe => (
                <motion.svg 
                    key={swipe.id} 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute top-0 left-0 w-full h-full pointer-events-none z-30"
                >
                    <defs>
                        <marker id={`arrow-${swipe.id}`} markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                            <path d="M0,0 L0,6 L9,3 z" fill="#f97316" />
                        </marker>
                    </defs>
                    <motion.line
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.3 }}
                        x1={swipe.startX} y1={swipe.startY}
                        x2={swipe.endX} y2={swipe.endY}
                        stroke="#f97316"
                        strokeWidth="4"
                        strokeDasharray="8 4"
                        markerEnd={`url(#arrow-${swipe.id})`}
                        className="animate-pulse"
                    />
                </motion.svg>
            ))}

            {/* Highlighters */}
            <AnimatePresence>
                {searchResults.map(node => (
                    <motion.div
                        key={node.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute border-2 pointer-events-none z-30"
                        style={getHighlighterStyle(node, searchColor, imgLayout)}
                    />
                ))}
            </AnimatePresence>

            <motion.div
                initial={false}
                animate={hoveredNode?.bounds ? {
                    ...getHighlighterStyle(hoveredNode, hoverColor, imgLayout),
                    opacity: 1,
                } as any : { opacity: 0 }}
                className="absolute border-2 pointer-events-none z-10"
                style={{ display: hoveredNode?.bounds ? 'block' : 'none' }}
            />

            <motion.div
                initial={false}
                animate={selectedNode?.bounds ? {
                    ...getHighlighterStyle(selectedNode, selectionColor, imgLayout),
                    opacity: 1,
                    scale: [1, 1.02, 1],
                } as any : { opacity: 0 }}
                transition={{ 
                    scale: { repeat: Infinity, duration: 2, ease: "easeInOut" },
                    default: { duration: 0.15 }
                }}
                className="absolute border-2 pointer-events-none z-20"
                style={{ display: selectedNode?.bounds ? 'block' : 'none' }}
            />
        </div>
    );
};

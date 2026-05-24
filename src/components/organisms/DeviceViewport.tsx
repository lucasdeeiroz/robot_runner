import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Maximize, Scan, Globe } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { InspectorNode, getHighlighterStyle } from '@/lib/inspectorUtils';
import { Button } from '@/components/atoms/Button';
import { ExpressiveLoading } from '@/components/atoms/ExpressiveLoading';
import { GestureOverlay } from '@/components/molecules/GestureOverlay';
import { useSettings } from '@/lib/settings';

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
    onRefresh: (forceClear?: boolean, targetWebUrl?: string) => void;
    handlers: {
        onMouseMove: (e: React.MouseEvent<HTMLImageElement>) => void;
        onMouseDown: (e: React.MouseEvent<HTMLImageElement>) => void;
        onMouseUp: (e: React.MouseEvent<HTMLImageElement>) => void;
        onDoubleClick: (e: React.MouseEvent<HTMLImageElement>) => void;
    };

    // Customization
    isExploring?: boolean;
    hoverColor?: string;
    selectionColor?: string;
    searchColor?: string;
    maxHeight?: string;
    className?: string;
    isWeb?: boolean;
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
    isExploring = false,
    hoverColor = '#60a5fa',
    selectionColor = '#ef4444',
    searchColor = '#22c55e',
    maxHeight = '650px',
    className,
    isWeb: isWebOverride
}) => {
    const { t } = useTranslation();
    const { is_test_mode, activeWebUrl, setActiveWebUrl } = useSettings();
    const isWeb = isWebOverride !== undefined ? isWebOverride : is_test_mode === 'web';

    const [urlInput, setUrlInput] = React.useState(activeWebUrl);

    React.useEffect(() => {
        setUrlInput(activeWebUrl);
    }, [activeWebUrl]);

    const handleUrlSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        let formattedUrl = urlInput.trim();
        if (formattedUrl) {
            if (!/^https?:\/\//i.test(formattedUrl)) {
                formattedUrl = 'https://' + formattedUrl;
            }
            setActiveWebUrl(formattedUrl);
            setUrlInput(formattedUrl);
            onRefresh(true, formattedUrl);
        }
    };

    if (!screenshot) {
        if (isWeb) {
            return (
                <div className={clsx(
                    "flex flex-col w-full bg-surface border border-outline-variant/30 rounded-2xl overflow-hidden shadow-2xl transition-all",
                    className
                )}>
                    {/* Mock Browser Header */}
                    <div className="flex items-center gap-4 px-4 py-3 bg-surface-variant/40 border-b border-outline-variant/20 select-none">
                        {/* Window Controls */}
                        <div className="flex items-center gap-1.5 shrink-0">
                            <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                        </div>

                        {/* Navigation Buttons */}
                        <div className="flex items-center gap-2 text-on-surface/60 shrink-0">
                            <button 
                                onClick={() => onRefresh(true)}
                                disabled={loading}
                                className="p-1 hover:bg-surface-variant/50 rounded transition text-on-surface disabled:opacity-50"
                                title={t('inspector.refresh', 'Refresh Viewport')}
                            >
                                <RefreshCw size={14} className={clsx(loading && "animate-spin")} />
                            </button>
                        </div>

                        {/* Address Bar */}
                        <form onSubmit={handleUrlSubmit} className="flex-1 max-w-2xl mx-auto w-full">
                            <div className="flex items-center gap-2 bg-surface px-3 py-1.5 rounded-xl border border-outline-variant/30 text-xs text-on-surface-variant shadow-inner focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                                <Globe size={12} className="text-primary shrink-0" />
                                <input
                                    type="text"
                                    value={urlInput}
                                    onChange={(e) => setUrlInput(e.target.value)}
                                    className="bg-transparent border-none outline-none w-full text-on-surface text-xs py-0"
                                    placeholder={t('run_tab.web.enter_url', 'Enter target website URL...')}
                                />
                                <button
                                    type="submit"
                                    className="px-2 py-0.5 bg-primary/10 hover:bg-primary/20 text-primary font-medium rounded text-[10px] transition-all"
                                >
                                    Go
                                </button>
                            </div>
                        </form>

                        {/* Quick status indicator */}
                        <div className="flex items-center gap-2 shrink-0 select-none">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">LIVE</span>
                        </div>
                    </div>

                    {/* Screenshot viewport body placeholder */}
                    <div className="relative bg-black/5 overflow-auto flex items-center justify-center p-6 text-center select-none shadow-inner" style={{ minHeight: '400px' }}>
                        {loading && (
                            <div className="absolute inset-0 bg-surface/30 backdrop-blur-[2px] z-50 flex items-center justify-center pointer-events-none">
                                <ExpressiveLoading size="lg" variant="circular" />
                            </div>
                        )}
                        <div className="flex flex-col items-center max-w-md p-6">
                            <Globe size={48} className="text-primary/60 mb-4 animate-pulse" />
                            <h3 className="text-lg font-semibold text-on-surface/90 mb-1">
                                {loading ? t('run_tab.web.starting', 'Initializing Web Browser...') : t('run_tab.web.waiting', 'Web Execution Monitor')}
                            </h3>
                            <p className="text-sm text-on-surface-variant">
                                {loading 
                                    ? t('run_tab.web.starting_desc', 'Setting up environment and launching target browser.') 
                                    : t('run_tab.web.waiting_desc', 'Enter a URL in the address bar above and press Go to initialize the visual inspector.')
                                }
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className={clsx("flex flex-col items-center justify-center min-h-[300px]", className)}>
                {loading ? (
                    <ExpressiveLoading size="lg" variant="circular" className="mb-2" />
                ) : (
                    <Maximize size={32} className="mb-2 opacity-50 text-on-surface" />
                )}
                <p className="text-on-surface/80">
                    {loading ? t('common.loading') : t('inspector.status.no_screenshot')}
                </p>
            </div>
        );
    }

    if (isWeb) {
        return (
            <div className={clsx(
                "flex flex-col w-full bg-surface border border-outline-variant/30 rounded-2xl overflow-hidden shadow-2xl transition-all",
                className
            )}>
                {/* Mock Browser Header */}
                <div className="flex items-center gap-4 px-4 py-3 bg-surface-variant/40 border-b border-outline-variant/20 select-none">
                    {/* Window Controls */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                        <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                        <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                    </div>

                    {/* Navigation Buttons */}
                    <div className="flex items-center gap-2 text-on-surface/60 shrink-0">
                        <button 
                            onClick={() => onRefresh(true)}
                            disabled={loading}
                            className="p-1 hover:bg-surface-variant/50 rounded transition text-on-surface disabled:opacity-50"
                            title={t('inspector.refresh', 'Refresh Viewport')}
                        >
                            <RefreshCw size={14} className={clsx(loading && "animate-spin")} />
                        </button>
                    </div>

                    {/* Address Bar */}
                    <form onSubmit={handleUrlSubmit} className="flex-1 max-w-2xl mx-auto w-full">
                        <div className="flex items-center gap-2 bg-surface px-3 py-1.5 rounded-xl border border-outline-variant/30 text-xs text-on-surface-variant shadow-inner focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                            <Globe size={12} className="text-primary shrink-0" />
                            <input
                                type="text"
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                className="bg-transparent border-none outline-none w-full text-on-surface text-xs py-0"
                                placeholder={t('run_tab.web.enter_url', 'Enter target website URL...')}
                            />
                            <button
                                type="submit"
                                className="px-2 py-0.5 bg-primary/10 hover:bg-primary/20 text-primary font-medium rounded text-[10px] transition-all"
                            >
                                Go
                            </button>
                        </div>
                    </form>

                    {/* Quick status indicator */}
                    <div className="flex items-center gap-2 shrink-0 select-none">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">LIVE</span>
                    </div>
                </div>

                {/* Screenshot viewport body */}
                <div className="relative bg-black/5 overflow-auto flex items-center justify-center p-2" style={{ minHeight: '300px' }}>
                    {loading && (
                        <div className="absolute inset-0 bg-surface/30 backdrop-blur-[2px] z-50 flex items-center justify-center pointer-events-none">
                            <ExpressiveLoading size="lg" variant="circular" />
                        </div>
                    )}
                    <div className="relative inline-block overflow-hidden rounded-lg shadow border border-outline-variant/10 bg-surface">
                        <img
                            ref={imgRef}
                            src={screenshot}
                            alt="Web Execution Screenshot"
                            className="block w-full h-auto select-none"
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
                                className="absolute rounded-full bg-primary/30 border-2 border-primary pointer-events-none z-30"
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
                                    <marker id={`arrow-web-${swipe.id}`} markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
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
                                    markerEnd={`url(#arrow-web-${swipe.id})`}
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
                </div>
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
                {isExploring && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[55] bg-primary/10 backdrop-blur-[1px] pointer-events-none flex flex-col items-center justify-end pb-8"
                    >
                        <div className="bg-primary/90 text-surface text-[10px] font-bold px-3 py-1 rounded-full shadow-lg flex items-center gap-2 animate-pulse mb-4">
                            <Scan size={12} />
                            {t('mapper.flowchart.exploration_active')}
                        </div>
                        <div className="w-full h-1 bg-surface/20 relative overflow-hidden">
                            <motion.div
                                className="absolute top-0 bottom-0 bg-primary w-1/3"
                                animate={{ x: ["-100%", "300%"] }}
                                transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <img
                ref={imgRef}
                src={screenshot}
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


import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, Maximize, Check, Scan, MousePointerClick, Move, Home, ArrowLeft, Rows } from 'lucide-react';
import { XMLParser } from 'fast-xml-parser';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { InspectorNode, transformXmlToTree, findNodesAtCoords, generateXPath } from '@/lib/inspectorUtils';
import { feedback } from "@/lib/feedback";

interface InspectorSubTabProps {
    selectedDevice: string;
}

export function InspectorSubTab({ selectedDevice }: InspectorSubTabProps) {
    const { t } = useTranslation();
    const [screenshot, setScreenshot] = useState<string | null>(null);
    const [rootNode, setRootNode] = useState<InspectorNode | null>(null);
    const [selectedNode, setSelectedNode] = useState<InspectorNode | null>(null);
    const [hoveredNode, setHoveredNode] = useState<InspectorNode | null>(null);

    // Responsive State
    const containerRef = useRef<HTMLDivElement>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setIsNarrow(entry.contentRect.width < 660);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const [loading, setLoading] = useState(false);
    // const [viewMode, setViewMode] = useState<'properties' | 'xml'>('properties');
    const [copied, setCopied] = useState<string | null>(null);

    // Interaction Mode
    const [interactionMode, setInteractionMode] = useState<'inspect' | 'tap' | 'swipe'>('inspect');
    const [swipeStart, setSwipeStart] = useState<{ x: number, y: number } | null>(null);

    const imgRef = useRef<HTMLImageElement>(null);

    // Animation State
    const [taps, setTaps] = useState<{ id: number, x: number, y: number }[]>([]);
    const [swipes, setSwipes] = useState<{ id: number, startX: number, startY: number, endX: number, endY: number }[]>([]);

    const addTapAnimation = (x: number, y: number) => {
        const id = Date.now();
        // Convert Device Coords -> CSS Coords for display
        if (!imgRef.current) return;
        const rect = imgRef.current.getBoundingClientRect();
        const scaleX = rect.width / imgRef.current.naturalWidth;
        const scaleY = rect.height / imgRef.current.naturalHeight;

        setTaps(prev => [...prev, { id, x: x * scaleX, y: y * scaleY }]);
        setTimeout(() => setTaps(prev => prev.filter(t => t.id !== id)), 500);
    };

    const addSwipeAnimation = (startX: number, startY: number, endX: number, endY: number) => {
        const id = Date.now();
        if (!imgRef.current) return;
        const rect = imgRef.current.getBoundingClientRect();
        const scaleX = rect.width / imgRef.current.naturalWidth;
        const scaleY = rect.height / imgRef.current.naturalHeight;

        setSwipes(prev => [...prev, {
            id,
            startX: startX * scaleX,
            startY: startY * scaleY,
            endX: endX * scaleX,
            endY: endY * scaleY
        }]);
        setTimeout(() => setSwipes(prev => prev.filter(s => s.id !== id)), 600);
    };

    useEffect(() => {
        if (selectedDevice) {
            refreshAll();
        } else {
            // Reset if no device
            setScreenshot(null);
            // setXmlData(null); // Removed unused state
            setRootNode(null);
            setSelectedNode(null);
        }
    }, [selectedDevice]);

    const refreshAll = async () => {
        if (!selectedDevice) return;
        setLoading(true);
        try {
            const b64 = await invoke<string>('get_screenshot', { deviceId: selectedDevice });
            setScreenshot(b64);

            const xml = await invoke<string>('get_xml_dump', { deviceId: selectedDevice });

            // Parse XML
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: "",
                textNodeName: "_text"
            });
            const jsonObj = parser.parse(xml);
            // Transform
            const root = jsonObj.hierarchy ? transformXmlToTree(jsonObj.hierarchy) : transformXmlToTree(jsonObj);
            setRootNode(root);
            feedback.toast.success('feedback.inspector_updated');

        } catch (e) {
            console.error("Inspector error:", e);
        } finally {
            setLoading(false);
        }
    };

    const sendAdbInput = async (cmd: string) => {
        if (!selectedDevice) return;
        const args = ['shell', 'input', ...cmd.split(' ')];
        try {
            await invoke('run_adb_command', { device: selectedDevice, args });
            // Auto-refresh after input to show updated state
            setTimeout(refreshAll, 1500);
        } catch (e) {
            console.error("Input failed", e);
        }
    };

    const getCoords = (e: React.MouseEvent<HTMLImageElement>) => {
        if (!imgRef.current) return null;
        const rect = imgRef.current.getBoundingClientRect();
        const scaleX = imgRef.current.naturalWidth / rect.width;
        const scaleY = imgRef.current.naturalHeight / rect.height;
        return {
            x: Math.round((e.clientX - rect.left) * scaleX),
            y: Math.round((e.clientY - rect.top) * scaleY)
        };
    };

    const handleImageMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
        if (interactionMode === 'swipe') {
            const coords = getCoords(e);
            if (coords) setSwipeStart(coords);
        }
    };

    const handleImageMouseUp = (e: React.MouseEvent<HTMLImageElement>) => {
        if (interactionMode === 'swipe' && swipeStart) {
            const end = getCoords(e);
            if (end) {
                sendAdbInput(`swipe ${swipeStart.x} ${swipeStart.y} ${end.x} ${end.y} 500`);
                addSwipeAnimation(swipeStart.x, swipeStart.y, end.x, end.y);
            }
            setSwipeStart(null);
        }
    };

    const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
        const coords = getCoords(e);
        if (!coords) return;

        if (interactionMode === 'tap') {
            sendAdbInput(`tap ${coords.x} ${coords.y} `);
            addTapAnimation(coords.x, coords.y);
        } else if (interactionMode === 'inspect') {
            if (!processMouseInteraction(e, false)) return;
        }
    };

    const handleImageMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
        if (interactionMode === 'inspect') {
            processMouseInteraction(e, true);
        }
    };

    const [availableNodes, setAvailableNodes] = useState<InspectorNode[]>([]);

    // ...

    const processMouseInteraction = (e: React.MouseEvent<HTMLImageElement>, isHover: boolean) => {
        if (!rootNode || !imgRef.current) return false;
        const coords = getCoords(e);
        if (!coords) return false;

        const candidates = findNodesAtCoords(rootNode, coords.x, coords.y);
        if (candidates.length === 0) return false;

        const best = candidates[0];

        if (isHover) {
            if (best !== hoveredNode) setHoveredNode(best);
        } else {
            // Click Logic: Find all nodes with EXACT same bounds as best
            const exactMatches = candidates.filter((c: InspectorNode) =>
                c.bounds && best.bounds &&
                c.bounds.x === best.bounds.x &&
                c.bounds.y === best.bounds.y &&
                c.bounds.w === best.bounds.w &&
                c.bounds.h === best.bounds.h
            );

            setAvailableNodes(exactMatches);
            setSelectedNode(exactMatches[0]);
        }
        return true;
    };

    const copyToClipboard = (text: string, label: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
    };

    const getHighlighterStyle = (node: InspectorNode | null, color: string) => {
        if (!node || !node.bounds || !imgRef.current) return {};
        const rect = imgRef.current.getBoundingClientRect();
        const scaleX = rect.width / imgRef.current.naturalWidth;
        const scaleY = rect.height / imgRef.current.naturalHeight;
        return {
            left: node.bounds.x * scaleX,
            top: node.bounds.y * scaleY,
            width: node.bounds.w * scaleX,
            height: node.bounds.h * scaleY,
            borderColor: color,
            display: 'block'
        };
    };

    if (!selectedDevice) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400">
                <Scan size={48} className="mb-4 opacity-20" />
                <p>{t('inspector.empty')}</p>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="h-full flex flex-col space-y-4">
            {/* Toolbar - Now at the Top */}
            <div className="bg-zinc-50 dark:bg-black/20 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
                <div className="flex gap-2">
                    <button
                        onClick={refreshAll}
                        disabled={loading}
                        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 text-sm font-medium transition-colors disabled:opacity-50"
                        title={t('inspector.refresh')}
                    >
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        {!isNarrow && t('inspector.refresh')}
                    </button>
                    <div className="h-6 w-px bg-zinc-300 dark:bg-zinc-700 mx-2 self-center" />

                    <div className="flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-md">
                        <button
                            onClick={() => setInteractionMode('inspect')}
                            className={clsx("p-1.5 rounded-sm transition-all", interactionMode === 'inspect' ? "bg-white dark:bg-zinc-600 shadow-sm text-primary" : "text-zinc-400 hover:text-zinc-600")}
                            title={t('inspector.modes.inspect')}
                        >
                            <Scan size={16} />
                        </button>
                        <button
                            onClick={() => setInteractionMode('tap')}
                            className={clsx("p-1.5 rounded-sm transition-all", interactionMode === 'tap' ? "bg-white dark:bg-zinc-600 shadow-sm text-primary" : "text-zinc-400 hover:text-zinc-600")}
                            title={t('inspector.modes.tap')}
                        >
                            <MousePointerClick size={16} />
                        </button>
                        <button
                            onClick={() => setInteractionMode('swipe')}
                            className={clsx("p-1.5 rounded-sm transition-all", interactionMode === 'swipe' ? "bg-white dark:bg-zinc-600 shadow-sm text-primary" : "text-zinc-400 hover:text-zinc-600")}
                            title={t('inspector.modes.swipe')}
                        >
                            <Move size={16} />
                        </button>
                    </div>

                    <div className="flex gap-1 ml-2">
                        <button onClick={() => sendAdbInput('keyevent 3')} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-zinc-500" title={t('inspector.nav.home')}><Home size={16} /></button>
                        <button onClick={() => sendAdbInput('keyevent 4')} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-zinc-500" title={t('inspector.nav.back')}><ArrowLeft size={16} /></button>
                        <button onClick={() => sendAdbInput('keyevent 187')} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-zinc-500" title={t('inspector.nav.recents')}><Rows size={16} /></button>
                    </div>
                </div>
                <div className="text-xs text-zinc-400">
                    {loading ? t('inspector.status.fetching') : t('inspector.status.ready')}
                </div>
            </div>

            {/* Main Content: Split View */}
            <div className="flex-1 grid grid-cols-[auto_1fr] gap-4 min-h-0 overflow-hidden">
                {/* Left: Device Screen (Adaptive) */}
                <div className="bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex items-center justify-center overflow-hidden relative">
                    {screenshot ? (
                        <div className="relative h-full w-full flex items-center justify-center">
                            <img
                                ref={imgRef}
                                src={`data: image / png; base64, ${screenshot} `}
                                alt="Device Screenshot"
                                className="h-full w-auto object-contain shadow-lg rounded-md select-none max-w-full"
                                onMouseMove={handleImageMouseMove}
                                onClick={handleImageClick}
                                onMouseDown={handleImageMouseDown}
                                onMouseUp={handleImageMouseUp}
                                draggable={false}
                            />
                            {/* Animation Layers */}
                            {taps.map(tap => (
                                <div
                                    key={tap.id}
                                    className="absolute rounded-full bg-white/50 border-2 border-white animate-ping pointer-events-none"
                                    style={{
                                        left: tap.x - 20,
                                        top: tap.y - 20,
                                        width: 40,
                                        height: 40,
                                        animationDuration: '0.4s'
                                    }}
                                />
                            ))}

                            {swipes.map(swipe => (
                                <svg
                                    key={swipe.id}
                                    className="absolute top-0 left-0 w-full h-full pointer-events-none"
                                    style={{ zIndex: 30 }}
                                >
                                    <defs>
                                        <marker id={`arrow-${swipe.id}`} markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                                            <path d="M0,0 L0,6 L9,3 z" fill="#f97316" />
                                        </marker>
                                    </defs>
                                    <line
                                        x1={swipe.startX} y1={swipe.startY}
                                        x2={swipe.endX} y2={swipe.endY}
                                        stroke="#f97316"
                                        strokeWidth="4"
                                        strokeOpacity="0.8"
                                        markerEnd={`url(#arrow-${swipe.id})`}
                                        className="transition-opacity duration-500 ease-out"
                                        style={{ opacity: 0 }} // We'll need a way to fade it out, mapped to CSS animation or just state key
                                    >
                                        <animate attributeName="opacity" values="1;0" dur="0.5s" fill="freeze" />
                                    </line>
                                </svg>
                            ))}

                            {/* Ongoing Swipe Preview */}
                            {interactionMode === 'swipe' && swipeStart && (
                                <div className="absolute w-full h-full top-0 left-0 pointer-events-none z-30">
                                    <div
                                        className="absolute w-4 h-4 bg-orange-500 rounded-full -ml-2 -mt-2 opacity-50"
                                        style={{ left: swipeStart.x, top: swipeStart.y }}
                                    />
                                </div>
                            )}
                            <div
                                className="absolute border-2 border-blue-400 pointer-events-none transition-all duration-75 z-10"
                                style={{ ...getHighlighterStyle(hoveredNode, '#60a5fa'), display: hoveredNode?.bounds ? 'block' : 'none' }}
                            />
                            <div
                                className="absolute border-2 border-red-500 pointer-events-none z-20"
                                style={{ ...getHighlighterStyle(selectedNode, '#ef4444'), display: selectedNode?.bounds ? 'block' : 'none' }}
                            />
                        </div>
                    ) : (
                        <div className="text-zinc-400 flex flex-col items-center">
                            {loading ? <RefreshCw className="animate-spin mb-2 opacity-50" size={32} /> : <Maximize size={32} className="mb-2 opacity-50" />}
                            <p>{loading ? t('inspector.status.loading') : t('inspector.status.no_screenshot')}</p>
                        </div>
                    )}
                </div>

                {/* Right: Properties Scroll View */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col overflow-hidden shadow-sm dark:shadow-none h-full">
                    <div className="flex flex-col border-b border-zinc-200 dark:border-zinc-800 shrink-0 bg-zinc-50 dark:bg-zinc-800/50">
                        {availableNodes.length > 1 ? (
                            <div className="flex overflow-x-auto custom-scrollbar">
                                {availableNodes.map((node) => (
                                    <button
                                        key={node.id}
                                        onClick={() => setSelectedNode(node)}
                                        className={clsx(
                                            "px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                                            selectedNode === node
                                                ? "border-primary text-primary bg-white dark:bg-zinc-900"
                                                : "border-transparent text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                                        )}
                                    >
                                        {node.tagName}
                                        {node.attributes['resource-id'] && <span className="ml-2 text-xs opacity-50 truncate max-w-[100px] inline-block align-bottom">{node.attributes['resource-id'].split('/').pop()}</span>}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="px-4 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                {t('inspector.properties')}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                        {selectedNode ? (
                            <div className="p-4 space-y-6">
                                {/* Quick Copy Actions */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t('inspector.attributes.identifiers')}</h3>
                                    <div className="grid grid-cols-1 gap-2">
                                        <CopyButton
                                            label={t('inspector.attributes.access_id')}
                                            value={selectedNode.attributes['content-desc']}
                                            onCopy={(v) => copyToClipboard(v, 'aid')}
                                            active={copied === 'aid'}
                                        />
                                        <CopyButton
                                            label={t('inspector.attributes.resource_id')}
                                            value={selectedNode.attributes['resource-id']}
                                            onCopy={(v) => copyToClipboard(v, 'rid')}
                                            active={copied === 'rid'}
                                        />
                                        <CopyButton
                                            label={t('inspector.attributes.xpath')}
                                            value={generateXPath(selectedNode)}
                                            onCopy={(v) => copyToClipboard(v, 'xpath')}
                                            active={copied === 'xpath'}
                                        />
                                    </div>
                                </div>

                                {/* All Attributes */}
                                <div>
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{t('inspector.attributes.all')}</h3>
                                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden text-sm">
                                        {Object.entries(selectedNode.attributes)
                                            .sort(([a], [b]) => a.localeCompare(b))
                                            .map(([key, value]) => (
                                                <div key={key} className="flex flex-col border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                                                    <div className="bg-zinc-50 dark:bg-zinc-800/50 px-3 py-1.5 text-xs text-zinc-500 font-medium break-all">
                                                        {key}
                                                    </div>
                                                    <div className="bg-white dark:bg-zinc-900 px-3 py-2 font-mono text-zinc-700 dark:text-zinc-300 break-all">
                                                        {String(value)}
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-zinc-400 p-8 text-center">
                                <Scan size={48} className="mb-4 opacity-20" />
                                <p className="text-sm">{t('inspector.select_element')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function CopyButton({ label, value, onCopy, active }: { label: string, value: string | undefined, onCopy: (v: string) => void, active: boolean }) {
    if (!value) return null; // Don't show if empty
    return (
        <button
            onClick={() => onCopy(value)}
            className={clsx(
                "flex flex-col items-start p-2 rounded-lg border transition-all text-left",
                active
                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
                    : "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-700"
            )}
        >
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70 mb-0.5 flex w-full justify-between">
                {label}
                {active && <Check size={12} />}
            </span>
            <span className="text-xs font-mono truncate w-full" title={value}>{value}</span>
        </button>
    );
}

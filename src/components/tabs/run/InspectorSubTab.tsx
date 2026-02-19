
import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Maximize, Check, Scan, MousePointerClick, Move, Home, ArrowLeft, Rows, X, RefreshCw } from 'lucide-react';
import { XMLParser } from 'fast-xml-parser';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { InspectorNode, transformXmlToTree, findNodesAtCoords, generateXPath } from '@/lib/inspectorUtils';
import { feedback } from "@/lib/feedback";
import { Section } from "@/components/organisms/Section";
import { t } from 'i18next';
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";
import { Button } from "@/components/atoms/Button";

interface InspectorSubTabProps {
    selectedDevice: string;
    isActive: boolean;
    isTestRunning?: boolean;
}

export function InspectorSubTab({ selectedDevice, isActive, isTestRunning = false }: InspectorSubTabProps) {
    const { t } = useTranslation();
    const [screenshot, setScreenshot] = useState<string | null>(null);
    const [rootNode, setRootNode] = useState<InspectorNode | null>(null);
    const [selectedNode, setSelectedNode] = useState<InspectorNode | null>(null);
    const [hoveredNode, setHoveredNode] = useState<InspectorNode | null>(null);

    const prevTestRunning = useRef(isTestRunning);

    // Responsive State
    const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    useEffect(() => {
        if (!containerRef) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Increased threshold to 900px to ensure it collapses earlier
                setIsNarrow(entry.contentRect.width < 900);
            }
        });
        observer.observe(containerRef);
        return () => observer.disconnect();
    }, [containerRef]);

    const [loading, setLoading] = useState(false);

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

    // Main fetch logic
    useEffect(() => {
        if (!selectedDevice) {
            setScreenshot(null);
            setRootNode(null);
            setSelectedNode(null);
            prevTestRunning.current = isTestRunning;
            return;
        }

        const wasTestRunning = prevTestRunning.current;
        prevTestRunning.current = isTestRunning;

        if (isActive && !isTestRunning) {
            if (wasTestRunning) {
                // Device just finished test, give it a moment to recover (release resources/uiautomator)
                // before trying to dump XML, otherwise it fails often.
                const timer = setTimeout(refreshAll, 1500); // 1.5s delay
                return () => clearTimeout(timer);
            } else {
                // Only fetch if active, or if never loaded and just became active
                refreshAll();
            }
        }
    }, [selectedDevice, isActive, isTestRunning]);

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
            feedback.toast.error("inspector.update_error", e);
        } finally {
            setLoading(false);
        }
    };

    const sendAdbInput = async (cmd: string) => {
        if (!selectedDevice || isTestRunning) return;
        const args = ['shell', 'input', ...cmd.split(' ')];
        try {
            await invoke('run_adb_command', { device: selectedDevice, args });
            // Auto-refresh after input to show updated state
            setTimeout(refreshAll, 1500);
        } catch (e) {
            feedback.toast.error("inspector.input_error", e);
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

            // Prioritization Logic
            const getPriority = (node: InspectorNode): number => {
                const attr = node.attributes || {};

                // 1. Accessibility ID / Content Desc
                if (attr['content-desc']) return 60;

                // 2. Resource ID
                if (attr['resource-id']) return 50;

                // 3. Text
                if (attr['text']) return 40;

                // 4. Clickable
                if (attr['clickable'] === 'true') return 30;

                // 5. ScrollView (Check class or tag)
                const isScrollView = (node.tagName && node.tagName.includes('ScrollView')) ||
                    (attr['class'] && attr['class'].includes('ScrollView'));
                if (isScrollView) return 20;

                // 6. Others
                return 10;
            };

            // Sort Descending (Higher priority first -> Left in tabs)
            exactMatches.sort((a, b) => getPriority(b) - getPriority(a));

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
            <div className="h-full flex flex-col items-center justify-center text-on-surface/80">
                <Scan size={48} className="mb-4 opacity-20" />
                <p>{t('inspector.empty')}</p>
            </div>
        );
    }

    if (isTestRunning) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-on-surface-variant/80 text-sm">
                <Scan size={32} className="opacity-20 mb-2" />
                <p>{t('inspector.status.paused_test', 'Inspector disabled during test')}</p>
            </div>
        );
    }

    return (
        <div ref={setContainerRef} className="h-full w-full flex flex-col space-y-4">
            {/* Toolbar - Now at the Top */}
            <Section
                title={t('inspector.title', 'Inspector')}
                icon={Scan}
                variant="transparent"
                className="p-0"
                status={
                    <div className="flex items-center gap-2">
                        <div className="text-xs text-on-surface/80">
                            {loading ? t('inspector.status.fetching') : t('inspector.status.ready')}
                        </div>
                        <div className="h-4 w-px bg-surface/80 mx-1" />
                        <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => sendAdbInput('keyevent 4')} className="h-7 w-7 p-0 text-on-surface-variant/80" title={t('inspector.nav.back')}><ArrowLeft size={16} /></Button>
                            <Button variant="ghost" size="sm" onClick={() => sendAdbInput('keyevent 3')} className="h-7 w-7 p-0 text-on-surface-variant/80" title={t('inspector.nav.home')}><Home size={16} /></Button>
                            <Button variant="ghost" size="sm" onClick={() => sendAdbInput('keyevent 187')} className="h-7 w-7 p-0 text-on-surface-variant/80" title={t('inspector.nav.recents')}><Rows size={16} /></Button>
                        </div>
                    </div>
                }
                menus={
                    <div className="flex bg-surface-variant/30 p-0.5 rounded-2xl">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInteractionMode('inspect')}
                            className={clsx("h-7 w-7 p-0 rounded-2xl transition-all", interactionMode === 'inspect' ? "bg-primary/10 shadow-sm text-primary" : "text-on-surface/80 hover:text-on-surface-variant/80")}
                            title={t('inspector.modes.inspect')}
                        >
                            <Scan size={16} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInteractionMode('tap')}
                            className={clsx("h-7 w-7 p-0 rounded-2xl transition-all", interactionMode === 'tap' ? "bg-primary/10 shadow-sm text-primary" : "text-on-surface/80 hover:text-on-surface-variant/80")}
                            title={t('inspector.modes.tap')}
                        >
                            <MousePointerClick size={16} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInteractionMode('swipe')}
                            className={clsx("h-7 w-7 p-0 rounded-2xl transition-all", interactionMode === 'swipe' ? "bg-primary/10 shadow-sm text-primary" : "text-on-surface/80 hover:text-on-surface-variant/80")}
                            title={t('inspector.modes.swipe')}
                        >
                            <Move size={16} />
                        </Button>
                    </div>
                }
                actions={
                    <>
                        <Button
                            onClick={refreshAll}
                            disabled={loading}
                            variant="outline"
                            className={clsx(
                                "h-8 px-3 bg-surface-variant/30 border-outline-variant/30 hover:bg-surface/50 text-sm font-medium",
                                loading && "cursor-wait"
                            )}
                            title={t('inspector.refresh')}
                        >
                            {loading ? <ExpressiveLoading size="xsm" variant="circular" /> : <RefreshCw size={16} />}
                            <span className={clsx("ml-2", isNarrow && "hidden")}>{t('inspector.refresh')}</span>
                        </Button>
                    </>
                }
            />

            {/* Main Content: Split View */}
            <div className="flex-1 grid grid-cols-[auto_1fr] gap-4 min-h-0 overflow-hidden">
                {/* Left: Device Screen (Adaptive) */}
                <div className="flex items-center justify-center overflow-hidden relative">
                    {screenshot ? (
                        <div className="relative h-full w-full flex items-center justify-center">
                            <img
                                ref={imgRef}
                                src={`data: image / png; base64, ${screenshot} `}
                                alt="Device Screenshot"
                                className="h-full w-auto object-contain shadow-lg rounded-2xl select-none max-w-full"
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
                                    className="absolute rounded-2xl bg-surface border-2 border-on-primary animate-ping pointer-events-none"
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
                                        className="absolute w-4 h-4 bg-orange-500 rounded-2xl -ml-2 -mt-2 opacity-50"
                                        style={{ left: swipeStart.x, top: swipeStart.y }}
                                    />
                                </div>
                            )}
                            <div
                                className="absolute border-2 border-info-container/80 pointer-events-none transition-all duration-75 z-10"
                                style={{ ...getHighlighterStyle(hoveredNode, '#60a5fa'), display: hoveredNode?.bounds ? 'block' : 'none' }}
                            />
                            <div
                                className="absolute border-2 border-error pointer-events-none z-20"
                                style={{ ...getHighlighterStyle(selectedNode, '#ef4444'), display: selectedNode?.bounds ? 'block' : 'none' }}
                            />
                        </div>
                    ) : (
                        <div className="text-on-surface/80 flex flex-col items-center">
                            {loading ? <ExpressiveLoading size="lg" variant="circular" className="mb-2" /> : <Maximize size={32} className="mb-2 opacity-50" />}
                            <p>{loading ? t('inspector.status.loading') : t('inspector.status.no_screenshot')}</p>
                        </div>
                    )}
                </div>

                {/* Right: Properties Scroll View */}
                <div className="bg-surface border border-outline-variant/30 rounded-2xl flex flex-col overflow-hidden shadow-sm h-full">
                    <div className="flex items-center justify-between border-b border-outline-variant/30 shrink-0 bg-surface/50 pr-2">
                        {availableNodes.length > 1 ? (
                            <div className="flex overflow-x-auto custom-scrollbar flex-1">
                                {availableNodes.map((node) => (
                                    <button
                                        key={node.id}
                                        onClick={() => setSelectedNode(node)}
                                        className={clsx(
                                            "px-4 py-3 text-sm font-medium border-b-2 transition-colors space-nowrap",
                                            selectedNode === node
                                                ? "border-primary text-primary bg-surface-variant/30"
                                                : "border-transparent text-on-surface-variant/80 hover:text-on-surface-variant/80 hover:bg-surface-variant/30"
                                        )}
                                    >
                                        {node.tagName}
                                        {node.attributes['resource-id'] && <span className="ml-2 text-xs opacity-50 truncate max-w-[100px] inline-block align-bottom">{node.attributes['resource-id'].split('/').pop()}</span>}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="px-4 py-3 text-sm font-semibold text-on-surface-variant/80 flex-1">
                                {t('inspector.properties')}
                            </div>
                        )}

                        {/* Clear Selection Button */}
                        {selectedNode && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setSelectedNode(null);
                                    setAvailableNodes([]);
                                }}
                                className="h-7 w-7 p-0 text-on-surface/80 hover:text-error hover:bg-error-container/10 ml-2"
                                title={t('inspector.clear_selection')}
                            >
                                <X size={16} />
                            </Button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                        {selectedNode ? (
                            <div className="p-4 space-y-6">
                                {/* Quick Copy Actions */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider">{t('inspector.attributes.identifiers')}</h3>
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

                                    {/* Breadcrumbs */}
                                    <div className="mt-4">
                                        <h3 className="text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider mb-2">{t('inspector.attributes.hierarchy')}</h3>
                                        <NodeBreadcrumbs
                                            node={selectedNode}
                                            onSelect={setSelectedNode}
                                            onHover={setHoveredNode}
                                        />
                                    </div>
                                </div>

                                {/* All Attributes */}
                                <div>
                                    <h3 className="text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider mb-2">{t('inspector.attributes.all')}</h3>
                                    <div className="border border-outline-variant/30 rounded-2xl overflow-hidden text-sm">
                                        {Object.entries(selectedNode.attributes)
                                            .sort(([a], [b]) => a.localeCompare(b))
                                            .map(([key, value]) => (
                                                <div key={key} className="flex flex-col border-b border-outline-variant/30 last:border-0">
                                                    <div className="bg-surface-variant/80 px-3 py-1.5 text-xs text-on-surface-variant/80 font-medium break-all">
                                                        {key}
                                                    </div>
                                                    <div className="bg-surface px-3 py-2 font-mono text-on-surface-variant/80 break-all">
                                                        {String(value)}
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-on-surface/80 p-8 text-center">
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

// ... (Helper Component)
function NodeBreadcrumbs({ node, onSelect, onHover }: { node: InspectorNode, onSelect: (n: InspectorNode) => void, onHover: (n: InspectorNode | null) => void }) {
    if (!node) return null;

    // 1. Build path from leaf to root
    let path: InspectorNode[] = [];
    let curr: InspectorNode | undefined = node;
    while (curr) {
        if (curr.tagName !== 'hierarchy' && curr.tagName !== 'node') {
            path.unshift(curr);
        }
        curr = curr.parent;
    }

    // Filter out system nodes (up to android:id/content)
    const contentIndex = path.findIndex(n => n.attributes['resource-id']?.endsWith(':id/content'));
    if (contentIndex !== -1) {
        path = path.slice(contentIndex + 1);
    }

    const cleanTag = (tag: string) => tag.replace('android.widget.', '').replace('android.view.', '');

    return (
        <div className="flex flex-wrap items-center gap-1 text-xs text-on-surface-variant/80 font-mono p-2 bg-surface/50 rounded border border-outline-variant/30">
            {path.map((n, i) => (
                <div key={n.id} className="flex items-center">
                    {i > 0 && <span className="mx-1 text-on-surface/80">&gt;</span>}
                    <button
                        onClick={() => onSelect(n)}
                        onMouseEnter={() => onHover(n)}
                        onMouseLeave={() => onHover(null)}
                        className={clsx(
                            "hover:text-primary hover:underline transition-colors text-left",
                            n === node ? "font-bold text-on-surface/80" : ""
                        )}
                        title={generateXPath(n)}
                    >
                        {cleanTag(n.tagName)}
                        {n.attributes['resource-id'] && <span className="ml-1 text-primary">resource-id="{n.attributes['resource-id'].split('/').pop()}"</span>}
                        {!n.attributes['resource-id'] && n.attributes['content-desc'] && <span className="ml-1 text-on-success-container/10">content-desc="{n.attributes['content-desc'].substring(0, 15)}..."</span>}
                    </button>
                </div>
            ))}
        </div>
    );
}

function CopyButton({ label, value, onCopy, active }: { label: string, value: string | undefined, onCopy: (v: string) => void, active: boolean }) {
    if (!value) return null; // Don't show if empty
    return (
        <Button
            variant="ghost"
            onClick={() => onCopy(value)}
            className={clsx(
                "flex flex-col items-start p-2 rounded-2xl border transition-all text-left h-auto",
                active
                    ? "bg-success-container/10 border-success-container/20 text-on-success-container"
                    : "bg-surface/50 border-outline-variant/30 hover:border-info-container/50"
            )}
        >
            <span className="text-[10px] tracking-wider opacity-70 mb-0.5 flex w-full justify-between">
                <div className="font-semibold uppercase">
                    {label}
                </div>
                <div className="text-success">
                    {active && <div className="flex items-center gap-1"><Check size={12} />{t("inspector.attributes.copied")}</div>}
                </div>
            </span>
            <span className="text-xs font-mono truncate w-full" title={value}>{value}</span>
        </Button>
    );
}

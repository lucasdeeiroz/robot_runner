
import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Maximize, Check, Scan, Home, ArrowLeft, Rows, X, RefreshCw, Search, Pencil, Copy } from 'lucide-react';
import { XMLParser } from 'fast-xml-parser';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { InspectorNode, transformXmlToTree, findNodesAtCoords, generateXPath, findNodesByLocator, generateUiSelector, transformBounds } from '@/lib/inspectorUtils';
import { feedback } from "@/lib/feedback";
import { Section } from "@/components/organisms/Section";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { Select } from "@/components/atoms/Select";
import { Modal } from "@/components/organisms/Modal";

interface InspectorSubTabProps {
    selectedDevice: string;
    isActive: boolean;
    isTestRunning?: boolean;
}

export function InspectorSubTab({ selectedDevice, isActive, isTestRunning = false }: InspectorSubTabProps) {
    const { t } = useTranslation();
    const [screenshot, setScreenshot] = useState<string | null>(null);
    const [rootNode, setRootNode] = useState<InspectorNode | null>(null);
    const [imgLayout, setImgLayout] = useState<{ width: number, height: number, naturalWidth: number, naturalHeight: number } | null>(null);
    const [selectedNode, setSelectedNode] = useState<InspectorNode | null>(null);
    const [hoveredNode, setHoveredNode] = useState<InspectorNode | null>(null);
    const [availableNodes, setAvailableNodes] = useState<InspectorNode[]>([]);

    const prevTestRunning = useRef(isTestRunning);

    // Responsive State
    const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    useEffect(() => {
        if (!containerRef) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setIsNarrow(entry.contentRect.width < 900);
            }
        });
        observer.observe(containerRef);
        return () => observer.disconnect();
    }, [containerRef]);

    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);

    // Interaction State
    const [swipeStart, setSwipeStart] = useState<{ x: number, y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<InspectorNode[]>([]);

    // Locator Editing State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingAttr, setEditingAttr] = useState<'resource-id' | 'content-desc' | 'xpath' | null>(null);
    const [editOptions, setEditOptions] = useState({
        type: 'equals' as 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches',
        useUiSelectorWrapper: true,
        xpathAttr: 'resource-id' as string,
        selectedAddons: [] as string[]
    });
    const [customLocator, setCustomLocator] = useState("");

    const imgRef = useRef<HTMLImageElement>(null);

    // Animation State
    const [taps, setTaps] = useState<{ id: number, x: number, y: number }[]>([]);
    const [swipes, setSwipes] = useState<{ id: number, startX: number, startY: number, endX: number, endY: number }[]>([]);

    const addTapAnimation = (x: number, y: number) => {
        const id = Date.now();
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

    const handleSearch = (query: string) => {
        setSearchQuery(query);
        if (!rootNode || !query) {
            setSearchResults([]);
            return;
        }
        const results = findNodesByLocator(rootNode, query);
        setSearchResults(results);
    };

    const refreshAll = async () => {
        if (!selectedDevice) return;
        setLoading(true);
        try {
            const b64 = await invoke<string>('get_screenshot', { deviceId: selectedDevice });
            setScreenshot(b64);
            const xml = await invoke<string>('get_xml_dump', { deviceId: selectedDevice });
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: "",
                textNodeName: "_text"
            });
            const jsonObj = parser.parse(xml);
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
            const exactMatches = candidates.filter((c: InspectorNode) =>
                c.bounds && best.bounds &&
                c.bounds.x === best.bounds.x &&
                c.bounds.y === best.bounds.y &&
                c.bounds.w === best.bounds.w &&
                c.bounds.h === best.bounds.h
            );

            const getPriority = (node: InspectorNode): number => {
                const attr = node.attributes || {};
                if (attr['content-desc']) return 60;
                if (attr['resource-id']) return 50;
                if (attr['text']) return 40;
                if (attr['clickable'] === 'true') return 30;
                const isScrollView = (node.tagName && node.tagName.includes('ScrollView')) ||
                    (attr['class'] && attr['class'].includes('ScrollView'));
                if (isScrollView) return 20;
                return 10;
            };

            exactMatches.sort((a, b) => getPriority(b) - getPriority(a));
            setAvailableNodes(exactMatches);
            setSelectedNode(exactMatches[0]);
        }
        return true;
    };

    const handleImageMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
        const coords = getCoords(e);
        if (coords) {
            setSwipeStart(coords);
            setIsDragging(false);
        }
    };

    const handleImageMouseUp = (e: React.MouseEvent<HTMLImageElement>) => {
        if (swipeStart) {
            const end = getCoords(e);
            if (end && isDragging) {
                sendAdbInput(`swipe ${swipeStart.x} ${swipeStart.y} ${end.x} ${end.y} 500`);
                addSwipeAnimation(swipeStart.x, swipeStart.y, end.x, end.y);
            } else if (end && !isDragging) {
                processMouseInteraction(e, false);
                setSearchResults([]);
            }
        }
        setSwipeStart(null);
        setIsDragging(false);
    };

    const handleScreenshotDoubleClick = (e: React.MouseEvent<HTMLImageElement>) => {
        const coords = getCoords(e);
        if (coords) {
            sendAdbInput(`tap ${coords.x} ${coords.y}`);
            addTapAnimation(coords.x, coords.y);
        }
    };

    const handleImageMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
        if (swipeStart) {
            const coords = getCoords(e);
            if (coords) {
                const dist = Math.sqrt(Math.pow(coords.x - swipeStart.x, 2) + Math.pow(coords.y - swipeStart.y, 2));
                if (dist > 10) setIsDragging(true);
            }
        }
        processMouseInteraction(e, true);
    };

    const copyToClipboard = (text: string, label: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
    };

    const getHighlighterStyle = (node: InspectorNode | null, color: string) => {
        if (!node || !node.bounds || !imgLayout || !rootNode) return {};

        // Use natural dimensions from the captured layout
        const { width: dispWidth, height: dispHeight, naturalWidth, naturalHeight } = imgLayout;

        // Detect XML orientation from rootNode bounds (now reliably computed in transformXmlToTree)
        const xmlWidth = rootNode.bounds?.w || naturalWidth;
        const xmlHeight = rootNode.bounds?.h || naturalHeight;

        // Transform bounds if there's an orientation mismatch
        const transformedBounds = transformBounds(
            node.bounds,
            xmlWidth,
            xmlHeight,
            naturalWidth,
            naturalHeight
        );

        const scaleX = dispWidth / naturalWidth;
        const scaleY = dispHeight / naturalHeight;

        return {
            left: (transformedBounds.x * scaleX),
            top: (transformedBounds.y * scaleY),
            width: transformedBounds.w * scaleX,
            height: transformedBounds.h * scaleY,
            borderColor: color,
            display: 'block'
        };
    };

    const handleOpenEditModal = (attr: 'resource-id' | 'content-desc' | 'xpath') => {
        setEditingAttr(attr);
        setIsEditModalOpen(true);
        if (selectedNode) {
            let initialAttr = editOptions.xpathAttr;
            if (attr === 'xpath') {
                const attrs = selectedNode.attributes;
                if (!attrs[initialAttr]) {
                    if (attrs['resource-id']) initialAttr = 'resource-id';
                    else if (attrs['text']) initialAttr = 'text';
                    else if (attrs['content-desc']) initialAttr = 'content-desc';
                    else if (attrs['class']) initialAttr = 'class';
                }
            } else {
                initialAttr = attr;
            }

            const newOpts = {
                ...editOptions,
                xpathAttr: initialAttr,
                selectedAddons: [] // Reset addons when opening modal
            };
            setEditOptions(newOpts);

            if (attr === 'xpath') {
                setCustomLocator(generateXPath(selectedNode, initialAttr, editOptions.type, []));
            } else {
                setCustomLocator(generateUiSelector(selectedNode, {
                    attr: attr as any,
                    type: editOptions.type,
                    useUiSelectorWrapper: editOptions.useUiSelectorWrapper,
                    addons: []
                }));
            }
        }
    };

    const updateCustomLocator = (options: typeof editOptions) => {
        if (!selectedNode || !editingAttr) return;
        if (editingAttr === 'xpath') {
            setCustomLocator(generateXPath(selectedNode, options.xpathAttr, options.type, options.selectedAddons));
        } else {
            setCustomLocator(generateUiSelector(selectedNode, {
                attr: editingAttr as any,
                type: options.type,
                useUiSelectorWrapper: options.useUiSelectorWrapper,
                addons: options.selectedAddons
            }));
        }
    };


    useEffect(() => {
        if (!selectedDevice) {
            setScreenshot(null);
            setRootNode(null);
            setSelectedNode(null);
            prevTestRunning.current = isTestRunning;
            return;
        }
        if (isActive && !isTestRunning) {
            if (prevTestRunning.current) {
                const timer = setTimeout(refreshAll, 1500);
                prevTestRunning.current = false;
                return () => clearTimeout(timer);
            } else {
                refreshAll();
            }
        }
        prevTestRunning.current = isTestRunning;
    }, [selectedDevice, isActive, isTestRunning]);

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
        <div ref={setContainerRef} className="flex-1 min-h-[700px] flex flex-col space-y-4">
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
                    <div className="flex items-center gap-2">
                        <Input
                            placeholder={t('inspector.search.placeholder', 'Search by ID, XPath, etc...')}
                            value={searchQuery}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSearch(e.target.value)}
                            className="h-8 min-w-[300px] text-xs"
                            leftIcon={<Search size={14} />}
                            rightIcon={searchQuery ? (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleSearch("");
                                    }}
                                    className="p-1 hover:bg-surface-variant/30 rounded-full transition-colors flex items-center justify-center"
                                    title={t('inspector.search.clear', 'Clear')}
                                >
                                    <X size={14} className="opacity-50" />
                                </button>
                            ) : null}
                        />
                    </div>
                }
                actions={
                    <Button
                        onClick={refreshAll}
                        disabled={loading}
                        variant="outline"
                        className={clsx("h-8 px-3 bg-surface-variant/30 border-outline-variant/30 hover:bg-surface/50 text-sm font-medium", loading && "cursor-wait")}
                        title={t('inspector.refresh')}
                    >
                        {loading ? <ExpressiveLoading size="xsm" variant="circular" /> : <RefreshCw size={16} />}
                        <span className={clsx("ml-2", isNarrow && "hidden")}>{t('inspector.refresh')}</span>
                    </Button>
                }
            />

            <div className="flex-1 grid grid-cols-[auto_1fr] gap-4 min-h-0 overflow-hidden">
                <div className="flex flex-col items-center justify-center overflow-hidden relative max-w-[35vw] bg-surface-variant/5 border border-outline-variant/20 rounded-2xl p-4">
                    {screenshot ? (
                        <div className="relative inline-block shadow-2xl rounded-lg overflow-hidden border border-outline-variant/30">
                            <img
                                ref={imgRef}
                                src={`data:image/png;base64,${screenshot}`}
                                alt="Device Screenshot"
                                className="block w-auto h-auto max-w-full max-h-[750px] select-none"
                                onLoad={(e) => {
                                    const img = e.currentTarget;
                                    setImgLayout({
                                        width: img.clientWidth,
                                        height: img.clientHeight,
                                        naturalWidth: img.naturalWidth,
                                        naturalHeight: img.naturalHeight
                                    });
                                }}
                                onMouseMove={handleImageMouseMove}
                                onMouseDown={handleImageMouseDown}
                                onMouseUp={handleImageMouseUp}
                                onDoubleClick={handleScreenshotDoubleClick}
                                draggable={false}
                            />
                            {taps.map(tap => (
                                <div
                                    key={tap.id}
                                    className="absolute rounded-2xl bg-surface border-2 border-on-primary animate-ping pointer-events-none"
                                    style={{ left: tap.x - 20, top: tap.y - 20, width: 40, height: 40, animationDuration: '0.4s' }}
                                />
                            ))}
                            {swipes.map(swipe => (
                                <svg key={swipe.id} className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ zIndex: 30 }}>
                                    <defs>
                                        <marker id={`arrow-${swipe.id}`} markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                                            <path d="M0,0 L0,6 L9,3 z" fill="#f97316" />
                                        </marker>
                                    </defs>
                                    <line
                                        x1={swipe.startX} y1={swipe.startY} x2={swipe.endX} y2={swipe.endY}
                                        stroke="#f97316" strokeWidth="4" strokeOpacity="0.8" markerEnd={`url(#arrow-${swipe.id})`}
                                    >
                                        <animate attributeName="opacity" values="1;0" dur="0.5s" fill="freeze" />
                                    </line>
                                </svg>
                            ))}
                            {isDragging && swipeStart && (
                                <div className="absolute w-full h-full top-0 left-0 pointer-events-none z-30">
                                    <div className="absolute w-4 h-4 bg-orange-500 rounded-2xl -ml-2 -mt-2 opacity-50" style={{ left: swipeStart.x, top: swipeStart.y }} />
                                </div>
                            )}
                            {searchResults.map((node) => (
                                <div key={node.id} className="absolute border-2 border-success pointer-events-none z-10" style={getHighlighterStyle(node, '#22c55e')} />
                            ))}
                            <div className="absolute border-2 border-info-container/80 pointer-events-none transition-all duration-75 z-10" style={{ ...getHighlighterStyle(hoveredNode, '#60a5fa'), display: hoveredNode ? 'block' : 'none' }} />
                            <div className="absolute border-2 border-error pointer-events-none z-20" style={{ ...getHighlighterStyle(selectedNode, '#ef4444'), display: selectedNode ? 'block' : 'none' }} />
                        </div>
                    ) : (
                        <div className="text-on-surface/80 flex flex-col items-center">
                            {loading ? <ExpressiveLoading size="lg" variant="circular" className="mb-2" /> : <Maximize size={32} className="mb-2 opacity-50" />}
                            <p>{loading ? t('inspector.status.loading') : t('inspector.status.no_screenshot')}</p>
                        </div>
                    )}
                </div>

                <div className="bg-surface border border-outline-variant/30 rounded-2xl flex flex-col overflow-hidden shadow-sm flex-1">
                    <div className="flex items-center justify-between border-b border-outline-variant/30 shrink-0 bg-surface/50 pr-2">
                        {availableNodes.length > 1 ? (
                            <div className="flex overflow-x-auto custom-scrollbar flex-1">
                                {availableNodes.map((node) => (
                                    <button
                                        key={node.id}
                                        onClick={() => setSelectedNode(node)}
                                        className={clsx(
                                            "px-4 py-3 text-sm font-medium border-b-2 transition-colors space-nowrap",
                                            selectedNode === node ? "border-primary text-primary bg-surface-variant/30" : "border-transparent text-on-surface-variant/80 hover:bg-surface-variant/30"
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
                        {selectedNode && (
                            <Button variant="ghost" size="sm" onClick={() => { setSelectedNode(null); setAvailableNodes([]); }} className="h-7 w-7 p-0 text-on-surface/80 hover:text-error hover:bg-error-container/10 ml-2" title={t('inspector.clear_selection')}>
                                <X size={16} />
                            </Button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                        {selectedNode ? (
                            <div className="p-4 space-y-6">
                                <div className="space-y-4">
                                    <h3 className="text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider">{t('inspector.attributes.identifiers')}</h3>
                                    <div className={clsx(
                                        "grid grid-cols-1 gap-2",
                                        selectedNode.attributes['content-desc'] && selectedNode.attributes['resource-id'] ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-1"
                                    )}>
                                        <CopyButton
                                            label={t('inspector.attributes.access_id')}
                                            value={selectedNode.attributes['content-desc']}
                                            onCopy={(v) => copyToClipboard(v, 'aid')}
                                            onEdit={() => handleOpenEditModal('content-desc')}
                                            active={copied === 'aid'}
                                        />
                                        <CopyButton
                                            label={t('inspector.attributes.resource_id')}
                                            value={selectedNode.attributes['resource-id']}
                                            onCopy={(v) => copyToClipboard(v, 'rid')}
                                            onEdit={() => handleOpenEditModal('resource-id')}
                                            active={copied === 'rid'}
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        <CopyButton
                                            label={t('inspector.attributes.xpath')}
                                            value={generateXPath(selectedNode)}
                                            onCopy={(v) => copyToClipboard(v, 'xp')}
                                            onEdit={() => handleOpenEditModal('xpath')}
                                            active={copied === 'xp'}
                                        />
                                    </div>
                                    <div className="mt-4">
                                        <h3 className="text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider mb-2">{t('inspector.attributes.hierarchy')}</h3>
                                        <NodeBreadcrumbs node={selectedNode} onSelect={setSelectedNode} onHover={setHoveredNode} />
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider mb-2">{t('inspector.attributes.all')}</h3>
                                    <div className="border border-outline-variant/30 rounded-2xl overflow-hidden text-sm">
                                        {Object.entries(selectedNode.attributes)
                                            .filter(([key, value]) => key !== undefined && value !== undefined && value !== null && value !== '')
                                            .sort(([a], [b]) => a.localeCompare(b))
                                            .map(([key, value]) => (
                                                <div key={key} className="flex flex-col border-b border-outline-variant/30 last:border-0">
                                                    <div className="bg-surface-variant/80 px-3 py-1.5 text-xs text-on-surface-variant/80 font-medium break-all">{key}</div>
                                                    <div className="bg-surface px-3 py-2 font-mono text-on-surface-variant/80 break-all">{String(value)}</div>
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

            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                title={editingAttr === 'xpath' ? t('inspector.modal.edit_xpath') : t('inspector.modal.edit_selector')}
                className="max-w-md"
            >
                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-on-surface-variant/80">{t('inspector.modal.match_type')}</label>
                        <Select
                            value={editOptions.type}
                            onChange={(e) => {
                                const val = e.target.value as any;
                                const newOpts = { ...editOptions, type: val };
                                setEditOptions(newOpts);
                                updateCustomLocator(newOpts);
                            }}
                            options={[
                                { label: t('inspector.modal.match_type_equals'), value: 'equals' },
                                { label: t('inspector.modal.match_type_contains'), value: 'contains' },
                                { label: t('inspector.modal.match_type_starts_with'), value: 'startsWith' },
                                { label: t('inspector.modal.match_type_ends_with'), value: 'endsWith' },
                                { label: t('inspector.modal.match_type_regex'), value: 'matches' },
                            ]}
                        />
                    </div>

                    {editingAttr !== 'xpath' ? (
                        <div className="flex items-center gap-2 pt-2">
                            <input
                                type="checkbox"
                                id="useWrapper"
                                checked={editOptions.useUiSelectorWrapper}
                                onChange={(e) => {
                                    const newOpts = { ...editOptions, useUiSelectorWrapper: e.target.checked };
                                    setEditOptions(newOpts);
                                    updateCustomLocator(newOpts);
                                }}
                                className="rounded border-outline-variant/30 text-primary focus:ring-primary/20"
                            />
                            <label htmlFor="useWrapper" className="text-xs font-medium text-on-surface-variant/80">
                                {t('inspector.modal.use_wrapper', 'Use new UiSelector() wrapper')}
                            </label>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-on-surface-variant/80">{t('inspector.modal.preferred_attr')}</label>
                            <Select
                                value={editOptions.xpathAttr}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    const newOpts = { ...editOptions, xpathAttr: val };
                                    setEditOptions(newOpts);
                                    updateCustomLocator(newOpts);
                                }}
                                options={[
                                    { label: t('inspector.modal.preferred_attr_resource_id'), value: 'resource-id' },
                                    { label: t('inspector.modal.preferred_attr_text'), value: 'text' },
                                    { label: t('inspector.modal.preferred_attr_content_desc'), value: 'content-desc' },
                                    { label: t('inspector.modal.preferred_attr_class'), value: 'class' },
                                ].filter(opt => selectedNode?.attributes[opt.value])}
                            />
                        </div>
                    )}

                    <div className="space-y-2 pt-2">
                        <label className="text-xs font-medium text-on-surface-variant/80">{t('inspector.modal.additional_attrs', 'Additional Attributes')}</label>
                        <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto custom-scrollbar p-1 border border-outline-variant/30 rounded-lg">
                            {[
                                { label: t('inspector.modal.attr_resource_id', 'Resource ID'), value: 'resource-id' },
                                { label: t('inspector.modal.attr_text', 'Text'), value: 'text' },
                                { label: t('inspector.modal.attr_content_desc', 'Content Desc'), value: 'content-desc' },
                                { label: t('inspector.modal.attr_class', 'Class'), value: 'class' },
                                { label: t('inspector.modal.attr_index', 'Index'), value: 'index' },
                                { label: t('inspector.modal.attr_clickable', 'Clickable'), value: 'clickable' },
                                { label: t('inspector.modal.attr_enabled', 'Enabled'), value: 'enabled' },
                                { label: t('inspector.modal.attr_checked', 'Checked'), value: 'checked' },
                                { label: t('inspector.modal.attr_selected', 'Selected'), value: 'selected' },
                                { label: t('inspector.modal.attr_focusable', 'Focusable'), value: 'focusable' },
                            ].filter(opt =>
                                selectedNode?.attributes[opt.value] !== undefined &&
                                selectedNode?.attributes[opt.value] !== null &&
                                selectedNode?.attributes[opt.value] !== '' &&
                                (editingAttr === 'xpath' ? opt.value !== editOptions.xpathAttr : opt.value !== editingAttr)
                            ).map(opt => (
                                <div key={opt.value} className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id={`addon-${opt.value}`}
                                        checked={editOptions.selectedAddons.includes(opt.value)}
                                        onChange={(e) => {
                                            const newAddons = e.target.checked
                                                ? [...editOptions.selectedAddons, opt.value]
                                                : editOptions.selectedAddons.filter(a => a !== opt.value);
                                            const newOpts = { ...editOptions, selectedAddons: newAddons };
                                            setEditOptions(newOpts);
                                            updateCustomLocator(newOpts);
                                        }}
                                        className="rounded border-outline-variant/30 text-primary focus:ring-primary/20 h-3.5 w-3.5"
                                    />
                                    <label htmlFor={`addon-${opt.value}`} className="text-xs text-on-surface-variant/80 cursor-pointer truncate" title={opt.label}>
                                        {opt.label}
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1 pt-4 border-t border-outline-variant/30">
                        <label className="text-xs font-medium text-on-surface-variant/80">{t('inspector.modal.result')}</label>
                        <div className="flex bg-surface-variant/20 p-3 rounded-2xl border border-outline-variant/30">
                            <code className="text-xs break-all flex-1 text-primary font-mono">{customLocator}</code>
                            <button onClick={() => copyToClipboard(customLocator, 'modal_copy')} className="ml-2 p-1 text-on-surface-variant/80 hover:text-primary transition-colors">
                                {copied === 'modal_copy' ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

function NodeBreadcrumbs({ node, onSelect, onHover }: { node: InspectorNode, onSelect: (n: InspectorNode) => void, onHover: (n: InspectorNode | null) => void }) {
    if (!node) return null;
    let path: InspectorNode[] = [];
    let curr: InspectorNode | undefined = node;
    while (curr) {
        if (curr.tagName !== 'hierarchy' && curr.tagName !== 'node') path.unshift(curr);
        curr = curr.parent;
    }
    const contentIndex = path.findIndex(n => n.attributes['resource-id']?.endsWith(':id/content'));
    if (contentIndex !== -1) path = path.slice(contentIndex + 1);
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
                        className={clsx("hover:text-primary hover:underline transition-colors text-left", n === node ? "font-bold text-on-surface/80" : "")}
                        title={generateXPath(n)}
                    >
                        {cleanTag(n.tagName)}
                    </button>
                </div>
            ))}
        </div>
    );
}

function CopyButton({ label, value, onCopy, onEdit, active }: { label: string, value: string | undefined, onCopy: (v: string) => void, onEdit: () => void, active: boolean }) {
    const { t } = useTranslation();
    if (value === undefined || value === null || value === '') return null; // Don't show if empty
    return (
        <div
            onClick={() => onCopy(value)}
            className={clsx(
                "flex flex-col items-start p-2 rounded-2xl border transition-all text-left bg-surface/50 border-outline-variant/30 hover:border-info-container/50 cursor-pointer select-none",
                active && "bg-success-container/10 border-success-container/20 text-on-success-container"
            )}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onCopy(value);
                }
            }}
        >
            <span className="text-[10px] tracking-wider opacity-70 mb-0.5 flex w-full justify-between">
                <div className="font-semibold uppercase">
                    {label}
                </div>
                <div className="text-success">
                    {active && <div className="flex items-center gap-1"><Check size={12} />{t("inspector.attributes.copied")}</div>}
                </div>
            </span>
            <div className="flex items-center gap-2 w-full">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit();
                    }}
                    className="p-1 h-7 w-7 text-on-surface-variant/80 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                    title={t('common.edit')}
                >
                    <Pencil size={12} />
                </Button>
                <div className="text-xs font-mono truncate flex-1" title={value}>{value}</div>
            </div>
        </div>
    );
}

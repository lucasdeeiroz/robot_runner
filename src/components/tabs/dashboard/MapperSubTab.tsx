
import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Maximize, Check, Scan, MousePointerClick, Move, Home, ArrowLeft, Rows, X, RefreshCw, Wrench, Save, GitGraph, Trash2, Upload, Download } from 'lucide-react';
import { XMLParser } from 'fast-xml-parser';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { InspectorNode, transformXmlToTree, findNodesAtCoords, generateXPath } from '@/lib/inspectorUtils';
import { feedback } from "@/lib/feedback";
import { Section } from "@/components/organisms/Section";
import { t } from 'i18next';
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";
import { Combobox } from "@/components/atoms/Combobox";
import { Select } from "@/components/atoms/Select";
import { Input } from "@/components/atoms/Input";
import { Textarea } from "@/components/atoms/Textarea";
import { useTestSessions } from '@/lib/testSessionStore';
import { UIElementType, UIElementMap, ScreenMap } from '@/lib/types';
import { saveScreenMap, listScreenMaps, deleteScreenMap, exportMapperData, importMapperData } from '@/lib/dashboard/mapperPersistence';
import { useSettings } from '@/lib/settings';
import { save, open } from '@tauri-apps/plugin-dialog';
import { ConfirmationModal } from '@/components/organisms/ConfirmationModal';
import { FlowchartModal } from '@/components/organisms/FlowchartModal';
import { Button } from '@/components/atoms/Button';

interface MapperSubTabProps {
    isActive: boolean;
    selectedDeviceId: string | null;
}

export function MapperSubTab({ isActive, selectedDeviceId }: MapperSubTabProps) {
    const { t } = useTranslation();
    const { activeProfileId } = useSettings();
    const [screenshot, setScreenshot] = useState<string | null>(null);
    const [rootNode, setRootNode] = useState<InspectorNode | null>(null);
    const [selectedNode, setSelectedNode] = useState<InspectorNode | null>(null);
    const [hoveredNode, setHoveredNode] = useState<InspectorNode | null>(null);

    // --- Screen Mapper State ---
    const [screenName, setScreenName] = useState("");
    const [screenType, setScreenType] = useState<'screen' | 'modal' | 'tab' | 'drawer'>('screen');
    const [mappedElements, setMappedElements] = useState<UIElementMap[]>([]);
    const [currentElement, setCurrentElement] = useState<Partial<UIElementMap>>({});
    const [savedMaps, setSavedMaps] = useState<ScreenMap[]>([]);
    const [showLoadMenu, setShowLoadMenu] = useState(false);

    // Helper state for confirmation modal
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [screenToDelete, setScreenToDelete] = useState<string | null>(null);
    const [isFlowchartOpen, setIsFlowchartOpen] = useState(false);

    useEffect(() => {
        loadSavedMaps();
    }, [activeProfileId]);

    const loadSavedMaps = async () => {
        const maps = await listScreenMaps(activeProfileId);
        setSavedMaps(maps);
    };

    // reset current element when selection changes
    useEffect(() => {
        if (selectedNode) {
            // Check if already mapped
            const existing = mappedElements.find(e => e.id === generateXPath(selectedNode));
            if (existing) {
                setCurrentElement(existing);
            } else {
                setCurrentElement({
                    id: generateXPath(selectedNode),
                    type: 'button', // Default
                    name: '',
                    text: selectedNode.attributes['text'],
                    android_id: selectedNode.attributes['resource-id'],
                    accessibility_id: selectedNode.attributes['content-desc']
                });
            }
        } else {
            setCurrentElement({});
        }
    }, [selectedNode, mappedElements]);

    // Helper to update current element state
    const updateElement = (key: keyof UIElementMap, value: any) => {
        setCurrentElement(prev => ({ ...prev, [key]: value }));
    };

    const saveElementMapping = () => {
        if (!currentElement.name) {
            feedback.toast.error(t('mapper.error.missing_name'));
            return;
        }

        if (!selectedNode && !currentElement.id) {
            feedback.toast.error(t('mapper.error.no_element_selected'));
            return;
        }

        // Clone and sanitize
        const elementToSave = { ...currentElement };
        if (elementToSave.type === 'menu' && Array.isArray(elementToSave.menu_options)) {
            elementToSave.menu_options = elementToSave.menu_options
                .map(s => s.trim())
                .filter(Boolean);
        }

        const newElement = elementToSave as UIElementMap;
        setMappedElements(prev => {
            const idx = prev.findIndex(e => e.id === newElement.id);
            if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = newElement;
                return updated;
            }
            return [...prev, newElement];
        });
        feedback.toast.success(t('mapper.feedback.mapped'));
    };

    const removeElementMapping = () => {
        if (!currentElement.id) return;
        setMappedElements(prev => prev.filter(e => e.id !== currentElement.id));
        setCurrentElement({ ...currentElement, id: undefined }); // Clear ID to reset state logic if needed, or just re-select
        feedback.toast.success(t('mapper.feedback.removed'));
    };

    // Screen Actions
    const handleSaveScreen = async () => {
        if (!screenName) {
            feedback.toast.error(t('mapper.error.missing_screen_name'));
            return;
        }
        if (mappedElements.length === 0) {
            feedback.toast.info(t('mapper.feedback.empty_map'));
            // allowing save even if empty, but warning is good
        }

        const map: ScreenMap = {
            id: screenName.toLowerCase().replace(/\s+/g, '_'),
            name: screenName,
            type: screenType,
            elements: mappedElements,
            base64_preview: screenshot || undefined
        };

        try {
            await saveScreenMap(activeProfileId, map);
            feedback.toast.success(t('mapper.feedback.saved'));
            loadSavedMaps(); // Refresh list
        } catch (e) {
            feedback.toast.error(t('mapper.error.save_failed'), e);
        }
    };

    const handleLoadScreen = (map: ScreenMap) => {
        setScreenName(map.name);
        setScreenType(map.type);
        setMappedElements(map.elements);
        if (map.base64_preview) {
            setScreenshot(map.base64_preview); // Optional: might want to keep live screenshot instead
        }
        setShowLoadMenu(false);
        feedback.toast.success(t('mapper.feedback.loaded'));
    };

    const handleDeleteScreen = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setScreenToDelete(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDeleteScreen = async () => {
        if (screenToDelete) {
            await deleteScreenMap(activeProfileId, screenToDelete);
            loadSavedMaps();
            feedback.toast.success(t('mapper.feedback.deleted'));
            setScreenToDelete(null);
            setIsDeleteModalOpen(false);

            // If deleting current screen, reset
            if (savedMaps.find(m => m.id === screenToDelete)?.name === screenName) {
                setScreenName('');
                setScreenType('screen');
                setMappedElements([]);
                setScreenshot(null);
            }
        }
    };


    const handleExport = async () => {
        try {
            const data = await exportMapperData(activeProfileId);
            const path = await save({
                filters: [{ name: 'Robot Runner Flow', extensions: ['json'] }],
                defaultPath: `flowchart_export_${new Date().toISOString().split('T')[0]}.json`
            });

            if (path) {
                await invoke('save_file', { path, content: data, append: false });
                feedback.toast.success(t('mapper.flowchart.export_success'));
            }
        } catch (e) {
            console.error(e);
            feedback.toast.error(t('mapper.flowchart.export_error'));
        }
    };

    const handleImport = async () => {
        try {
            const path = await open({
                filters: [{ name: 'Robot Runner Flow', extensions: ['json'] }],
                multiple: false
            });

            if (path && typeof path === 'string') {
                const content = await invoke<string>('read_file', { path });
                await importMapperData(activeProfileId, content);
                feedback.toast.success(t('mapper.flowchart.import_success'));
                loadSavedMaps(); // Refresh list
            }
        } catch (e) {
            console.error(e);
            feedback.toast.error(t('mapper.flowchart.import_error'));
        }
    };

    // State for devices (REMOVED - Managed by Parent)
    const { sessions } = useTestSessions();
    // Only 'test' type sessions mark device as busy
    const busyDeviceIds = sessions.filter(s => s.status === 'running' && s.type === 'test').map(s => s.deviceUdid);

    // Derived State
    const selectedDevice = selectedDeviceId; // Prop-driven
    const isTestRunning = selectedDevice ? busyDeviceIds.includes(selectedDevice) : false;
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
            feedback.toast.success(t('mapper.feedback.updated'));

        } catch (e) {
            feedback.toast.error("mapper.update_error", e);
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
            feedback.toast.error("mapper.input_error", e);
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
            sendAdbInput(`tap ${coords.x} ${coords.y}`);
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
                <p>{t('mapper.empty')}</p>
            </div>
        );
    }

    if (isTestRunning) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-on-surface-variant/80 text-sm">
                <Scan size={32} className="opacity-20 mb-2" />
                <p>{t('mapper.status.paused_test', 'Mapper disabled during test')}</p>
            </div>
        );
    }

    return (
        <div ref={setContainerRef} className="h-full w-full flex flex-col space-y-4">
            {/* Toolbar - Now at the Top */}
            <Section
                title={t('mapper.title', 'Mapper')}
                icon={Scan}
                variant="transparent"
                className="p-0"
                status={
                    <div className="flex items-center gap-2">
                        <div className="text-xs text-on-surface/80">
                            {loading ? t('mapper.status.fetching') : t('mapper.status.ready')}
                        </div>
                        <div className="h-4 w-px bg-surface/80 mx-1" />
                        <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => sendAdbInput('keyevent 4')} className="p-1.5 hover:bg-surface-variant/30 rounded text-on-surface-variant/80" title={t('mapper.nav.back')}><ArrowLeft size={16} /></Button>
                            <Button variant="ghost" size="sm" onClick={() => sendAdbInput('keyevent 3')} className="p-1.5 hover:bg-surface-variant/30 rounded text-on-surface-variant/80" title={t('mapper.nav.home')}><Home size={16} /></Button>
                            <Button variant="ghost" size="sm" onClick={() => sendAdbInput('keyevent 187')} className="p-1.5 hover:bg-surface-variant/30 rounded text-on-surface-variant/80" title={t('mapper.nav.recents')}><Rows size={16} /></Button>
                        </div>
                    </div>
                }
                menus={
                    <div className="flex bg-surface-variant/30 p-0.5 rounded-2xl">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInteractionMode('inspect')}
                            className={clsx("p-1.5 rounded-2xl transition-all", interactionMode === 'inspect' ? "bg-primary/10 shadow-sm text-primary" : "text-on-surface/80 hover:text-on-surface-variant/80")}
                            title={t('mapper.modes.inspect')}
                        >
                            <Scan size={16} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInteractionMode('tap')}
                            className={clsx("p-1.5 rounded-2xl transition-all", interactionMode === 'tap' ? "bg-primary/10 shadow-sm text-primary" : "text-on-surface/80 hover:text-on-surface-variant/80")}
                            title={t('mapper.modes.tap')}
                        >
                            <MousePointerClick size={16} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInteractionMode('swipe')}
                            className={clsx("p-1.5 rounded-2xl transition-all", interactionMode === 'swipe' ? "bg-primary/10 shadow-sm text-primary" : "text-on-surface/80 hover:text-on-surface-variant/80")}
                            title={t('mapper.modes.swipe')}
                        >
                            <Move size={16} />
                        </Button>
                    </div>
                }
                actions={
                    <>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={refreshAll}
                            disabled={loading}
                            className={clsx(
                                "flex items-center gap-2 px-3 py-1.5 bg-surface-variant/30 border border-outline-variant/30 rounded-2xl hover:bg-surface/50 text-sm font-medium transition-colors disabled:opacity-50",
                                loading && "cursor-wait"
                            )}
                            title={t('mapper.refresh')}
                        >
                            {loading ? <ExpressiveLoading size="xsm" variant="circular" /> : <RefreshCw size={16} />}
                            <span className={clsx(isNarrow && "hidden")}>{t('mapper.refresh')}</span>
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                                loadSavedMaps();
                                setIsFlowchartOpen(true);
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-on-primary rounded-2xl hover:bg-primary/90 transition-colors shadow-sm text-sm font-medium"
                            title={t('mapper.flowchart.open', 'Open Flowchart')}
                        >
                            <GitGraph size={16} />
                            <span className={clsx(isNarrow && "hidden")}>{t('mapper.flowchart.open', 'Open Flowchart')}</span>
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
                            <p>{loading ? t('mapper.status.loading') : t('mapper.status.no_screenshot')}</p>
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
                                {t('mapper.properties')}
                            </div>
                        )}

                        {/* Clear Selection Button */}
                        {selectedNode && (
                            <button
                                onClick={() => {
                                    setSelectedNode(null);
                                    setAvailableNodes([]);
                                }}
                                className="p-1.5 text-on-surface/80 hover:text-error hover:bg-error-container/10 rounded-2xl transition-colors ml-2"
                                title={t('mapper.clear_selection')}
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                        <div className="pl-4 pr-4">
                            {/* Quick Copy Actions / Identifiers (Only if node selected) */}
                            {selectedNode && (
                                <div className="pt-4 pb-4 space-y-4">
                                    <div className="mt-1">
                                        <h3 className="text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider mb-2">{t('mapper.attributes.hierarchy')}</h3>
                                        <NodeBreadcrumbs
                                            node={selectedNode}
                                            onSelect={setSelectedNode}
                                            onHover={setHoveredNode}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* --- SCREEN MAPPER UI --- */}
                            <div className={clsx("pt-4 pb-4 border-t border-outline-variant/30", !selectedNode && "mt-0 border-t-0 pt-0")}>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
                                        <Wrench size={14} /> {t('mapper.screen_mapper')}
                                    </h3>
                                    {/* Saved Elements Dropdown */}
                                    {mappedElements.length > 0 && (
                                        <div className="ml-auto">
                                            <Combobox
                                                value={mappedElements.find(e => e.id === currentElement.id)?.name || ''}
                                                onChange={(name) => {
                                                    const el = mappedElements.find(e => e.name === name);
                                                    if (el) {
                                                        setCurrentElement(el);
                                                        setSelectedNode(null); // Clear selection to Switch context
                                                    }
                                                }}
                                                options={mappedElements.map(e => e.name)}
                                                placeholder={mappedElements.length + ' ' + t('mapper.elements_mapped')}
                                                triggerClassName="h-8 text-xs bg-surface-variant/10"
                                            />
                                        </div>
                                    )}
                                    {mappedElements.find(e => e.id === currentElement.id) && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={removeElementMapping}
                                            className="p-2 ml-2 text-on-surface/80 hover:text-error hover:bg-error-container/10"
                                            title={t('mapper.action.remove')}
                                        >
                                            <Trash2 size={16} />
                                        </Button>
                                    )}
                                    <Button
                                        onClick={saveElementMapping}
                                        variant="primary"
                                        size="sm"
                                        className="p-2 ml-2 hover:text-on-surface"
                                        title={mappedElements.find(e => e.id === currentElement.id) ? t('mapper.action.update') : t('mapper.action.add')}
                                    >
                                        {mappedElements.find(e => e.id === currentElement.id) ? t('mapper.action.update') : t('mapper.action.add')}
                                    </Button>
                                </div>

                                {/* Identifiers Section - Moved here as requested */}
                                <div className="mb-2 space-y-2">
                                    {(selectedNode || currentElement.accessibility_id || currentElement.android_id) && (
                                        <h3 className="text-xs text-on-surface-variant/80 font-medium">{t('mapper.attributes.identifiers')}</h3>
                                    )}

                                    {selectedNode ? (
                                        <div className="grid grid-cols-2 gap-2">
                                            <CopyButton
                                                label={t('mapper.attributes.access_id')}
                                                value={selectedNode.attributes['content-desc']}
                                                onCopy={(v) => copyToClipboard(v, 'aid')}
                                                active={copied === 'aid'}
                                            />
                                            <CopyButton
                                                label={t('mapper.attributes.resource_id')}
                                                value={selectedNode.attributes['resource-id']}
                                                onCopy={(v) => copyToClipboard(v, 'rid')}
                                                active={copied === 'rid'}
                                            />
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2">
                                            {currentElement.accessibility_id && (
                                                <CopyButton
                                                    label={t('mapper.attributes.access_id')}
                                                    value={currentElement.accessibility_id}
                                                    onCopy={(v) => copyToClipboard(v, 'aid')}
                                                    active={copied === 'aid'}
                                                />
                                            )}
                                            {currentElement.android_id && (
                                                <CopyButton
                                                    label={t('mapper.attributes.resource_id')}
                                                    value={currentElement.android_id}
                                                    onCopy={(v) => copyToClipboard(v, 'rid')}
                                                    active={copied === 'rid'}
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    {/* Name and Type Row */}
                                    <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                                        <div className="space-y-1">
                                            <label className="text-xs text-on-surface-variant/80 font-medium">{t('mapper.input.element_name')} <span className="text-error">*</span></label>
                                            <Input
                                                value={currentElement.name || ''}
                                                onChange={(e) => updateElement('name', e.target.value)}
                                                className="bg-surface-variant/10"
                                                placeholder={t('mapper.placeholder.element_name')}
                                            />
                                        </div>
                                        <div className="w-32 space-y-1">
                                            <label className="text-xs text-on-surface-variant/80 font-medium">{t('mapper.input.element_type')}</label>
                                            <Select
                                                value={currentElement.type || 'button'}
                                                onChange={(e) => updateElement('type', e.target.value)}
                                                options={(['button', 'input', 'text', 'link', 'toggle', 'checkbox', 'image', 'menu', 'scroll_view', 'tab'] as UIElementType[]).map(type => ({
                                                    label: t(`mapper.types.${type}`),
                                                    value: type
                                                }))}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                                        <div className="space-y-4">
                                            {/* Navigation Target */}
                                            <div className="space-y-1">
                                                <Combobox
                                                    label={t('mapper.input.navigates_to')}
                                                    value={currentElement.navigates_to || ''}
                                                    onChange={(val) => updateElement('navigates_to', val)}
                                                    options={savedMaps.map(m => m.name)}
                                                    placeholder={t('mapper.placeholder.navigates_to')}
                                                />
                                            </div>

                                            {/* Complex: Menu Options */}
                                            {currentElement.type === 'menu' && (
                                                <div className="space-y-1">
                                                    <label className="text-xs text-on-surface-variant/80 font-medium">{t('mapper.input.menu_options')}</label>
                                                    <Textarea
                                                        value={currentElement.menu_options?.join(',') || ''}
                                                        onChange={(e) => updateElement('menu_options', e.target.value.split(','))}
                                                        className="bg-surface-variant/10 h-20"
                                                        placeholder={t('mapper.placeholder.menu_options')}
                                                    />
                                                </div>
                                            )}

                                            {/* Complex: Tab Parent */}
                                            {currentElement.type === 'tab' && (
                                                <div className="space-y-1">
                                                    <Combobox
                                                        label={t('mapper.input.parent_screen')}
                                                        value={currentElement.parent_screen || ''}
                                                        onChange={(val) => updateElement('parent_screen', val)}
                                                        options={savedMaps.map(m => m.name)}
                                                        placeholder={t('mapper.placeholder.parent_screen')}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* Action Buttons Column */}
                                        <div className="flex flex-col gap-2 pt-6 w-32">


                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* ALWAYS VISIBLE: Screen Settings Footer */}
                    <div className="p-4 border-t border-outline-variant/30 bg-surface/50">
                        <div className="space-y-3">
                            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                                <Combobox
                                    value={screenName}
                                    onChange={setScreenName}
                                    options={savedMaps.map(m => m.name)}
                                    placeholder={t('mapper.placeholder.screen_name')}
                                />
                                <div className="w-32">
                                    <Select
                                        value={screenType}
                                        onChange={(e) => setScreenType(e.target.value as any)}
                                        options={['screen', 'modal', 'tab', 'drawer'].map(type => ({
                                            label: t(`mapper.screen_types.${type}`),
                                            value: type
                                        }))}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <Button
                                    onClick={() => {
                                        setScreenName('');
                                        setScreenType('screen');
                                        setMappedElements([]);
                                        setScreenshot(null);
                                        refreshAll();
                                        setSavedMaps(prev => [...prev]);
                                        feedback.toast.success(t('mapper.feedback.new_screen'));
                                    }}
                                    className="px-3 py-1.5 bg-surface border border-outline-variant/30 rounded text-sm font-medium hover:bg-surface-variant/10 text-on-surface/80 flex items-center gap-2 transition-colors"
                                    title={t('mapper.action.new')}
                                >
                                    <Wrench size={16} />
                                    {t('mapper.action.new')}
                                </Button>

                                <div className="relative">
                                    <Button
                                        onClick={() => setShowLoadMenu(!showLoadMenu)}
                                        className="px-3 py-1.5 bg-surface border border-outline-variant/30 rounded text-sm font-medium hover:bg-surface-variant/10 text-on-surface/80 flex items-center gap-2 transition-colors"
                                        title={t('mapper.action.load')}
                                    >
                                        <RefreshCw size={16} />
                                    </Button>
                                    {/* Load Menu Dropdown */}
                                    {showLoadMenu && (
                                        <div className="absolute bottom-full left-0 mb-2 w-64 bg-surface rounded-xl shadow-xl border border-outline-variant/30 overflow-hidden z-50 flex flex-col max-h-60">
                                            <div className="p-3 border-b border-outline-variant/30 text-xs font-bold text-on-surface-variant/50 uppercase tracking-wider bg-surface-variant/10">
                                                {t('mapper.saved_screens')}
                                            </div>
                                            <div className="overflow-y-auto custom-scrollbar flex-1">
                                                {savedMaps.length === 0 ? (
                                                    <div className="p-4 text-center text-xs text-on-surface-variant/50 italic">{t('mapper.no_saved_maps')}</div>
                                                ) : (
                                                    savedMaps.map(map => (
                                                        <div
                                                            key={map.id}
                                                            onClick={() => handleLoadScreen(map)}
                                                            className="flex items-center justify-between p-3 hover:bg-surface-variant/20 cursor-pointer border-b border-outline-variant/10 last:border-0 transition-colors group"
                                                        >
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-sm font-medium text-on-surface">{map.name}</span>
                                                                <span className="text-[10px] text-on-surface-variant/50 uppercase">{t(`mapper.screen_types.${map.type}`)}</span>
                                                            </div>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={(e) => handleDeleteScreen(map.id, e)}
                                                                className="p-1.5 opacity-0 group-hover:opacity-100 hover:text-error hover:bg-error/10 rounded transition-all"
                                                                title={t('mapper.action.delete')}
                                                            >
                                                                <Trash2 size={16} />
                                                            </Button>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <Button
                                    onClick={handleImport}
                                    className="ml-2 p-2 hover:bg-primary/10 text-primary rounded-full"
                                    title={t('mapper.flowchart.import', 'Import Flow')}>
                                    <Download size={16} />
                                </Button>
                                <Button
                                    onClick={handleExport}
                                    className="ml-2 p-2 mr-auto hover:bg-primary/10 text-primary rounded-full"
                                    title={t('mapper.flowchart.export', 'Export Flow')}>
                                    <Upload size={16} />
                                </Button>
                                {screenName && savedMaps.find(m => m.name === screenName) && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                            const map = savedMaps.find(m => m.name === screenName);
                                            if (map) handleDeleteScreen(map.id, e)
                                        }}
                                        className="p-2 text-on-surface/80 hover:text-error hover:bg-error-container/10"
                                        title={t('mapper.action.discard_desc')}
                                    >
                                        <Trash2 size={16} />
                                    </Button>
                                )}
                                <Button
                                    onClick={() => {
                                        handleSaveScreen();
                                        refreshAll();
                                    }}
                                    className="px-3 py-1.5 bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 flex items-center justify-center gap-2 transition-colors shadow-sm"
                                >
                                    <Save size={16} />
                                    {t('mapper.action.save_screen')}
                                </Button>

                            </div>
                        </div>
                    </div>
                </div >
            </div >

            <FlowchartModal
                isOpen={isFlowchartOpen}
                onClose={() => setIsFlowchartOpen(false)}
                maps={savedMaps}
                onEditScreen={(name) => {
                    const map = savedMaps.find(m => m.name === name);
                    if (map) {
                        handleLoadScreen(map);
                        setIsFlowchartOpen(false);
                    }
                }}
                onRefresh={loadSavedMaps}
                activeProfileId={activeProfileId}
            />

            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={() => {
                    confirmDeleteScreen();
                    refreshAll();
                }}
                title={t('mapper.confirm.delete_title', 'Delete Screen Map?')}
                description={t('mapper.confirm.delete_desc', 'Are you sure you want to delete this screen map? This action cannot be undone.')}
                variant="danger"
                confirmText={t('mapper.action.delete')}
            />
        </div >
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
        <button
            onClick={() => onCopy(value)}
            className={clsx(
                "flex flex-col items-start p-2 rounded-2xl border transition-all text-left",
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
                    {active && <div className="flex items-center gap-1"><Check size={12} />{t("mapper.attributes.copied")}</div>}
                </div>
            </span>
            <span className="text-xs font-mono truncate w-full" title={value}>{value}</span>
        </button>
    );
}

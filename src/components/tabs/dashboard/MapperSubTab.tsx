
import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Maximize, Check, Scan, Home, ArrowLeft, Rows, X, RefreshCw, Save, GitGraph, Trash2, Upload, Download, Plus, FileClock, FileInput, SearchCode, ChevronDown, ChevronUp } from 'lucide-react';
import { XMLParser } from 'fast-xml-parser';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useOutsideClick } from '@/hooks/useOutsideClick';
import { InspectorNode, transformXmlToTree, findNodesAtCoords, generateXPath, transformBounds } from '@/lib/inspectorUtils';
import { feedback } from "@/lib/feedback";
import { Section } from "@/components/organisms/Section";
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
    const [imgLayout, setImgLayout] = useState<{ width: number, height: number, naturalWidth: number, naturalHeight: number } | null>(null);
    const [selectedNode, setSelectedNode] = useState<InspectorNode | null>(null);
    const [hoveredNode, setHoveredNode] = useState<InspectorNode | null>(null);

    // --- Screen Mapper State ---
    const [screenName, setScreenName] = useState("");
    const [screenType, setScreenType] = useState<'screen' | 'modal' | 'tab' | 'drawer'>('screen');
    const [mappedElements, setMappedElements] = useState<UIElementMap[]>([]);
    const [currentElement, setCurrentElement] = useState<Partial<UIElementMap>>({});
    const [savedMaps, setSavedMaps] = useState<ScreenMap[]>([]);
    const [showLoadMenu, setShowLoadMenu] = useState(false);
    const loadMenuRef = useRef<HTMLDivElement>(null);
    const [showElementsMenu, setShowElementsMenu] = useState(false);
    const elementsMenuRef = useRef<HTMLDivElement>(null);

    // Helper state for confirmation modal
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [screenToDelete, setScreenToDelete] = useState<string | null>(null);
    const [isFlowchartOpen, setIsFlowchartOpen] = useState(false);

    useOutsideClick(loadMenuRef, () => {
        if (showLoadMenu) setShowLoadMenu(false);
    });

    useOutsideClick(elementsMenuRef, () => {
        if (showElementsMenu) setShowElementsMenu(false);
    });

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

    const removeElementMapping = (id?: string) => {
        const targetId = id || currentElement.id;
        if (!targetId) return;

        setMappedElements(prev => prev.filter(e => e.id !== targetId));

        // If deleting current element, clear fields
        if (targetId === currentElement.id) {
            setCurrentElement({});
            setSelectedNode(null);
        }

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

    // Interaction State
    const [swipeStart, setSwipeStart] = useState<{ x: number, y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);

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
            feedback.toast.error(t("mapper.update_error"), e);
        } finally {
            setLoading(false);
        }
    };

    const sendAdbInput = async (cmd: string) => {
        const args = ['shell', 'input', ...cmd.split(' ')];
        try {
            await invoke('run_adb_command', { device: selectedDevice, args });
            // Auto-refresh after input to show updated state
            setTimeout(refreshAll, 1500);
        } catch (e) {
            feedback.toast.error(t("mapper.input_error"), e);
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
                // Dragged -> Swipe
                sendAdbInput(`swipe ${swipeStart.x} ${swipeStart.y} ${end.x} ${end.y} 500`);
                addSwipeAnimation(swipeStart.x, swipeStart.y, end.x, end.y);
            } else if (end && !isDragging) {
                // Not dragged -> Select
                processMouseInteraction(e, false);
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
        if (!node || !node.bounds || !imgLayout || !rootNode) return {};

        const { width: dispWidth, height: dispHeight, naturalWidth, naturalHeight } = imgLayout;

        const xmlWidth = rootNode.bounds?.w || naturalWidth;
        const xmlHeight = rootNode.bounds?.h || naturalHeight;

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

    return (
        <div ref={setContainerRef} className="flex-1 min-h-[700px] flex flex-col space-y-4">
            {!selectedDevice ? (
                <div className="h-full flex-1 flex flex-col items-center justify-center text-on-surface/80">
                    <Scan size={48} className="mb-4 opacity-20" />
                    <p>{t('mapper.empty')}</p>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                            loadSavedMaps();
                            setIsFlowchartOpen(true);
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 mt-4 bg-primary text-on-primary rounded-2xl hover:bg-primary/90 transition-colors shadow-sm text-sm font-medium"
                        title={t('mapper.flowchart.open', 'Open Flowchart')}
                    >
                        <GitGraph size={16} />
                        <span className={clsx(isNarrow && "hidden")}>{t('mapper.flowchart.open', 'Open Flowchart')}</span>
                    </Button>
                </div>
            ) : isTestRunning ? (
                <div className="h-full flex-1 flex flex-col items-center justify-center text-on-surface-variant/80 text-sm">
                    <Scan size={32} className="opacity-20 mb-2" />
                    <p>{t('mapper.status.paused_test', 'Mapper disabled during test')}</p>
                </div>
            ) : (
                <>
                    {/* Toolbar */}
                    <Section
                        title={t('mapper.title', 'Mapper')}
                        icon={Scan}
                        variant="transparent"
                        className="p-0"
                        status={
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2">
                                    <span className={clsx(
                                        "px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider",
                                        screenshot ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                                    )}>
                                        {screenshot ? t('mapper.status.ready') : (loading ? t('mapper.status.fetching') : t('mapper.status.loading'))}
                                    </span>
                                </div>
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => sendAdbInput('keyevent 4')} className="p-1.5 hover:bg-surface-variant/30 rounded text-on-surface-variant/80" title={t('mapper.nav.back')}><ArrowLeft size={16} /></Button>
                                    <Button variant="ghost" size="sm" onClick={() => sendAdbInput('keyevent 3')} className="p-1.5 hover:bg-surface-variant/30 rounded text-on-surface-variant/80" title={t('mapper.nav.home')}><Home size={16} /></Button>
                                    <Button variant="ghost" size="sm" onClick={() => sendAdbInput('keyevent 187')} className="p-1.5 hover:bg-surface-variant/30 rounded text-on-surface-variant/80" title={t('mapper.nav.recents')}><Rows size={16} /></Button>
                                </div>
                            </div>
                        }
                        menus={null}
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
                    >
                    </Section>

                    <div className="flex-1 grid grid-cols-[auto_1fr] gap-4 min-h-0 overflow-hidden">
                        {/* Device Screen */}
                        <div className="flex flex-col items-center justify-center overflow-hidden relative max-w-[30vw] bg-surface-variant/5 border border-outline-variant/20 rounded-2xl p-4">
                            {screenshot ? (
                                <div className="relative inline-block shadow-2xl rounded-lg border border-outline-variant/30 flex-shrink-0 mb-4">
                                    <img
                                        ref={imgRef}
                                        src={`data:image/png;base64,${screenshot}`}
                                        alt="Device Screenshot"
                                        className="block w-auto h-auto max-w-full max-h-[650px] select-none rounded-lg"
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
                                    {/* Animation Layers */}
                                    {taps.map(tap => (
                                        <div
                                            key={tap.id}
                                            className="absolute rounded-full bg-primary/30 border-2 border-primary animate-ping pointer-events-none"
                                            style={{ left: tap.x - 20, top: tap.y - 20, width: 40, height: 40 }}
                                        />
                                    ))}
                                    {swipes.map(swipe => (
                                        <svg key={swipe.id} className="absolute top-0 left-0 w-full h-full pointer-events-none z-30">
                                            <line
                                                x1={swipe.startX} y1={swipe.startY}
                                                x2={swipe.endX} y2={swipe.endY}
                                                stroke="var(--color-primary)"
                                                strokeWidth="4"
                                                strokeDasharray="8 4"
                                                className="animate-pulse"
                                            />
                                        </svg>
                                    ))}
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

                        {/* Properties Panel */}
                        <div className="bg-surface border border-outline-variant/30 rounded-2xl flex flex-col overflow-hidden shadow-sm flex-1">
                            {/* Screen Settings */}
                            <div className="p-4 border-t border-outline-variant/30 bg-surface/50 space-y-3">
                                <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                                    <Combobox
                                        label={t('mapper.screen_name')}
                                        value={screenName}
                                        onChange={setScreenName}
                                        options={savedMaps.map(m => m.name)}
                                        placeholder={t('mapper.placeholder.screen_name')}
                                    />
                                    <div className="w-32">
                                        <Select
                                            label={t('mapper.screen_type')}
                                            value={screenType}
                                            onChange={(e) => setScreenType(e.target.value as any)}
                                            options={['screen', 'modal', 'tab', 'drawer'].map(type => ({
                                                label: t(`mapper.screen_types.${type}`),
                                                value: type
                                            }))}
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={() => { handleSaveScreen(); refreshAll(); }} variant="primary">
                                        <Save size={16} className="mr-2" /> {t('mapper.action.save_screen')}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setScreenName('');
                                            setScreenType('screen');
                                            setMappedElements([]);
                                            setScreenshot(null);
                                            refreshAll();
                                        }}
                                        className="gap-2"
                                    >
                                        <Plus size={16} /> {t('mapper.action.new')}
                                    </Button>
                                    <div className="relative group" ref={loadMenuRef}>
                                        <Button variant="ghost" size="icon" onClick={() => setShowLoadMenu(!showLoadMenu)}><FileClock size={16} /></Button>
                                        {showLoadMenu && (
                                            <div className="absolute top-full left-0 mt-2 w-64 bg-surface rounded-xl shadow-xl border border-outline-variant/30 overflow-hidden z-[100] flex flex-col max-h-60">
                                                <div className="p-3 border-b border-outline-variant/30 text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest bg-surface-variant/5">
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
                                                                className="flex items-center justify-between p-3 hover:bg-surface-variant/10 cursor-pointer border-b border-outline-variant/5 last:border-0 transition-colors group/item"
                                                            >
                                                                <div className="flex flex-col gap-0.5">
                                                                    <span className="text-sm font-medium text-on-surface">{map.name}</span>
                                                                    <span className="text-[10px] text-on-surface-variant/50 uppercase">{t(`mapper.screen_types.${map.type}`)}</span>
                                                                </div>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={(e) => handleDeleteScreen(map.id, e)}
                                                                    className="p-1.5 opacity-0 group-hover/item:opacity-100 hover:text-error hover:bg-error/10 rounded transition-all"
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
                                    <div className="flex-1 flex justify-end gap-2">
                                        <Button onClick={handleImport} variant="ghost" size="icon"><Download size={16} /></Button>
                                        <Button onClick={handleExport} variant="ghost" size="icon"><Upload size={16} /></Button>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between border-t border-b border-outline-variant/30 p-4">
                                <h3 className="text-sm font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
                                    <SearchCode size={14} /> {t('mapper.screen_mapper')}
                                </h3>
                                <div className="flex gap-2">
                                    <div className="relative group" ref={elementsMenuRef}>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setShowElementsMenu(!showElementsMenu)}
                                            className={clsx(showElementsMenu ? "text-primary bg-primary/10" : "text-on-surface-variant/80")}
                                            title={t('mapper.saved_elements', 'Saved Elements')}
                                        >
                                            <FileClock size={16} />
                                        </Button>

                                        {showElementsMenu && (
                                            <div className="absolute top-full right-0 mt-2 w-64 bg-surface rounded-xl shadow-xl border border-outline-variant/30 overflow-hidden z-[100] flex flex-col max-h-60">
                                                <div className="p-3 border-b border-outline-variant/30 text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest bg-surface-variant/5">
                                                    {t('mapper.saved_elements', 'Saved Elements')}
                                                </div>
                                                <div className="overflow-y-auto custom-scrollbar flex-1">
                                                    {mappedElements.length === 0 ? (
                                                        <div className="p-4 text-center text-xs text-on-surface-variant/50 italic">{t('mapper.no_saved_elements', 'No elements mapped')}</div>
                                                    ) : (
                                                        mappedElements.map(el => (
                                                            <div
                                                                key={el.id}
                                                                onClick={() => {
                                                                    setCurrentElement(el);
                                                                    // Try to find matching node in current tree if possible
                                                                    if (rootNode) {
                                                                        const findNodeById = (node: InspectorNode): InspectorNode | null => {
                                                                            if (generateXPath(node) === el.id) return node;
                                                                            for (const child of node.children) {
                                                                                const found = findNodeById(child);
                                                                                if (found) return found;
                                                                            }
                                                                            return null;
                                                                        };
                                                                        const matchingNode = findNodeById(rootNode);
                                                                        if (matchingNode) setSelectedNode(matchingNode);
                                                                    }
                                                                    setShowElementsMenu(false);
                                                                }}
                                                                className={clsx(
                                                                    "flex items-center justify-between p-3 hover:bg-surface-variant/10 cursor-pointer border-b border-outline-variant/5 last:border-0 transition-colors group/ele",
                                                                    currentElement.id === el.id && "bg-primary/5"
                                                                )}
                                                            >
                                                                <div className="flex flex-col gap-0.5 truncate pr-2">
                                                                    <span className="text-sm font-medium text-on-surface truncate">{el.name}</span>
                                                                    <span className="text-[10px] text-on-surface-variant/50 uppercase">{t(`mapper.types.${el.type}`)}</span>
                                                                </div>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        removeElementMapping(el.id);
                                                                    }}
                                                                    className="p-1.5 opacity-0 group-hover/ele:opacity-100 hover:text-error hover:bg-error/10 rounded transition-all"
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
                                    <Button onClick={saveElementMapping} variant="primary" size="sm"><FileInput size={16} className="mr-2" />{mappedElements.find(e => e.id === currentElement.id) ? t('mapper.action.update') : t('mapper.action.add')}</Button>
                                </div>
                            </div>
                            <div className="flex items-center justify-between border-b border-outline-variant/30 shrink-0 bg-surface/50 pr-2">
                                {availableNodes.length > 1 ? (
                                    <div className="flex overflow-x-auto custom-scrollbar flex-1">
                                        {availableNodes.map((node) => (
                                            <button
                                                key={node.id}
                                                onClick={() => setSelectedNode(node)}
                                                className={clsx(
                                                    "px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                                                    selectedNode === node
                                                        ? "border-primary text-primary bg-surface-variant/30"
                                                        : "border-transparent text-on-surface-variant/80 hover:text-on-surface-variant/80 hover:bg-surface-variant/30"
                                                )}
                                            >
                                                {node.tagName}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="px-4 py-3 text-sm font-semibold text-on-surface-variant/80 flex-1">
                                        {t('mapper.properties')}
                                    </div>
                                )}
                                {selectedNode && (
                                    <button
                                        onClick={() => {
                                            setSelectedNode(null);
                                            setAvailableNodes([]);
                                        }}
                                        className="p-1.5 text-on-surface/80 hover:text-error hover:bg-error-container/10 rounded-2xl transition-colors ml-2"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                                <div className="p-4 space-y-4">
                                    {selectedNode ? (
                                        <>
                                            <div className="space-y-4">
                                                <NodeBreadcrumbs
                                                    node={selectedNode}
                                                    onSelect={setSelectedNode}
                                                    onHover={setHoveredNode}
                                                />
                                            </div>

                                            {/* Identifiers Section */}
                                            <div className="mb-4 space-y-2">
                                                <h3 className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">{t('inspector.attributes.identifiers')}</h3>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                    <CopyButton
                                                        label={t('inspector.attributes.access_id')}
                                                        value={selectedNode.attributes['content-desc']}
                                                        onCopy={(v: string) => copyToClipboard(v, 'aid')}
                                                        active={copied === 'aid'}
                                                    />
                                                    <CopyButton
                                                        label={t('inspector.attributes.resource_id')}
                                                        value={selectedNode.attributes['resource-id']}
                                                        onCopy={(v: string) => copyToClipboard(v, 'rid')}
                                                        active={copied === 'rid'}
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 gap-4">
                                                <Input
                                                    label={t('mapper.input.element_name')}
                                                    value={currentElement.name || ''}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateElement('name', e.target.value)}
                                                    placeholder={t('mapper.placeholder.element_name')}
                                                />
                                                <div className="grid grid-cols-2 gap-4">
                                                    <Select
                                                        label={t('mapper.input.element_type')}
                                                        value={currentElement.type || 'button'}
                                                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateElement('type', e.target.value)}
                                                        options={(['button', 'input', 'text', 'link', 'toggle', 'checkbox', 'image', 'menu', 'scroll_view', 'tab'] as UIElementType[]).map(type => ({
                                                            label: t(`mapper.types.${type}`),
                                                            value: type
                                                        }))}
                                                    />
                                                    <Combobox
                                                        label={t('mapper.input.navigates_to')}
                                                        value={currentElement.navigates_to || ''}
                                                        onChange={(val) => updateElement('navigates_to', val)}
                                                        options={savedMaps.map(m => m.name)}
                                                        placeholder={t('mapper.placeholder.navigates_to')}
                                                    />
                                                </div>

                                                {/* Complex Fields */}
                                                {currentElement.type === 'menu' && (
                                                    <Textarea
                                                        label={t('mapper.input.menu_options')}
                                                        value={currentElement.menu_options?.join(',') || ''}
                                                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateElement('menu_options', e.target.value.split(','))}
                                                        placeholder={t('mapper.placeholder.menu_options')}
                                                        className="h-20"
                                                    />
                                                )}
                                                {currentElement.type === 'tab' && (
                                                    <Combobox
                                                        label={t('mapper.input.parent_screen')}
                                                        value={currentElement.parent_screen || ''}
                                                        onChange={(val) => updateElement('parent_screen', val)}
                                                        options={savedMaps.map(m => m.name)}
                                                        placeholder={t('mapper.placeholder.parent_screen')}
                                                    />
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-on-surface/80 p-8 text-center">
                                            <Scan size={48} className="mb-4 opacity-20" />
                                            <p className="text-sm">{t('mapper.select_element')}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

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
        </div>
    );
}

// --- Helper Components ---

function NodeBreadcrumbs({ node, onSelect, onHover }: { node: InspectorNode | null, onSelect: (n: InspectorNode) => void, onHover: (n: InspectorNode | null) => void }) {
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(false);

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

    // Determine visible path
    const displayPath = isExpanded ? path : path.slice(-2);
    const isHidden = path.length > 2 && !isExpanded;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1 text-xs text-on-surface-variant/80 font-mono p-2 bg-surface/50 rounded border border-outline-variant/30">
                {isHidden && (
                    <div className="flex items-center">
                        <span className="px-1 opacity-50">...</span>
                        <span className="mx-1 text-on-surface/80">&gt;</span>
                    </div>
                )}
                {displayPath.map((n, i) => (
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
                {path.length > 2 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="h-6 px-2 text-[10px] gap-1 hover:bg-surface-variant/50 ml-auto"
                    >
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {isExpanded ? t('common.collapse', 'Collapse') : t('common.expand', 'Expand')}
                    </Button>
                )}
            </div>
        </div>
    );
}

function CopyButton({ label, value, onCopy, active }: { label: string, value: string | undefined, onCopy: (v: string) => void, active: boolean }) {
    const { t } = useTranslation();
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

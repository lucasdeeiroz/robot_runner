
import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { XMLParser } from 'fast-xml-parser';
import { InspectorNode, transformXmlToTree, findNodesAtCoords } from '@/lib/inspectorUtils';
import { feedback } from '@/lib/feedback';
import { useSettings } from '@/lib/settings';

interface DeviceViewportOptions {
    deviceId: string | null;
    isActive: boolean;
    isBusy?: boolean; // e.g. test is running
    onRefreshSuccess?: () => void;
    onNodeSelected?: (node: InspectorNode | null) => void;
    onNodeHovered?: (node: InspectorNode | null) => void;
}

export function useDeviceViewport({
    deviceId: initialDeviceId,
    isActive,
    isBusy = false,
    onRefreshSuccess,
    onNodeSelected,
    onNodeHovered
}: DeviceViewportOptions) {
    const { activeWebUrl, is_test_mode, setActiveWebUrl } = useSettings();
    const getHeadlessBrowser = (id: string | null): string => {
        if (!id) return 'headless-chrome';
        if (id.includes('firefox')) return 'headless-firefox';
        return 'headless-chrome';
    };
    const deviceId = is_test_mode === 'web'
        ? getHeadlessBrowser(initialDeviceId)
        : initialDeviceId;
    const [screenshot, setScreenshot] = useState<string | null>(null);
    const [rootNode, setRootNode] = useState<InspectorNode | null>(null);
    const [loading, setLoading] = useState(false);
    const [imgLayout, setImgLayout] = useState<{ width: number, height: number, naturalWidth: number, naturalHeight: number } | null>(null);
    const [selectedNode, setSelectedNode] = useState<InspectorNode | null>(null);
    const [hoveredNode, setHoveredNode] = useState<InspectorNode | null>(null);

    const [taps, setTaps] = useState<{ id: number, x: number, y: number }[]>([]);
    const [swipes, setSwipes] = useState<{ id: number, startX: number, startY: number, endX: number, endY: number }[]>([]);

    const [swipeStart, setSwipeStart] = useState<{ x: number, y: number } | null>(null);
    const [swipeStartTime, setSwipeStartTime] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const imgRef = useRef<HTMLImageElement>(null);
    const prevBusy = useRef(isBusy);

    const [availableNodes, setAvailableNodes] = useState<InspectorNode[]>([]);

    const refreshAll = useCallback(async (compressed: boolean = true, forceClearScreenshot: boolean = false, targetWebUrl?: string) => {
        if (!deviceId) return;
        setLoading(true);

        // Immediately clear selection and hover elements to avoid showing stale highlighter boundaries
        setSelectedNode(null);
        setHoveredNode(null);
        setAvailableNodes([]);
        if (onNodeSelected) onNodeSelected(null);
        if (onNodeHovered) onNodeHovered(null);

        if (forceClearScreenshot) {
            setScreenshot(null);
            setRootNode(null);
        }

        try {
            const webUrlParam = targetWebUrl || (is_test_mode === 'web' ? activeWebUrl : undefined);
            const b64 = compressed 
                ? await invoke<string>('get_compressed_screenshot', { deviceId, maxWidth: 1024, maxHeight: 1024, webUrl: webUrlParam })
                : await invoke<string>('get_screenshot', { deviceId, webUrl: webUrlParam });
            
            const prefix = compressed ? 'data:image/jpeg;base64,' : 'data:image/png;base64,';
            setScreenshot(b64.startsWith('data:') ? b64 : `${prefix}${b64}`);

            const xml = await invoke<string>('get_xml_dump', { deviceId, webUrl: webUrlParam });
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: "",
                textNodeName: "_text"
            });
            const jsonObj = parser.parse(xml);
            const root = jsonObj.hierarchy ? transformXmlToTree(jsonObj.hierarchy) : transformXmlToTree(jsonObj);
            setRootNode(root);

            if (is_test_mode === 'web' && root && root.attributes && root.attributes.currentUrl) {
                const browserUrl = root.attributes.currentUrl;
                if (browserUrl && browserUrl !== activeWebUrl) {
                    setActiveWebUrl(browserUrl);
                }
            }

            if (onRefreshSuccess) onRefreshSuccess();
        } catch (e) {
            feedback.toast.error("inspector.update_error", e);
        } finally {
            setLoading(false);
        }
    }, [deviceId, onRefreshSuccess, is_test_mode, activeWebUrl, onNodeSelected, onNodeHovered]);

    // Handle auto-refresh on activation or busy state change
    useEffect(() => {
        if (!deviceId) {
            setScreenshot(null);
            setRootNode(null);
            setSelectedNode(null);
            setAvailableNodes([]);
            prevBusy.current = isBusy;
            return;
        }

        const wasBusy = prevBusy.current;
        prevBusy.current = isBusy;

        if (isActive && !isBusy) {
            if (wasBusy) {
                // Device just finished a busy task, wait a bit for system to settle
                const timer = setTimeout(() => refreshAll(), 1500);
                return () => clearTimeout(timer);
            } else {
                refreshAll();
            }
        }
    }, [deviceId, isActive, isBusy, refreshAll]);

    const addTapAnimation = useCallback((x: number, y: number) => {
        const id = Date.now();
        if (!imgRef.current || !rootNode?.bounds) return;
        const rect = imgRef.current.getBoundingClientRect();
        
        // Scale from XML space to screen space
        const scaleX = rect.width / rootNode.bounds.w;
        const scaleY = rect.height / rootNode.bounds.h;

        setTaps(prev => [...prev, { id, x: x * scaleX, y: y * scaleY }]);
        setTimeout(() => setTaps(prev => prev.filter(t => t.id !== id)), 500);
    }, [rootNode]);

    const addSwipeAnimation = useCallback((startX: number, startY: number, endX: number, endY: number) => {
        const id = Date.now();
        if (!imgRef.current || !rootNode?.bounds) return;
        const rect = imgRef.current.getBoundingClientRect();
        
        // Scale from XML space to screen space
        const scaleX = rect.width / rootNode.bounds.w;
        const scaleY = rect.height / rootNode.bounds.h;

        setSwipes(prev => [...prev, {
            id,
            startX: startX * scaleX,
            startY: startY * scaleY,
            endX: endX * scaleX,
            endY: endY * scaleY
        }]);
        setTimeout(() => setSwipes(prev => prev.filter(s => s.id !== id)), 600);
    }, [rootNode]);

    const sendAdbInput = useCallback(async (cmd: string) => {
        if (!deviceId || isBusy || is_test_mode === 'web') return;
        const args = ['shell', 'input', ...cmd.split(' ')];
        try {
            await invoke('run_adb_command', { device: deviceId, args });
            setTimeout(() => refreshAll(), 1500);
        } catch (e) {
            feedback.toast.error("inspector.input_error", e);
        }
    }, [deviceId, isBusy, is_test_mode, refreshAll]);

    const getCoords = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
        if (!imgRef.current) return null;
        const rect = imgRef.current.getBoundingClientRect();
        
        // Coords in Natural Image space (the resized dimensions)
        const scaleX = imgRef.current.naturalWidth / rect.width;
        const scaleY = imgRef.current.naturalHeight / rect.height;
        const naturalX = (e.clientX - rect.left) * scaleX;
        const naturalY = (e.clientY - rect.top) * scaleY;

        // If we have a rootNode, we should scale back to its coordinate system (original device size)
        if (rootNode?.bounds) {
            const xmlW = rootNode.bounds.w;
            const xmlH = rootNode.bounds.h;
            const imgW = imgRef.current.naturalWidth;
            const imgH = imgRef.current.naturalHeight;

            if (imgW > 0 && imgH > 0) {
                return {
                    x: Math.round((naturalX / imgW) * xmlW),
                    y: Math.round((naturalY / imgH) * xmlH)
                };
            }
        }

        return {
            x: Math.round(naturalX),
            y: Math.round(naturalY)
        };
    }, [rootNode]);

    const processInteractionAt = useCallback((coords: { x: number, y: number }, isHover: boolean) => {
        if (!rootNode) return;
        const candidates = findNodesAtCoords(rootNode, coords.x, coords.y);
        if (candidates.length === 0) {
            if (isHover) setHoveredNode(null);
            return;
        }

        const best = candidates[0];

        if (isHover) {
            setHoveredNode(best);
            if (onNodeHovered) onNodeHovered(best);
        } else {
            // Priority-based sorting for selection stack
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
            if (onNodeSelected) onNodeSelected(exactMatches[0]);
        }
    }, [rootNode, onNodeHovered, onNodeSelected]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
        const coords = getCoords(e);
        if (!coords) return;

        if (swipeStart) {
            const dist = Math.sqrt(Math.pow(coords.x - swipeStart.x, 2) + Math.pow(coords.y - swipeStart.y, 2));
            if (dist > 10) setIsDragging(true);
        } else {
            processInteractionAt(coords, true);
        }
    }, [swipeStart, getCoords, processInteractionAt]);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
        const coords = getCoords(e);
        if (coords) {
            setSwipeStart(coords);
            setSwipeStartTime(Date.now());
            setIsDragging(false);
        }
    }, [getCoords]);

    const handleMouseUp = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
        if (swipeStart) {
            const end = getCoords(e);
            if (end && isDragging) {
                if (is_test_mode === 'web') {
                    setLoading(true);
                    // Immediately clear selection and hover elements to avoid showing stale highlighter boundaries
                    setSelectedNode(null);
                    setHoveredNode(null);
                    setAvailableNodes([]);
                    if (onNodeSelected) onNodeSelected(null);
                    if (onNodeHovered) onNodeHovered(null);

                    invoke('send_web_input', {
                        actionType: 'scroll',
                        x: swipeStart.x,
                        y: swipeStart.y,
                        endX: end.x,
                        endY: end.y,
                        webUrl: activeWebUrl || undefined
                    }).then(() => {
                        setTimeout(() => refreshAll(), 1000);
                    }).catch(e => {
                        setLoading(false);
                        feedback.toast.error("inspector.input_error", e);
                    });
                    addSwipeAnimation(swipeStart.x, swipeStart.y, end.x, end.y);
                } else {
                    const duration = swipeStartTime ? Math.max(100, Math.min(3000, Date.now() - swipeStartTime)) : 500;
                    sendAdbInput(`swipe ${swipeStart.x} ${swipeStart.y} ${end.x} ${end.y} ${Math.floor(duration)}`);
                    addSwipeAnimation(swipeStart.x, swipeStart.y, end.x, end.y);
                }
            } else if (end && !isDragging) {
                processInteractionAt(end, false);
            }
        }
        setSwipeStart(null);
        setSwipeStartTime(null);
        setIsDragging(false);
    }, [swipeStart, isDragging, swipeStartTime, getCoords, processInteractionAt, sendAdbInput, addSwipeAnimation, is_test_mode, refreshAll, activeWebUrl, onNodeSelected, onNodeHovered]);

    const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
        const coords = getCoords(e);
        if (coords) {
            if (is_test_mode === 'web') {
                setLoading(true);
                // Immediately clear selection and hover elements to avoid showing stale highlighter boundaries
                setSelectedNode(null);
                setHoveredNode(null);
                setAvailableNodes([]);
                if (onNodeSelected) onNodeSelected(null);
                if (onNodeHovered) onNodeHovered(null);

                invoke('send_web_input', {
                    actionType: 'click',
                    x: coords.x,
                    y: coords.y,
                    webUrl: activeWebUrl || undefined
                }).then(() => {
                    // Page might take time to start navigation/render
                    setTimeout(() => refreshAll(), 1500);
                }).catch(e => {
                    setLoading(false);
                    feedback.toast.error("inspector.input_error", e);
                });
                addTapAnimation(coords.x, coords.y);
            } else {
                sendAdbInput(`tap ${coords.x} ${coords.y}`);
                addTapAnimation(coords.x, coords.y);
            }
        }
    }, [getCoords, is_test_mode, sendAdbInput, addTapAnimation, refreshAll, activeWebUrl, onNodeSelected, onNodeHovered]);

    return {
        screenshot,
        setScreenshot,
        rootNode,
        setRootNode,
        loading,
        imgLayout,
        setImgLayout,
        selectedNode,
        setSelectedNode,
        hoveredNode,
        setHoveredNode,
        availableNodes,
        setAvailableNodes,
        taps,
        swipes,
        imgRef,
        refreshAll,
        sendAdbInput,
        addTapAnimation,
        addSwipeAnimation,
        handlers: {
            onMouseMove: handleMouseMove,
            onMouseDown: handleMouseDown,
            onMouseUp: handleMouseUp,
            onDoubleClick: handleDoubleClick
        }
    };
}

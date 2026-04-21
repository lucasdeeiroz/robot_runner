import { useState, useCallback } from 'react';
import { 
    CELL_WIDTH, 
    CELL_HEIGHT, 
    NODE_WIDTH, 
    NODE_HEIGHT, 
    NODE_OFFSET_X, 
    NODE_OFFSET_Y, 
    LANE_SIZE, 
    NODE_PORTS 
} from '../types';

interface ViewTransform {
    scale: number;
    offset: { x: number; y: number };
}

export function useFlowchartView(containerRef: React.RefObject<HTMLDivElement | null>) {
    const [viewTransform, setViewTransform] = useState<ViewTransform>({ 
        scale: 1, 
        offset: { x: 0, y: 0 } 
    });

    const scale = viewTransform.scale;
    const offset = viewTransform.offset;

    const setOffset = useCallback((o: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => {
        setViewTransform(curr => ({ 
            ...curr, 
            offset: typeof o === 'function' ? o(curr.offset) : o 
        }));
    }, []);

    const performZoom = useCallback((delta: number, center?: { x: number; y: number }) => {
        setViewTransform(prev => {
            const newScale = Math.min(Math.max(prev.scale + delta, 0.1), 3);
            if (newScale === prev.scale) return prev;

            if (center) {
                // Zoom relative to point (center)
                const zoomFactor = newScale / prev.scale;
                const newOffsetX = center.x - (center.x - prev.offset.x) * zoomFactor;
                const newOffsetY = center.y - (center.y - prev.offset.y) * zoomFactor;

                return { scale: newScale, offset: { x: newOffsetX, y: newOffsetY } };
            }

            return { ...prev, scale: newScale };
        });
    }, []);

    const centerView = useCallback((nodes: Record<string, { gridX: number; gridY: number }>) => {
        const nodeEntries = Object.values(nodes);
        if (nodeEntries.length === 0 || !containerRef.current) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodeEntries.forEach(n => {
            minX = Math.min(minX, n.gridX);
            minY = Math.min(minY, n.gridY);
            maxX = Math.max(maxX, n.gridX);
            maxY = Math.max(maxY, n.gridY);
        });

        const pixelMinX = minX * CELL_WIDTH + NODE_OFFSET_X;
        const pixelMinY = minY * CELL_HEIGHT + NODE_OFFSET_Y;
        const pixelMaxX = maxX * CELL_WIDTH + NODE_OFFSET_X + NODE_WIDTH;
        const pixelMaxY = maxY * CELL_HEIGHT + NODE_OFFSET_Y + NODE_HEIGHT;

        const contentWidth = pixelMaxX - pixelMinX;
        const contentHeight = pixelMaxY - pixelMinY;
        const containerRect = containerRef.current.getBoundingClientRect();

        const scaleX = (containerRect.width * 0.8) / contentWidth;
        const scaleY = (containerRect.height * 0.8) / contentHeight;
        const newScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.2), 1.5);

        const centerX = pixelMinX + contentWidth / 2;
        const centerY = pixelMinY + contentHeight / 2;

        const newOffsetX = containerRect.width / 2 - centerX * newScale;
        const newOffsetY = containerRect.height / 2 - centerY * newScale;

        setViewTransform({ scale: newScale, offset: { x: newOffsetX, y: newOffsetY } });
    }, [containerRef]);

    const getPixelCoords = useCallback((gridX: any, gridY: any) => {
        const xNum = Number(gridX);
        const yNum = Number(gridY);
        return {
            x: (Number.isFinite(xNum) ? xNum : 0) * CELL_WIDTH + NODE_OFFSET_X,
            y: (Number.isFinite(yNum) ? yNum : 0) * CELL_HEIGHT + NODE_OFFSET_Y
        };
    }, []);

    const getPortCoords = useCallback((nodeX: number, nodeY: number, portId: string) => {
        const port = NODE_PORTS.find(p => p.id === portId);
        if (!port) return { x: nodeX + NODE_WIDTH / 2, y: nodeY + NODE_HEIGHT / 2 };
        return { x: nodeX + port.x, y: nodeY + port.y };
    }, []);

    const snapToLanes = useCallback((x: number, y: number) => {
        return {
            x: Math.round(x / LANE_SIZE) * LANE_SIZE,
            y: Math.round(y / LANE_SIZE) * LANE_SIZE
        };
    }, []);

    const getClosestLane = useCallback((val: number) => Math.round(val / LANE_SIZE) * LANE_SIZE, []);

    return {
        viewTransform,
        scale,
        offset,
        setOffset,
        performZoom,
        centerView,
        getPixelCoords,
        getPortCoords,
        snapToLanes,
        getClosestLane
    };
}

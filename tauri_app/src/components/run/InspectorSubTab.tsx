import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, LayoutTemplate, Maximize, Check, Scan } from 'lucide-react';
import { XMLParser } from 'fast-xml-parser';
import clsx from 'clsx';
import { InspectorNode, transformXmlToTree, findNodeAtCoords, generateXPath } from '@/lib/inspectorUtils';

interface InspectorSubTabProps {
    selectedDevice: string;
}

export function InspectorSubTab({ selectedDevice }: InspectorSubTabProps) {
    const [screenshot, setScreenshot] = useState<string | null>(null);
    const [xmlData, setXmlData] = useState<string | null>(null);
    const [rootNode, setRootNode] = useState<InspectorNode | null>(null);
    const [selectedNode, setSelectedNode] = useState<InspectorNode | null>(null);
    const [hoveredNode, setHoveredNode] = useState<InspectorNode | null>(null);

    const [loading, setLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'properties' | 'xml'>('properties');
    const [copied, setCopied] = useState<string | null>(null);

    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        if (selectedDevice) {
            refreshAll();
        } else {
            // Reset if no device
            setScreenshot(null);
            setXmlData(null);
            setRootNode(null);
            setSelectedNode(null);
        }
    }, [selectedDevice]);

    const refreshAll = async () => {
        if (!selectedDevice) return;
        setLoading(true);
        try {
            // Parallel fetch could be faster but let's do sequential for reliability first or Promise.all
            // Taking screenshot first so user sees something while XML parses
            const b64 = await invoke<string>('get_screenshot', { deviceId: selectedDevice });
            setScreenshot(b64);

            const xml = await invoke<string>('get_xml_dump', { deviceId: selectedDevice });
            setXmlData(xml);

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

        } catch (e) {
            console.error("Inspector error:", e);
            // alert(`Inspector failed: ${e}`); // Maybe too intrusive for auto-load
        } finally {
            setLoading(false);
        }
    };

    const handleImageMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
        if (!processMouseInteraction(e, true)) return;
    };

    const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
        if (!processMouseInteraction(e, false)) return;
    };

    const processMouseInteraction = (e: React.MouseEvent<HTMLImageElement>, isHover: boolean) => {
        if (!rootNode || !imgRef.current) return false;

        const rect = imgRef.current.getBoundingClientRect();
        const scaleX = imgRef.current.naturalWidth / rect.width;
        const scaleY = imgRef.current.naturalHeight / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const node = findNodeAtCoords(rootNode, x, y);

        if (isHover) {
            if (node !== hoveredNode) setHoveredNode(node);
        } else {
            setSelectedNode(node);
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
                <p>Select a device to start Inspector</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col space-y-4">
            {/* Toolbar */}
            <div className="bg-zinc-50 dark:bg-black/20 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
                <div className="flex gap-2">
                    <button
                        onClick={refreshAll}
                        disabled={loading}
                        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        Refresh Source
                    </button>
                    {/* Add Swipe/Tap buttons here later */}
                </div>
                <div className="text-xs text-zinc-400">
                    {loading ? "Fetching device state..." : "Ready"}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 grid grid-cols-2 gap-4 min-h-0 overflow-hidden">
                {/* Screenshot View */}
                <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex items-center justify-center overflow-auto shadow-inner relative">
                    {screenshot ? (
                        <div className="relative inline-block">
                            <img
                                ref={imgRef}
                                src={`data:image/png;base64,${screenshot}`}
                                alt="Device Screenshot"
                                className="max-h-[calc(100vh-16rem)] object-contain shadow-lg rounded-md select-none"
                                onMouseMove={handleImageMouseMove}
                                onClick={handleImageClick}
                                draggable={false}
                            />
                            {/* Hover Highlight */}
                            <div
                                className="absolute border-2 border-blue-400 pointer-events-none transition-all duration-75 z-10"
                                style={{ ...getHighlighterStyle(hoveredNode, '#60a5fa'), display: hoveredNode?.bounds ? 'block' : 'none' }}
                            />
                            {/* Selected Highlight */}
                            <div
                                className="absolute border-2 border-red-500 pointer-events-none z-20"
                                style={{ ...getHighlighterStyle(selectedNode, '#ef4444'), display: selectedNode?.bounds ? 'block' : 'none' }}
                            />
                        </div>
                    ) : (
                        <div className="text-zinc-400 flex flex-col items-center">
                            {loading ? <RefreshCw className="animate-spin mb-2 opacity-50" size={32} /> : <Maximize size={32} className="mb-2 opacity-50" />}
                            <p>{loading ? "Loading..." : "No screenshot"}</p>
                        </div>
                    )}
                </div>

                {/* Properties View */}
                <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-0 flex flex-col overflow-hidden shadow-sm dark:shadow-none">
                    <div className="flex border-b border-zinc-200 dark:border-zinc-800 shrink-0">
                        <button
                            className={clsx(
                                "flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                                viewMode === 'properties'
                                    ? "border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-500/10"
                                    : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                            )}
                            onClick={() => setViewMode('properties')}
                        >
                            Node Properties
                        </button>
                        <button
                            className={clsx(
                                "flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                                viewMode === 'xml'
                                    ? "border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-500/10"
                                    : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                            )}
                            onClick={() => setViewMode('xml')}
                        >
                            XML Source
                        </button>
                    </div>

                    <div className="flex-1 overflow-auto p-0">
                        {viewMode === 'xml' ? (
                            xmlData ? (
                                <pre className="p-4 font-mono text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap break-all">{xmlData}</pre>
                            ) : (
                                <div className="text-zinc-400 text-center mt-20">No XML Dump loaded</div>
                            )
                        ) : (
                            selectedNode ? (
                                <div className="p-4 space-y-4">
                                    {/* Quick Copy Action Buttons */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <CopyButton
                                            label="XPath"
                                            value={generateXPath(selectedNode)}
                                            onCopy={(v) => copyToClipboard(v, 'xpath')}
                                            active={copied === 'xpath'}
                                        />
                                        <CopyButton
                                            label="Resource ID"
                                            value={selectedNode.attributes['resource-id']}
                                            onCopy={(v) => copyToClipboard(v, 'rid')}
                                            active={copied === 'rid'}
                                        />
                                        <CopyButton
                                            label="Access ID"
                                            value={selectedNode.attributes['content-desc']}
                                            onCopy={(v) => copyToClipboard(v, 'aid')}
                                            active={copied === 'aid'}
                                        />
                                        <CopyButton
                                            label="Class"
                                            value={selectedNode.attributes['class']}
                                            onCopy={(v) => copyToClipboard(v, 'class')}
                                            active={copied === 'class'}
                                        />
                                    </div>

                                    {/* Attributes Table */}
                                    <div>
                                        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">All Attributes</span>
                                        <div className="grid grid-cols-[1fr,2fr] gap-px bg-zinc-200 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                                            {Object.entries(selectedNode.attributes).map(([key, value]) => (
                                                <div key={key} className="contents">
                                                    <div className="bg-white dark:bg-zinc-900 p-2 text-xs font-medium text-zinc-500 border-b border-zinc-100 dark:border-zinc-800/50 last:border-0">{key}</div>
                                                    <div className="bg-white dark:bg-zinc-900 p-2 text-xs text-zinc-800 dark:text-zinc-300 font-mono border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 break-all">{value}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                                    <LayoutTemplate size={32} className="mb-2 opacity-50" />
                                    <p>Select an element on the screenshot</p>
                                </div>
                            )
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

import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, LayoutTemplate, Maximize, Copy, Check } from 'lucide-react';
import { XMLParser } from 'fast-xml-parser';
import clsx from 'clsx';
import { InspectorNode, transformXmlToTree, findNodeAtCoords, generateXPath } from '@/lib/inspectorUtils';

interface Device {
    udid: string;
    model: string;
    is_emulator: boolean;
}

export function InspectorPage() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<string>('');
    const [screenshot, setScreenshot] = useState<string | null>(null);
    const [xmlData, setXmlData] = useState<string | null>(null);
    const [rootNode, setRootNode] = useState<InspectorNode | null>(null);
    const [selectedNode, setSelectedNode] = useState<InspectorNode | null>(null);
    const [hoveredNode, setHoveredNode] = useState<InspectorNode | null>(null);

    const [loading, setLoading] = useState(false);
    const [loadingXml, setLoadingXml] = useState(false);
    const [viewMode, setViewMode] = useState<'properties' | 'xml'>('properties');
    const [copied, setCopied] = useState(false);

    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        loadDevices();
    }, []);

    const loadDevices = async () => {
        try {
            const list = await invoke<Device[]>('get_connected_devices');
            setDevices(list);
            if (list.length > 0 && !selectedDevice) {
                setSelectedDevice(list[0].udid);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchScreenshot = async () => {
        console.log("Fetching screenshot...", selectedDevice);
        if (!selectedDevice) {
            alert("No device selected!");
            return;
        }
        setLoading(true);
        try {
            const b64 = await invoke<string>('get_screenshot', { deviceId: selectedDevice });
            setScreenshot(b64);
        } catch (e) {
            console.error("Screenshot error:", e);
            alert(`Screenshot failed: ${e}`);
        } finally {
            setLoading(false);
        }
    };

    const fetchDump = async () => {
        console.log("Fetching dump...", selectedDevice);
        if (!selectedDevice) {
            alert("No device selected!");
            return;
        }
        setLoadingXml(true);
        try {
            const xml = await invoke<string>('get_xml_dump', { deviceId: selectedDevice });
            setXmlData(xml);

            // Parse XML
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: "",
                textNodeName: "_text"
            });
            const jsonObj = parser.parse(xml);

            // Transform to internal tree (handling hierarchy root)
            // ADB dump usually wraps in <hierarchy>...</hierarchy>
            const root = jsonObj.hierarchy ? transformXmlToTree(jsonObj.hierarchy) : transformXmlToTree(jsonObj);
            setRootNode(root);

        } catch (e) {
            console.error("Dump error:", e);
            alert(`Dump failed: ${e}`);
        } finally {
            setLoadingXml(false);
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

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Helper to visualize bounding box on the overlay
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

    return (
        <div className="h-full flex flex-col space-y-4">
            {/* Toolbar */}
            <div className="bg-white dark:bg-zinc-900/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-4 shadow-sm dark:shadow-none">
                <select
                    className="bg-gray-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-zinc-200 outline-none focus:border-blue-500"
                    value={selectedDevice}
                    onChange={(e) => setSelectedDevice(e.target.value)}
                >
                    {devices.map(d => (
                        <option key={d.udid} value={d.udid}>{d.model} ({d.udid})</option>
                    ))}
                </select>

                <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800" />

                <button
                    onClick={fetchScreenshot}
                    disabled={loading || !selectedDevice}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-sm transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                    Screenshot
                </button>

                <button
                    onClick={fetchDump}
                    disabled={loadingXml || !selectedDevice}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-sm transition-colors disabled:opacity-50"
                >
                    <LayoutTemplate size={16} className={loadingXml ? "animate-pulse" : ""} />
                    Dump XML
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
                {/* Screenshot View */}
                <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex items-center justify-center overflow-auto shadow-inner relative">
                    {screenshot ? (
                        <div className="relative inline-block">
                            <img
                                ref={imgRef}
                                src={`data:image/png;base64,${screenshot}`}
                                alt="Device Screenshot"
                                className="max-h-[calc(100vh-14rem)] object-contain shadow-lg rounded-md select-none"
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
                            <Maximize size={48} className="mb-2 opacity-50" />
                            <p>Load Screenshot to start</p>
                        </div>
                    )}
                </div>

                {/* Properties View */}
                <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-0 flex flex-col overflow-hidden shadow-sm dark:shadow-none">
                    <div className="flex border-b border-zinc-200 dark:border-zinc-800">
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
                                    {/* XPath Section */}
                                    <div className="bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Computed XPath</span>
                                            {copied && <span className="text-xs text-green-500 flex items-center gap-1"><Check size={12} /> Copied!</span>}
                                        </div>
                                        <div className="flex gap-2">
                                            <code className="text-sm font-mono text-blue-600 dark:text-blue-400 bg-white dark:bg-black/20 px-2 py-1 rounded flex-1 break-all border border-zinc-200 dark:border-zinc-700">
                                                {generateXPath(selectedNode)}
                                            </code>
                                            <button
                                                onClick={() => copyToClipboard(generateXPath(selectedNode))}
                                                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors"
                                                title="Copy XPath"
                                            >
                                                <Copy size={16} className="text-zinc-500" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Attributes Table */}
                                    <div>
                                        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Attributes</span>
                                        <div className="grid grid-cols-[1fr,2fr] gap-px bg-zinc-200 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                                            {Object.entries(selectedNode.attributes).map(([key, value]) => (
                                                <div key={key} className="contents">
                                                    <div className="bg-white dark:bg-zinc-900 p-2 text-xs font-medium text-zinc-500 border-b border-zinc-100 dark:border-zinc-800/50 last:border-0">{key}</div>
                                                    <div className="bg-white dark:bg-zinc-900 p-2 text-xs text-zinc-800 dark:text-zinc-300 font-mono border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 break-all">{value}</div>
                                                </div>
                                            ))}
                                            {(Object.keys(selectedNode.attributes).length === 0) && (
                                                <div className="bg-white dark:bg-zinc-900 col-span-2 p-4 text-center text-zinc-400 text-sm">No attributes</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                                    <LayoutTemplate size={32} className="mb-2 opacity-50" />
                                    <p>Select an element on the screenshot</p>
                                    <p className="text-xs mt-1 text-zinc-500">Ensure both Screenshot and XML are loaded</p>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

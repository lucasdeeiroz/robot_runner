
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { useTranslation } from 'react-i18next';
import { MousePointer, BoxSelect, ArrowUpRight, Crop, RotateCcw, RotateCw, Copy, Images, Trash2, FolderOpen } from 'lucide-react';
import { useSettings } from "@/lib/settings";
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { EditorElement, ToolType, drawElement, getMousePos, redrawCanvas } from '@/lib/dashboard/imageEditor';
import { feedback } from '@/lib/feedback';
import clsx from 'clsx';

export function ImageEditor() {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [elements, setElements] = useState<EditorElement[]>([]);
    const [undoStack, setUndoStack] = useState<EditorElement[][]>([]);
    const [redoStack, setRedoStack] = useState<EditorElement[][]>([]);
    const [currentTool, setCurrentTool] = useState<ToolType>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });

    // Initial load
    useEffect(() => {
        if (canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Default size if empty
                if (elements.length === 0) {
                    canvas.width = 900;
                    canvas.height = 500;
                }
                redrawCanvas(canvas, ctx, elements);
            }
        }
    }, [elements]);



    const saveState = () => {
        setUndoStack(prev => [...prev, elements]);
        setRedoStack([]);
    };

    const handleUndo = () => {
        if (undoStack.length === 0) return;
        const previous = undoStack[undoStack.length - 1];
        setRedoStack(prev => [...prev, elements]);
        setElements(previous);
        setUndoStack(prev => prev.slice(0, -1));
    };

    const handleRedo = () => {
        if (redoStack.length === 0) return;
        const next = redoStack[redoStack.length - 1];
        setUndoStack(prev => [...prev, elements]);
        setElements(next);
        setRedoStack(prev => prev.slice(0, -1));
    };

    const handleClear = () => {
        saveState();
        setElements([]);
    };

    const handleNewImage = async () => {
        try {
            // Check for clipboard image
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                if (item.types && item.types.some(type => type.startsWith('image/'))) {
                    const blob = await item.getType('image/png');
                    const img = new Image();
                    img.src = URL.createObjectURL(blob);
                    img.onload = () => {
                        saveState();

                        if (canvasRef.current) {
                            canvasRef.current.width = img.width;
                            canvasRef.current.height = img.height;
                        }

                        setElements([{
                            doc_type: 'image',
                            x: 0,
                            y: 0,
                            w: img.width,
                            h: img.height,
                            img
                        }]);
                        feedback.toast.success(t('dashboard.image.pasted', "Image pasted!"));
                    };
                    return;
                }
            }
            feedback.toast.info(t('dashboard.image.no_clipboard', "No image in clipboard."));
        } catch (e) {
            // Fallback: input file
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (readerEvent) => {
                        const img = new Image();
                        img.onload = () => {
                            saveState();

                            if (canvasRef.current) {
                                canvasRef.current.width = img.width;
                                canvasRef.current.height = img.height;
                            }

                            setElements([{
                                doc_type: 'image',
                                x: 0,
                                y: 0,
                                w: img.width,
                                h: img.height,
                                img
                            }]);
                        };
                        img.src = readerEvent.target?.result as string;
                    };
                    reader.readAsDataURL(file);
                }
            };
            input.click();
        }
    };

    const handleOpenImage = async () => {
        try {
            const selected = await open({
                multiple: false,
                directory: false,
                filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
                defaultPath: settings.paths.screenshots || undefined
            });

            if (selected) {
                // selected is string or string[] but multiple is false, so string | null.
                // However, open type might return string | null.
                // We cast to string just to be safe if check passed.
                const filePath = selected as string;

                // Read file
                const contents = await readFile(filePath);

                // Determine mime type roughly (or just use generic image)
                // For simplified logic, we try to create a blobUrl
                const blob = new Blob([contents]);
                const url = URL.createObjectURL(blob);

                const img = new Image();
                img.onload = () => {
                    saveState();

                    if (canvasRef.current) {
                        canvasRef.current.width = img.width;
                        canvasRef.current.height = img.height;
                    }

                    setElements([{
                        doc_type: 'image',
                        x: 0,
                        y: 0,
                        w: img.width,
                        h: img.height,
                        img
                    }]);
                    feedback.toast.success(t('dashboard.image.opened', "Image opened!"));
                };
                img.src = url;
            }
        } catch (e) {
            console.error("Failed to open image:", e);
            feedback.toast.error(t('common.error_occurred', { error: e }));
        }
    };

    const handleCopyCanvas = () => {
        if (!canvasRef.current) return;
        canvasRef.current.toBlob(blob => {
            if (blob) {
                const item = new ClipboardItem({ 'image/png': blob });
                navigator.clipboard.write([item]).then(() => {
                    feedback.toast.success(t('dashboard.image.copied', "Image copied!"));
                });
            }
        });
    };

    // Mouse Events
    const handleMouseDown = (e: React.MouseEvent) => {
        if (!currentTool || !canvasRef.current) return;
        setIsDrawing(true);
        const pos = getMousePos(canvasRef.current, e);
        setStartPos(pos);
        saveState(); // Prepare undo before drawing
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing || !currentTool || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const pos = getMousePos(canvasRef.current, e);

        // Clear and redraw all existing elements FIRST
        redrawCanvas(canvasRef.current, ctx, elements);

        // Draw preview of current tool
        const previewElement: EditorElement = {
            doc_type: currentTool === 'arrow' ? 'arrow' : currentTool === 'rect' ? 'rect' : 'crop',
            x: startPos.x,
            y: startPos.y,
            w: pos.x - startPos.x,
            h: pos.y - startPos.y,
            x1: startPos.x,
            y1: startPos.y,
            x2: pos.x,
            y2: pos.y,
            color: currentTool === 'arrow' ? '#ef4444' : currentTool === 'rect' ? '#3b82f6' : '#22c55e',
            lineWidth: 3
        };

        drawElement(ctx, previewElement);
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (!isDrawing || !currentTool || !canvasRef.current) return;
        setIsDrawing(false);
        const pos = getMousePos(canvasRef.current, e);

        const newElement: EditorElement = {
            doc_type: currentTool === 'arrow' ? 'arrow' : currentTool === 'rect' ? 'rect' : 'crop',
            x: startPos.x,
            y: startPos.y,
            w: pos.x - startPos.x,
            h: pos.y - startPos.y,
            x1: startPos.x,
            y1: startPos.y,
            x2: pos.x,
            y2: pos.y,
            color: currentTool === 'arrow' ? '#ef4444' : currentTool === 'rect' ? '#3b82f6' : '#22c55e',
            lineWidth: 3
        };

        // If crop, we might want to actually crop the canvas logic, but for "drawing a crop box" implies visual aid? 
        // dashboard.js logic: "crop" just draws a dashed box.

        setElements(prev => [...prev, newElement]);
    };

    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
                    {t('dashboard.image.title', "Image Editor")}
                </h3>
                <div className="flex gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleUndo}
                        disabled={undoStack.length === 0}
                        title={t('common.undo')}
                    >
                        <RotateCcw size={16} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRedo}
                        disabled={redoStack.length === 0}
                        title={t('common.redo')}
                    >
                        <RotateCw size={16} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClear}
                        title={t('common.clear')}
                    >
                        <Trash2 size={16} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleOpenImage}
                        title={t('dashboard.image.open', "Open Image")}
                    >
                        <FolderOpen size={16} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleNewImage}
                        title={t('dashboard.image.new', "New Image / Paste")}
                    >
                        <Images size={16} />
                    </Button>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex gap-2 p-1 bg-surface-variant/30 rounded-2xl w-fit">
                <Button
                    variant={currentTool === null ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setCurrentTool(null)}
                    title={t('dashboard.image.tools.cursor', "Cursor")}
                    className="w-8 h-8 p-0 justify-center"
                >
                    <MousePointer size={16} />
                </Button>
                <div className="w-px h-4 bg-outline-variant/30 self-center mx-1" />
                <Button
                    variant={currentTool === 'arrow' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setCurrentTool('arrow')}
                    title={t('dashboard.image.tools.arrow', "Arrow")}
                    className="w-8 h-8 p-0 justify-center text-red-500"
                >
                    <ArrowUpRight size={16} />
                </Button>
                <Button
                    variant={currentTool === 'rect' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setCurrentTool('rect')}
                    title={t('dashboard.image.tools.rect', "Rectangle")}
                    className="w-8 h-8 p-0 justify-center text-blue-500"
                >
                    <BoxSelect size={16} />
                </Button>
                <Button
                    variant={currentTool === 'crop' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setCurrentTool('crop')}
                    title={t('dashboard.image.tools.crop', "Crop Area")}
                    className="w-8 h-8 p-0 justify-center text-green-500"
                >
                    <Crop size={16} />
                </Button>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 bg-surface-variant/10 rounded-2xl border border-outline-variant/30 overflow-hidden relative flex items-center justify-center">
                <canvas
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={() => setIsDrawing(false)}
                    className={clsx(
                        "bg-white shadow-sm cursor-crosshair max-w-full max-h-full object-contain",
                        currentTool === null && "cursor-default"
                    )}
                    style={{ maxWidth: '100%', maxHeight: '100%' }}
                />
            </div>

            <Button
                variant="primary"
                onClick={handleCopyCanvas}
                leftIcon={<Copy size={16} />}
                className="w-full justify-center shadow-lg shadow-primary/20"
            >
                {t('dashboard.image.copy', "Copy Image")}
            </Button>
        </div>
    );
}

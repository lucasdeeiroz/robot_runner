import { useState } from 'react';
import { 
    MousePointer2, Move, Play, CheckSquare, 
    ArrowUp, ArrowDown, ArrowLeft, ArrowRight, 
    Trash2, Copy, Code, Pencil, X
} from 'lucide-react';
import clsx from 'clsx';

import { InspectorNode, generateXPath } from '@/lib/inspectorUtils';
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { AiButton } from "@/components/atoms/AiButton";

export interface RecorderOptions {
    duration: number;
    offsetX: number;
    offsetY: number;
    startOffset: number;
    endOffset: number;
}

export interface RecordingStep {
    id: number;
    action: string;
    params: RecorderOptions;
    node: InspectorNode | null;
    locator?: string;
}

export interface RecordingPaneProps {
    selectedNode: InspectorNode | null;
    recordedSteps: RecordingStep[];
    availableNodes: InspectorNode[];
    options: RecorderOptions;
    setOptions: (options: RecorderOptions) => void;
    onAddStep: (action: string, params: RecorderOptions) => void;
    onSelectNode: (node: InspectorNode) => void;
    onHoverNode: (node: InspectorNode | null) => void;
    onRemoveStep: (id: number) => void;
    onEditStep: (id: number) => void;
    onClear: () => void;
    onCopy: () => void;
    onGenerateAI: () => void;
    t: any;
}

export function RecordingPane({
    selectedNode,
    recordedSteps,
    availableNodes,
    options,
    setOptions,
    onAddStep,
    onSelectNode,
    onHoverNode,
    onRemoveStep,
    onEditStep,
    onClear,
    onCopy,
    onGenerateAI,
    t
}: RecordingPaneProps) {
    const [activeTab, setActiveTab] = useState<'tap' | 'swipe' | 'drag' | 'assert'>('tap');

    return (
        <div className="flex flex-col h-full bg-surface">
            {/* Action Toolset */}
            <div className="p-4 border-b border-outline-variant/20 bg-surface-variant/10">
                <div className="flex gap-1 mb-4 bg-surface-variant/30 p-1 rounded-xl">
                    <Button
                        variant={activeTab === 'tap' ? 'primary' : 'ghost'}
                        onClick={() => setActiveTab('tap')}
                        className={clsx(
                            "flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-lg",
                            activeTab !== 'tap' && "text-on-surface-variant/70"
                        )}
                        leftIcon={<MousePointer2 size={14} />}
                    >
                        {t('inspector.recorder.actions.tap')}
                    </Button>
                    <Button
                        variant={activeTab === 'swipe' ? 'primary' : 'ghost'}
                        onClick={() => setActiveTab('swipe')}
                        className={clsx(
                            "flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-lg",
                            activeTab !== 'swipe' && "text-on-surface-variant/70"
                        )}
                        leftIcon={<Move size={14} />}
                    >
                        {t('inspector.recorder.actions.swipe')}
                    </Button>
                    <Button
                        variant={activeTab === 'drag' ? 'primary' : 'ghost'}
                        onClick={() => setActiveTab('drag')}
                        className={clsx(
                            "flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-lg",
                            activeTab !== 'drag' && "text-on-surface-variant/70"
                        )}
                        leftIcon={<Play size={14} className="rotate-90" />}
                    >
                        {t('inspector.recorder.actions.drag_drop')}
                    </Button>
                    <Button
                        variant={activeTab === 'assert' ? 'primary' : 'ghost'}
                        onClick={() => setActiveTab('assert')}
                        className={clsx(
                            "flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-lg",
                            activeTab !== 'assert' && "text-on-surface-variant/70"
                        )}
                        leftIcon={<CheckSquare size={14} />}
                    >
                        {t('inspector.recorder.actions.assert', 'Assert')}
                    </Button>
                </div>

                {selectedNode ? (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                        {/* Selector Header */}
                        <div className="flex items-center justify-between pb-1 border-b border-outline-variant/10">
                            <span className="text-[9px] font-bold text-primary uppercase tracking-widest">{t('inspector.recorder.selection', 'Active Selection')}</span>
                            <span className="text-[9px] font-mono text-on-surface-variant/60 bg-surface-variant/50 px-2 py-0.5 rounded italic truncate max-w-[120px]">
                                {selectedNode.tagName.replace('android.widget.', '')} {selectedNode.attributes['resource-id']?.split('/').pop()}
                            </span>
                        </div>

                        <div className={clsx(
                            "p-2 bg-surface rounded-xl border border-outline-variant/30 gap-3",
                            availableNodes.length > 1 ? "grid grid-cols-2" : "flex flex-col space-y-2"
                        )}>
                            {/* Sibling Selector */}
                            {availableNodes.length > 1 && (
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-on-surface-variant/60 uppercase ml-1">{t('inspector.recorder.siblings', 'Alternative Nodes')}</label>
                                    <div className="flex gap-1 overflow-x-auto custom-scrollbar pb-1">
                                        {availableNodes.map((node) => (
                                            <Button
                                                key={node.id}
                                                onClick={() => onSelectNode(node)}
                                                onMouseEnter={() => onHoverNode(node)}
                                                onMouseLeave={() => onHoverNode(null)}
                                                className={clsx(
                                                    "px-2 py-1 shadow-none text-[10px] rounded-lg border transition-all whitespace-nowrap",
                                                    selectedNode === node
                                                        ? "bg-primary/10 border-primary text-primary font-bold"
                                                        : "bg-surface-variant/20 border-outline-variant/30 text-on-surface-variant/70 hover:bg-surface-variant/50"
                                                )}
                                            >
                                                {node.tagName.replace('android.widget.', '')}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Hierarchy Selector */}
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-on-surface-variant/60 uppercase ml-1">{t('inspector.attributes.hierarchy', 'Hierarchy')}</label>
                                <div className="flex flex-wrap items-center gap-1 p-1 bg-surface-variant/10 rounded-lg border border-outline-variant/10 h-[30px]">
                                    {(() => {
                                        let path: InspectorNode[] = [];
                                        let curr: InspectorNode | undefined = selectedNode;
                                        while (curr) {
                                            if (curr.tagName !== 'hierarchy') path.unshift(curr);
                                            curr = curr.parent;
                                        }
                                        const displayPath = path.slice(-3);
                                        return displayPath.map((n, i) => (
                                            <div key={n.id} className="flex items-center">
                                                {i > 0 && <span className="mx-0.5 text-[10px] opacity-30">&gt;</span>}
                                                <Button
                                                    variant="unstyled"
                                                    onClick={() => onSelectNode(n)}
                                                    onMouseEnter={() => onHoverNode(n)}
                                                    onMouseLeave={() => onHoverNode(null)}
                                                    className={clsx(
                                                        "text-[10px] hover:text-primary truncate max-w-[80px]",
                                                        n === selectedNode ? "font-bold text-on-surface underline decoration-primary/40 underline-offset-2" : "text-on-surface-variant/60"
                                                    )}
                                                >
                                                    {n.tagName.replace('android.widget.', '')}
                                                </Button>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                                <label className="text-[9px] font-medium text-on-surface-variant/70 ml-1 truncate block">{t('inspector.recorder.params.duration')}</label>
                                <Input
                                    type="number"
                                    value={options.duration}
                                    onChange={(e: any) => setOptions({ ...options, duration: parseInt(e.target.value) })}
                                    className="h-8 text-xs"
                                />
                            </div>
                            {activeTab === 'tap' && (
                                <>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-medium text-on-surface-variant/70 ml-1 truncate block">{t('inspector.recorder.params.offset_x')}</label>
                                        <Input
                                            type="number"
                                            value={options.offsetX}
                                            onChange={(e: any) => setOptions({ ...options, offsetX: parseInt(e.target.value) })}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-medium text-on-surface-variant/70 ml-1 truncate block">{t('inspector.recorder.params.offset_y')}</label>
                                        <Input
                                            type="number"
                                            value={options.offsetY}
                                            onChange={(e: any) => setOptions({ ...options, offsetY: parseInt(e.target.value) })}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                </>
                            )}
                            {(activeTab === 'swipe' || activeTab === 'drag') && (
                                <>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-medium text-on-surface-variant/70 ml-1 truncate block">{t('inspector.recorder.params.start_offset')}</label>
                                        <Input
                                            type="number"
                                            value={options.startOffset}
                                            onChange={(e: any) => setOptions({ ...options, startOffset: parseInt(e.target.value) })}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-medium text-on-surface-variant/70 ml-1 truncate block">{t('inspector.recorder.params.end_offset')}</label>
                                        <Input
                                            type="number"
                                            value={options.endOffset}
                                            onChange={(e: any) => setOptions({ ...options, endOffset: parseInt(e.target.value) })}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        {activeTab === 'assert' ? (
                            <div className="grid grid-cols-1 gap-2">
                                <Button size="sm" onClick={() => onAddStep('assert', options)} className="w-full text-[10px] h-8 bg-success/20 text-success hover:bg-success/30 border-success/30">{t('inspector.recorder.actions.assert', 'Assert Element')}</Button>
                            </div>
                        ) : activeTab === 'tap' ? (
                            <div className="grid grid-cols-3 gap-2">
                                <Button size="sm" onClick={() => onAddStep('tap', options)} className="w-full text-[10px] h-8">{t('inspector.recorder.actions.tap')}</Button>
                                <Button size="sm" onClick={() => onAddStep('double_tap', options)} variant="outline" className="w-full text-[10px] h-8">{t('inspector.recorder.actions.double_tap')}</Button>
                                <Button size="sm" onClick={() => onAddStep('long_press', options)} variant="ghost" className="w-full text-[10px] h-8">{t('inspector.recorder.actions.long_press')}</Button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-4 gap-2">
                                <Button variant="secondary" size="sm" onClick={() => onAddStep(`${activeTab}_up`, options)} className="p-0 h-8 flex flex-col items-center justify-center">
                                    <ArrowUp size={14} />
                                    <span className="text-[8px]">{t('inspector.recorder.directions.up')}</span>
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => onAddStep(`${activeTab}_down`, options)} className="p-0 h-8 flex flex-col items-center justify-center">
                                    <ArrowDown size={14} />
                                    <span className="text-[8px]">{t('inspector.recorder.directions.down')}</span>
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => onAddStep(`${activeTab}_left`, options)} className="p-0 h-8 flex flex-col items-center justify-center">
                                    <ArrowLeft size={14} />
                                    <span className="text-[8px]">{t('inspector.recorder.directions.left')}</span>
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => onAddStep(`${activeTab}_right`, options)} className="p-0 h-8 flex flex-col items-center justify-center">
                                    <ArrowRight size={14} />
                                    <span className="text-[8px]">{t('inspector.recorder.directions.right')}</span>
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-on-surface-variant/40 animate-pulse">
                        <MousePointer2 size={24} className="mb-2" />
                        <p className="text-[10px] font-medium">{t('inspector.select_element')}</p>
                    </div>
                )}
            </div>

            {/* Steps List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                <div className="sticky top-0 bg-surface z-10 px-4 py-2 border-b border-outline-variant/10 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">{t('inspector.recorder.steps')}</span>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={onClear} disabled={recordedSteps.length === 0} className="h-6 text-[10px] text-error hover:bg-error/10">
                            <Trash2 size={12} className="mr-1" />
                            {t('inspector.recorder.clear')}
                        </Button>
                        <Button
                            variant="outline"
                            className="w-auto h-8 text-xs px-3"
                            disabled={recordedSteps.length === 0}
                            onClick={onCopy}
                        >
                            <Copy size={14} className="mr-2" />
                            {t('inspector.recorder.copy')}
                        </Button>
                        <AiButton
                            id="recorder_generate_ai_test"
                            isLoading={false}
                            disabled={recordedSteps.length === 0}
                            onClick={onGenerateAI}
                            label={t('run_tab.console.generate_ai_test', 'Gerar Teste Robot (IA)')}
                            variant="primary"
                            className="h-8 text-xs shadow-lg shadow-primary/20 px-3"
                        />
                    </div>
                </div>

                {recordedSteps.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant/30">
                        <Code size={32} className="mb-2 opacity-20" />
                        <p className="text-xs">{t('inspector.recorder.empty')}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-outline-variant/10">
                        {recordedSteps.map((step, idx) => (
                            <div key={step.id} className="group p-3 flex items-start gap-3 hover:bg-surface-variant/20 transition-colors">
                                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-surface-variant/50 rounded-full text-[10px] font-bold text-on-surface-variant/60">
                                    {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-xs font-bold text-on-surface truncate capitalize">
                                            {t(`inspector.recorder.actions.${step.action}`, step.action.replace('_', ' '))}
                                        </span>
                                        <span className="text-[10px] text-primary bg-primary/10 px-1.5 rounded font-medium">
                                            {step.node?.tagName}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-on-surface-variant/60 font-mono truncate">
                                        {step.locator || (step.node?.attributes['resource-id']?.split('/').pop() || (step.node ? generateXPath(step.node) : 'Unknown'))}
                                    </div>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => onEditStep(step.id)} className="opacity-0 group-hover:opacity-100 h-7 w-7 p-0 text-on-surface-variant/40 hover:text-primary hover:bg-primary/10 transition-all mr-1">
                                    <Pencil size={14} />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => onRemoveStep(step.id)} className="opacity-0 group-hover:opacity-100 h-7 w-7 p-0 text-on-surface-variant/40 hover:text-error hover:bg-error/10 transition-all">
                                    <X size={14} />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

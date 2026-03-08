import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, X, ChevronsUpDown } from 'lucide-react';
import { UIElementMap } from '@/lib/types';
import { SegmentedControl } from '@/components/molecules/SegmentedControl';
import { Button } from '@headlessui/react';

interface GroupedElementSelectProps {
    label?: string;
    value: string;
    onChange: (value: string) => void;
    elements: UIElementMap[];
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

export function GroupedElementSelect({
    label,
    value,
    onChange,
    elements,
    placeholder,
    className,
    disabled = false
}: GroupedElementSelectProps) {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [listMode, setListMode] = useState<'all' | 'type'>('type');
    const [expandedTypes, setExpandedTypes] = useState<string[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    // Initialize expanded types on mount
    useEffect(() => {
        const types = Array.from(new Set(elements.map(e => t(`mapper.types.${e.type}`))));
        setExpandedTypes(types);
    }, [elements, t]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleSelectOption = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        setIsOpen(false);
    };

    return (
        <div className={clsx("relative", className)} ref={containerRef}>
            {label && (
                <label className="block text-xs font-medium text-on-surface-variant/80 mb-1">
                    {label}
                </label>
            )}
            <div
                className={clsx(
                    "relative w-full bg-surface-variant/10 border border-outline-variant/30 rounded px-3 py-2 text-sm transition-colors cursor-pointer flex items-center min-h-[38px]",
                    disabled && "opacity-50 cursor-not-allowed",
                    isOpen && "border-primary ring-1 ring-primary/20",
                    !value && "text-on-surface-variant/50"
                )}
                onClick={() => !disabled && setIsOpen(!isOpen)}
            >
                <span className="flex-1 truncate">{value || placeholder || t('common.select', 'Select...')}</span>

                <div className="flex items-center gap-1 text-on-surface-variant/50">
                    {value && !disabled && (
                        <Button
                            type="button"
                            onClick={handleClear}
                            className="p-0.5 hover:bg-surface-variant/30 rounded hover:text-on-surface transition-colors"
                        >
                            <X size={14} />
                        </Button>
                    )}
                    <ChevronsUpDown size={14} />
                </div>
            </div>

            {/* Dropdown Options */}
            {isOpen && !disabled && (
                <div className="absolute z-[100] w-full min-w-[240px] mt-1 bg-surface border border-outline-variant/30 rounded-lg shadow-xl max-h-80 flex flex-col overflow-hidden">
                    <div className="p-2 border-b border-outline-variant/30 bg-surface-variant/5">
                        <SegmentedControl
                            value={listMode}
                            onChange={setListMode}
                            options={[
                                { value: 'all', label: t('mapper.grouping.all_elements', 'All Elements') },
                                { value: 'type', label: t('mapper.grouping.by_type', 'By Type') }
                            ]}
                        />
                    </div>
                    <div className="overflow-y-auto custom-scrollbar flex-1">
                        {elements.length === 0 ? (
                            <div className="p-4 text-center text-xs text-on-surface-variant/50 italic">
                                {t('mapper.no_saved_elements', 'No elements mapped')}
                            </div>
                        ) : listMode === 'all' ? (
                            elements.map(el => (
                                <div
                                    key={el.id}
                                    onClick={() => handleSelectOption(el.name)}
                                    className={clsx(
                                        "w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between group cursor-pointer border-b border-outline-variant/5 last:border-0",
                                        el.name === value
                                            ? "bg-primary/10 text-primary dark:text-primary/80"
                                            : "text-on-surface/80 hover:bg-surface-variant/10"
                                    )}
                                >
                                    <div className="flex flex-col gap-0.5 truncate">
                                        <span className="font-medium truncate">{el.name}</span>
                                        <span className="text-[10px] opacity-70 uppercase">{t(`mapper.types.${el.type}`)}</span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            // Group by Type
                            (() => {
                                const grouped = elements.reduce((acc, el) => {
                                    const typeName = t(`mapper.types.${el.type}`);
                                    if (!acc[typeName]) acc[typeName] = [];
                                    acc[typeName].push(el);
                                    return acc;
                                }, {} as Record<string, typeof elements>);

                                return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([type, items]) => {
                                    const isExpanded = expandedTypes.includes(type);
                                    return (
                                        <div key={type} className="border-b border-outline-variant/5 last:border-0">
                                            <div
                                                className="flex items-center justify-between p-2 hover:bg-surface-variant/10 cursor-pointer text-xs font-semibold text-on-surface-variant/80 bg-surface-variant/5"
                                                onClick={() => {
                                                    setExpandedTypes(prev =>
                                                        prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
                                                    );
                                                }}
                                            >
                                                <span className="flex items-center gap-1.5">
                                                    <span className="w-4 h-4 flex items-center justify-center">
                                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                    </span>
                                                    {type}
                                                </span>
                                                <span className="text-[10px] bg-surface-variant/30 px-1.5 rounded">{items.length}</span>
                                            </div>
                                            {isExpanded && (
                                                <div className="flex flex-col bg-surface-variant/5">
                                                    {items.map(el => (
                                                        <div
                                                            key={el.id}
                                                            onClick={() => handleSelectOption(el.name)}
                                                            className={clsx(
                                                                "flex items-center justify-between p-2 pl-8 hover:bg-surface-variant/10 cursor-pointer border-t border-outline-variant/5 transition-colors",
                                                                el.name === value
                                                                    ? "bg-primary/10 text-primary dark:text-primary/80"
                                                                    : "text-on-surface/80"
                                                            )}
                                                        >
                                                            <div className="flex flex-col gap-0.5 truncate">
                                                                <span className="text-sm font-medium truncate">{el.name}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                });
                            })()
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

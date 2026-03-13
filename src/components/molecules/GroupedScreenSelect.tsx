import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, X, ChevronsUpDown } from 'lucide-react';
import { ScreenMap } from '@/lib/types';
import { groupScreensByTags } from '@/lib/utils';
import { SegmentedControl } from '@/components/molecules/SegmentedControl';
import { Button, Input } from '@headlessui/react';

interface GroupedScreenSelectProps {
    label?: string;
    value: string;
    onChange: (value: string) => void;
    maps: ScreenMap[];
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

export function GroupedScreenSelect({
    label,
    value,
    onChange,
    maps,
    placeholder,
    className,
    disabled = false
}: GroupedScreenSelectProps) {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [listMode, setListMode] = useState<'all' | 'tags'>('all'); // Usually screens default to 'all' as it's cleaner
    const [expandedTags, setExpandedTags] = useState<string[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    // Initialize expanded tags on mount
    useEffect(() => {
        const defaultExpanded = Array.from(new Set(maps.flatMap(m => m.tags || []).concat([t('mapper.grouping.no_tags', 'No Tags')])));
        setExpandedTags(defaultExpanded);
    }, [maps, t]);

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
                {/* For screen mapping, allow users to type if it's not strictly restricted, but since we are standardizing to dropdown, we use a div */}
                <Input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={placeholder || t('common.select', 'Select...')}
                    disabled={disabled}
                    className="flex-1 bg-transparent border-none outline-none text-on-surface truncate min-w-0"
                />

                <div className="flex items-center gap-1 text-on-surface-variant/50 flex-shrink-0">
                    {value && !disabled && (
                        <Button
                            type="button"
                            onClick={handleClear}
                            className="p-0.5 hover:bg-surface-variant/30 rounded hover:text-on-surface transition-colors"
                        >
                            <X size={14} />
                        </Button>
                    )}
                    <Button
                        type="button"
                        className="p-0.5"
                    >
                        <ChevronsUpDown size={14} />
                    </Button>

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
                                { value: 'all', label: t('mapper.grouping.all_screens', 'All Screens') },
                                { value: 'tags', label: t('mapper.grouping.by_tags', 'By Tags') }
                            ]}
                        />
                    </div>
                    <div className="overflow-y-auto custom-scrollbar flex-1">
                        {maps.length === 0 ? (
                            <div className="p-4 text-center text-xs text-on-surface-variant/50 italic">
                                {t('mapper.no_saved_maps')}
                            </div>
                        ) : listMode === 'all' ? (
                            maps.map(map => (
                                <div
                                    key={map.id}
                                    onClick={() => handleSelectOption(map.name)}
                                    className={clsx(
                                        "w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between group cursor-pointer border-b border-outline-variant/5 last:border-0",
                                        map.name === value
                                            ? "bg-primary/10 text-primary dark:text-primary/80"
                                            : "text-on-surface/80 hover:bg-surface-variant/10"
                                    )}
                                >
                                    <div className="flex flex-col gap-0.5 truncate">
                                        <span className="font-medium truncate">{map.name}</span>
                                        <span className="text-[10px] opacity-70 uppercase">{t(`mapper.screen_types.${map.type}`)}</span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            // Group by Tags
                            (() => {
                                const groupedEntries = groupScreensByTags(maps, t('mapper.grouping.no_tags', 'No Tags'));

                                return groupedEntries.map(([tag, groupMaps]) => {
                                    const isExpanded = expandedTags.includes(tag);
                                    return (
                                        <div key={tag} className="border-b border-outline-variant/5 last:border-0">
                                            <div
                                                className="flex items-center justify-between p-2 hover:bg-surface-variant/10 cursor-pointer text-xs font-semibold text-on-surface-variant/80 bg-surface-variant/5"
                                                onClick={() => {
                                                    setExpandedTags(prev =>
                                                        prev.includes(tag) ? prev.filter(prevTag => prevTag !== tag) : [...prev, tag]
                                                    );
                                                }}
                                            >
                                                <span className="flex items-center gap-1.5">
                                                    <span className="w-4 h-4 flex items-center justify-center">
                                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                    </span>
                                                    {tag}
                                                </span>
                                                <span className="text-[10px] bg-surface-variant/30 px-1.5 rounded">{groupMaps.length}</span>
                                            </div>
                                            {isExpanded && (
                                                <div className="flex flex-col bg-surface-variant/5">
                                                    {groupMaps.map(map => (
                                                        <div
                                                            key={`${tag}-${map.id}`}
                                                            onClick={() => handleSelectOption(map.name)}
                                                            className={clsx(
                                                                "flex items-center justify-between p-2 pl-8 hover:bg-surface-variant/10 cursor-pointer border-t border-outline-variant/5 transition-colors",
                                                                map.name === value
                                                                    ? "bg-primary/10 text-primary dark:text-primary/80"
                                                                    : "text-on-surface/80"
                                                            )}
                                                        >
                                                            <div className="flex flex-col gap-0.5 truncate">
                                                                <span className="text-sm font-medium truncate">{map.name}</span>
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

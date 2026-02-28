
import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, ChevronsUpDown } from 'lucide-react';
import clsx from 'clsx';

interface TagInputProps {
    label?: string;
    tags: string[];
    onChange: (tags: string[]) => void;
    suggestions?: string[];
    placeholder?: string;
    className?: string;
}

export function TagInput({
    label,
    tags,
    onChange,
    suggestions = [],
    placeholder,
    className
}: TagInputProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    const filteredSuggestions = suggestions.filter(s =>
        !tags.includes(s) && s.toLowerCase().includes(inputValue.toLowerCase())
    );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const addTag = (tag: string) => {
        const trimmed = tag.trim();
        if (trimmed && !tags.includes(trimmed)) {
            onChange([...tags, trimmed]);
            setInputValue('');
        }
    };

    const removeTag = (tagToRemove: string) => {
        onChange(tags.filter(t => t !== tagToRemove));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTag(inputValue);
            setIsOpen(false);
        } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
            removeTag(tags[tags.length - 1]);
        }
    };

    return (
        <div className={clsx("flex flex-col gap-1", className)} ref={containerRef}>
            {label && (
                <label className="text-xs font-medium text-on-surface-variant/80 ml-1">
                    {label}
                </label>
            )}

            <div className="flex flex-wrap gap-1.5 p-1.5 min-h-[40px] bg-surface-variant/10 border border-outline-variant/30 rounded-lg focus-within:border-primary transition-colors relative">
                {tags.map(tag => (
                    <span
                        key={tag}
                        className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-full animate-in fade-in zoom-in duration-200"
                    >
                        {tag}
                        <button
                            onClick={() => removeTag(tag)}
                            className="hover:text-primary-dark transition-colors"
                        >
                            <X size={12} />
                        </button>
                    </span>
                ))}

                <div className="relative flex-1 min-w-[80px]">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => {
                            setInputValue(e.target.value);
                            setIsOpen(true);
                        }}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setIsOpen(true)}
                        placeholder={tags.length === 0 ? placeholder : ''}
                        className="w-full bg-transparent border-none outline-none text-sm p-0.5 text-on-surface"
                    />

                    {isOpen && filteredSuggestions.length > 0 && (
                        <div className="absolute z-50 left-0 top-full mt-2 w-48 bg-surface border border-outline-variant/30 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                            {filteredSuggestions.map(suggestion => (
                                <button
                                    key={suggestion}
                                    onClick={() => {
                                        addTag(suggestion);
                                        setIsOpen(false);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-surface-variant/10 text-on-surface/80 transition-colors flex items-center justify-between group"
                                >
                                    {suggestion}
                                    <Plus size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="absolute right-2 top-2.5 text-on-surface-variant/30 pointer-events-none">
                    <ChevronsUpDown size={14} />
                </div>
            </div>
        </div>
    );
}

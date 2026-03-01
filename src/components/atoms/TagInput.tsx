
import React, { useState, useRef, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './Button';
import { Input } from './Input';

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

            <div className="flex flex-wrap gap-1.5 p-0.5 min-h-[40px] bg-surface-variant/10 border border-outline-variant/30 rounded-lg focus-within:border-primary transition-colors relative">
                {tags.map(tag => (
                    <span
                        key={tag}
                        className="flex items-center gap-1 px-2 py-0 bg-primary/10 text-primary text-xs font-medium rounded-lg animate-in fade-in zoom-in duration-200"
                    >
                        {tag}
                        <Button
                            onClick={() => removeTag(tag)}
                            className="hover:bg-transparent hover:text-error transition-colors p-1 bg-transparent border-none shadow-none"
                        >
                            <X size={12} />
                        </Button>
                    </span>
                ))}

                <div className="relative flex-1 p-1">
                    <Input
                        type="text"
                        value={inputValue}
                        onChange={(e) => {
                            setInputValue(e.target.value);
                            setIsOpen(true);
                        }}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setIsOpen(true)}
                        placeholder={tags.length === 0 ? placeholder : ''}
                        className="w-full bg-transparent border-none outline-none text-sm p-1 text-on-surface"
                    />

                    {isOpen && filteredSuggestions.length > 0 && (
                        <div className="absolute z-50 left-0 top-full mt-0 w-48 bg-transparent overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                            {filteredSuggestions.map(suggestion => (
                                <Button
                                    key={suggestion}
                                    onClick={() => {
                                        addTag(suggestion);
                                        setIsOpen(false);
                                    }}
                                    className="w-full py-1 px-2 text-left my-1 text-xs rounded-lg bg-surface-variant hover:bg-surface-variant text-on-surface transition-colors flex items-center justify-between group"
                                >
                                    {suggestion}
                                    <Plus size={10} className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-success" />
                                </Button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

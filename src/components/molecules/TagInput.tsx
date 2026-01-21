import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

interface TagInputProps {
    label?: string;
    tags: string[];
    onAdd: (tag: string) => void;
    onRemove: (tag: string) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

export function TagInput({
    label,
    tags,
    onAdd,
    onRemove,
    placeholder,
    className,
    disabled
}: TagInputProps) {
    const [inputValue, setInputValue] = useState('');

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = inputValue.trim();
            if (val && !tags.includes(val)) {
                onAdd(val);
                setInputValue('');
            }
        }
    };

    const handleAdd = () => {
        const val = inputValue.trim();
        if (val && !tags.includes(val)) {
            onAdd(val);
            setInputValue('');
        }
    };

    return (
        <div className={twMerge("w-full space-y-1.5", className)}>
            {label && (
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {label}
                </label>
            )}
            <div className={twMerge(
                "w-full rounded-lg border border-zinc-200 bg-white dark:bg-zinc-900 dark:border-zinc-700 p-2 min-h-[42px] flex flex-wrap gap-2 items-center transition-all",
                "focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500"
            )}>
                {tags.map((tag) => (
                    <div
                        key={tag}
                        className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2 py-1 rounded-md text-sm text-zinc-700 dark:text-zinc-300 animate-in zoom-in-95 duration-200"
                    >
                        <span>{tag}</span>
                        {!disabled && (
                            <button
                                type="button"
                                onClick={() => onRemove(tag)}
                                className="hover:text-red-500 p-0.5 rounded-full transition-colors"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                ))}
                <div className="flex-1 flex items-center min-w-[120px] gap-2">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        disabled={disabled}
                        className="flex-1 bg-transparent border-none outline-none text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 px-1"
                    />
                    {inputValue && !disabled && (
                        <button
                            type="button"
                            onClick={handleAdd}
                            className="text-blue-500 hover:text-blue-600 transition-colors p-1"
                        >
                            <Plus size={16} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

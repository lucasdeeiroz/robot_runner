import React, { createContext, useContext, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

export interface SelectionItem {
    id: string;
    path: string;
    type: 'file' | 'folder' | 'args';
    name: string;
    tests?: string[]; // For Robot/Maestro files
    args?: string[];  // For Robot args files
}

interface SelectionContextType {
    items: SelectionItem[];
    addItem: (item: Omit<SelectionItem, 'id'>) => void;
    removeItem: (id: string) => void;
    updateItem: (id: string, updates: Partial<SelectionItem>) => void;
    clearSelection: () => void;
    toggleItem: (item: Omit<SelectionItem, 'id'>) => void;
    toggleTest: (path: string, testName: string, name: string) => void;
    toggleArg: (path: string, argName: string, name: string) => void;
    setTests: (path: string, tests: string[], name: string) => void;
    setArgs: (path: string, args: string[], name: string) => void;
    isSelected: (path: string) => boolean;
}

const SelectionContext = createContext<SelectionContextType | undefined>(undefined);

export function SelectionProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = useState<SelectionItem[]>([]);

    const addItem = useCallback((item: Omit<SelectionItem, 'id'>) => {
        setItems(prev => {
            if (prev.some(i => i.path === item.path && i.type === item.type)) {
                return prev;
            }
            return [...prev, { ...item, id: uuidv4() }];
        });
    }, []);

    const removeItem = useCallback((id: string) => {
        setItems(prev => prev.filter(i => i.id !== id));
    }, []);

    const updateItem = useCallback((id: string, updates: Partial<SelectionItem>) => {
        setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
    }, []);

    const clearSelection = useCallback(() => {
        setItems([]);
    }, []);

    const toggleItem = useCallback((item: Omit<SelectionItem, 'id'>) => {
        setItems(prev => {
            const existing = prev.find(i => i.path === item.path && i.type === item.type);
            if (existing) {
                return prev.filter(i => i.id !== existing.id);
            }
            return [...prev, { ...item, id: uuidv4() }];
        });
    }, []);

    const toggleTest = useCallback((path: string, testName: string, name: string) => {
        setItems(prev => {
            const existing = prev.find(i => i.path === path && i.type === 'file');
            if (existing) {
                const tests = existing.tests || [];
                const newTests = tests.includes(testName)
                    ? tests.filter(t => t !== testName)
                    : [...tests, testName];
                
                return prev.map(i => i.id === existing.id ? { ...i, tests: newTests } : i);
            } else {
                return [...prev, {
                    id: uuidv4(),
                    path,
                    type: 'file',
                    name,
                    tests: [testName]
                }];
            }
        });
    }, []);

    const toggleArg = useCallback((path: string, argName: string, name: string) => {
        setItems(prev => {
            const existing = prev.find(i => i.path === path && i.type === 'args');
            if (existing) {
                const args = existing.args || [];
                const newArgs = args.includes(argName)
                    ? args.filter(a => a !== argName)
                    : [...args, argName];
                
                return prev.map(i => i.id === existing.id ? { ...i, args: newArgs } : i);
            } else {
                return [...prev, {
                    id: uuidv4(),
                    path,
                    type: 'args',
                    name,
                    args: [argName]
                }];
            }
        });
    }, []);

    const setTests = useCallback((path: string, tests: string[], name: string) => {
        setItems(prev => {
            const existing = prev.find(i => i.path === path && i.type === 'file');
            if (existing) {
                return prev.map(i => i.id === existing.id ? { ...i, tests } : i);
            } else {
                return [...prev, {
                    id: uuidv4(),
                    path,
                    type: 'file',
                    name,
                    tests
                }];
            }
        });
    }, []);

    const setArgs = useCallback((path: string, args: string[], name: string) => {
        setItems(prev => {
            const existing = prev.find(i => i.path === path && i.type === 'args');
            if (existing) {
                return prev.map(i => i.id === existing.id ? { ...i, args } : i);
            } else {
                return [...prev, {
                    id: uuidv4(),
                    path,
                    type: 'args',
                    name,
                    args
                }];
            }
        });
    }, []);

    const isSelected = useCallback((path: string) => {
        return items.some(i => i.path === path);
    }, [items]);

    return (
        <SelectionContext.Provider value={{
            items,
            addItem,
            removeItem,
            updateItem,
            clearSelection,
            toggleItem,
            toggleTest,
            toggleArg,
            setTests,
            setArgs,
            isSelected
        }}>
            {children}
        </SelectionContext.Provider>
    );
}

export function useSelection() {
    const context = useContext(SelectionContext);
    if (context === undefined) {
        throw new Error('useSelection must be used within a SelectionProvider');
    }
    return context;
}

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface LayoutProps {
    children: ReactNode;
    activePage: string;
    onNavigate: (page: string) => void;
}

export function Layout({ children, activePage, onNavigate }: LayoutProps) {
    return (
        <div className="flex h-screen bg-zinc-950 text-white overflow-hidden">
            <Sidebar activePage={activePage} onNavigate={onNavigate} />
            <main className="flex-1 overflow-auto bg-zinc-950 p-6">
                {children}
            </main>
        </div>
    );
}

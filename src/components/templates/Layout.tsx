import { ReactNode } from 'react';
import { Sidebar } from '../organisms/Sidebar';

interface LayoutProps {
    children: ReactNode;
    activePage: string;
    onNavigate: (page: string) => void;
}

export function Layout({ children, activePage, onNavigate }: LayoutProps) {
    return (
        <div
            className="flex h-screen overflow-hidden transition-colors duration-300"
            style={{ backgroundColor: 'var(--bg-app-variant)', color: 'var(--text-app-variant)' }}
        >
            <Sidebar activePage={activePage} onNavigate={onNavigate} />
            <main
                className="flex-1 overflow-auto p-6 transition-colors duration-300"
                style={{ backgroundColor: 'var(--bg-app)' }}
            >
                {children}
            </main>
        </div>
    );
}

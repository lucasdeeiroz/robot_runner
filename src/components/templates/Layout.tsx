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
                className="flex-1 h-full overflow-y-auto transition-colors duration-300 p-6 custom-scrollbar"
                style={{ backgroundColor: 'var(--bg-app)' }}
            >
                {children}
            </main>
        </div>
    );
}

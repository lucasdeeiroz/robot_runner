import { useState, useEffect } from "react";
import { Layout } from "./components/Layout";
import { RunTab } from "./pages/RunTab";
import { TestsPage } from "./pages/TestsPage";
import { AIPage } from "./pages/AIPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AboutPage } from "./pages/AboutPage";
import { useSettings } from "@/lib/settings";
import { TestSessionProvider } from "@/lib/testSessionStore";
import { useTranslation } from "react-i18next";
import { Toaster } from 'sonner';
import clsx from "clsx";
import "./App.css";

function App() {
  const { t } = useTranslation();
  const [activePage, setActivePage] = useState("run");
  const { settings } = useSettings();

  useEffect(() => {
    // Apply theme
    const root = window.document.documentElement;
    console.log('[App] Applying theme:', settings.theme);
    root.classList.remove('light', 'dark');
    root.classList.add(settings.theme);

    // Apply primary color
    // Defines a palette of available colors - we can move this to a constant later if reused in SettingsPage
    const colors: Record<string, string> = {
      blue: '#2563eb', // blue-600
      red: '#dc2626', // red-600
      green: '#16a34a', // green-600
      purple: '#9333ea', // purple-600
      orange: '#ea580c', // orange-600
      cyan: '#0891b2', // cyan-600
      pink: '#db2777', // pink-600
    };

    // Default to blue if invalid
    const colorHex = colors[settings.primaryColor] || colors['blue'];
    root.style.setProperty('--color-primary', colorHex);

    console.log('[App] Root classes:', root.className);
  }, [settings.theme, settings.primaryColor]);

  return (
    <TestSessionProvider>
      <Toaster richColors position="bottom-right" theme={settings.theme === 'dark' ? 'dark' : 'light'} />
      <Layout activePage={activePage} onNavigate={setActivePage}>
        <div className="max-w-7xl mx-auto h-full flex flex-col">
          {/* Added h-full and removed mb-8 header for tab pages to control their own layout */}

          {activePage !== 'tests' && activePage !== 'run' && activePage !== 'about' && activePage !== 'ai' && activePage !== 'settings' && (
            <header className="mb-8 shrink-0">
              <h1 className="text-3xl font-bold mb-2 capitalize">{activePage}</h1>
              <p className="text-zinc-400">{t('settings.description')}</p>
            </header>
          )}

          <div className="flex-1 min-h-0 relative">
            <div className={clsx("absolute inset-0 flex flex-col", activePage === 'run' ? "z-10" : "z-0 hidden")}>
              <RunTab onNavigate={setActivePage} />
            </div>
            {activePage === 'tests' && <TestsPage />}
            {activePage === 'ai' && <AIPage />}
            {activePage === 'settings' && <SettingsPage />}
            {activePage === 'about' && <AboutPage />}

            {/* Placeholder for other pages */}
            {activePage !== 'run' && activePage !== 'tests' && activePage !== 'ai' && activePage !== 'settings' && activePage !== 'about' && (
              <div className="p-12 text-center border-2 border-dashed border-zinc-800 rounded-lg">
                <p className="text-zinc-500">Module {activePage} coming soon...</p>
              </div>
            )}
          </div>
        </div>
      </Layout>
    </TestSessionProvider>
  );
}

export default App;

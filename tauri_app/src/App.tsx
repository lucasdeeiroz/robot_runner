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
import clsx from "clsx";
import "./App.css";

function App() {
  const { t } = useTranslation();
  const [activePage, setActivePage] = useState("run");
  const { settings } = useSettings();

  useEffect(() => {
    // Apply theme
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(settings.theme);
  }, [settings.theme]);

  return (
    <TestSessionProvider>
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

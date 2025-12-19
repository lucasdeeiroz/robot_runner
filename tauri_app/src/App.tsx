import { useState } from "react";
import { Layout } from "./components/Layout";
import { RunTab } from "./pages/RunTab";
import { TestTab } from "./pages/TestTab";
import { AIPage } from "./pages/AIPage";
import { SettingsPage } from "./pages/SettingsPage";
import "./App.css";

import { useSettings } from "@/lib/settings";
import { useEffect } from "react";

function App() {
  const [activePage, setActivePage] = useState("run");
  const { settings } = useSettings();

  useEffect(() => {
    // Apply theme
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(settings.theme);
  }, [settings.theme]);

  return (
    <Layout activePage={activePage} onNavigate={setActivePage}>
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-2 capitalize">{activePage}</h1>
          <p className="text-zinc-400">Welcome to the new Robot Runner Desktop Experience.</p>
        </header>

        <div className="grid gap-6">
          {activePage === 'run' && <RunTab />}
          {activePage === 'tests' && <TestTab />}
          {activePage === 'ai' && <AIPage />}
          {activePage === 'settings' && <SettingsPage />}

          {/* Placeholder for other pages */}
          {activePage !== 'run' && activePage !== 'tests' && activePage !== 'ai' && activePage !== 'settings' && (
            <div className="p-12 text-center border-2 border-dashed border-zinc-800 rounded-lg">
              <p className="text-zinc-500">Module {activePage} coming soon...</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default App;

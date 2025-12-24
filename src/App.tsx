import { useState, useEffect } from "react";
import { Layout } from "./components/Layout";
import { RunTab } from "./pages/RunTab";
import { TestsPage } from "./pages/TestsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AboutPage } from "./pages/AboutPage";
import clsx from "clsx";
import { TestSessionProvider } from "./lib/testSessionStore";
import { Toaster } from "sonner";
import { useSettings } from "./lib/settings";
import { SystemCheckOverlay } from "./components/startup/SystemCheckOverlay";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

function App() {
  const [activePage, setActivePage] = useState("run");
  const { settings, checkSystemVersions, systemCheckStatus } = useSettings();

  // State to track if we should show the overlay or if it has been dismissed/handled
  const [initialCheckDismissed, setInitialCheckDismissed] = useState(false);
  const [initialSubTab, setInitialSubTab] = useState<'tests' | 'connect' | 'inspector' | undefined>(undefined);

  useEffect(() => {
    checkSystemVersions();
  }, []);

  // Determine if we should show the overlay
  const showOverlay = !initialCheckDismissed && (
    systemCheckStatus.loading ||
    !systemCheckStatus.complete ||
    systemCheckStatus.missingCritical.length > 0 ||
    systemCheckStatus.missingTesting.length > 0 ||
    systemCheckStatus.missingMirroring.length > 0
  );

  const handleCriticalExit = async () => {
    await getCurrentWindow().close();
  };

  const handleTestingRedirect = () => {
    setInitialSubTab('connect');
    setActivePage('run');
    setInitialCheckDismissed(true);
  };

  const handleMirroringContinue = () => {
    setInitialSubTab('tests'); // Default to Launcher (tests)
    setActivePage('run');
    setInitialCheckDismissed(true);
  };

  // If checks passed clean, auto-dismiss
  useEffect(() => {
    if (systemCheckStatus.complete &&
      systemCheckStatus.missingCritical.length === 0 &&
      systemCheckStatus.missingTesting.length === 0 &&
      systemCheckStatus.missingMirroring.length === 0) {
      setInitialCheckDismissed(true);
    }
  }, [systemCheckStatus]);


  // Apply theme class to body/html
  if (typeof window !== 'undefined') {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Set primary color css variable
    const colors: Record<string, string> = {
      blue: '221.2 83.2% 53.3%',
      indigo: '226 71% 55%', // Simplified
      violet: '255 60% 60%', // Simplified
      emerald: '142.1 76.2% 36.3%',
      rose: '343 88% 55%', // Simplified
      amber: '48 96% 53%' // Simplified
    };

    // This is a simplification. Ideally update CSS variables in root.
    // For now assuming blue/tailwind default is used or handled by index.css logic
    // We update the --primary HSL values
    if (colors[settings.primaryColor]) {
      document.documentElement.style.setProperty('--primary', colors[settings.primaryColor]);
      // Also update ring/border colors if needed
      // This relies on index.css using var(--primary)
    }
  }

  return (
    <TestSessionProvider>
      <Toaster richColors position="bottom-right" theme={settings.theme === 'dark' ? 'dark' : 'light'} />
      {showOverlay && (
        <SystemCheckOverlay
          status={systemCheckStatus}
          onCriticalExit={handleCriticalExit}
          onTestingRedirect={handleTestingRedirect}
          onMirroringContinue={handleMirroringContinue}
        />
      )}
      <Layout activePage={activePage} onNavigate={setActivePage}>
        <div className="max-w-7xl mx-auto h-full flex flex-col">
          {/* Header area - handled by Layout usually, but title is here? */}
          {/* App Title Header */}
          <div className="flex items-center justify-between px-8 py-6 shrink-0 z-50">
            <div className="flex flex-col">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                Robot Runner
                {/* <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium tracking-wider uppercase">Beta</span> */}
              </h1>
              <p className="text-sm text-zinc-500 font-medium">Test Automation & Device Management</p>
            </div>

            {/* Global Actions / Status can go here */}
          </div>


          <div className="flex-1 min-h-0 relative">
            <div className={clsx("absolute inset-0 flex flex-col", activePage === 'run' ? "z-10" : "z-0 hidden")}>
              <RunTab onNavigate={setActivePage} initialTab={initialSubTab} />
            </div>
            {activePage === 'tests' && <TestsPage />}
            {activePage === 'settings' && <SettingsPage />}
            {activePage === 'about' && <AboutPage />}

            {/* Placeholder for other pages */}
            {activePage !== 'run' && activePage !== 'tests' && activePage !== 'settings' && activePage !== 'about' && (
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

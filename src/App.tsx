import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PlayCircle, FileText, Settings, Info, Box } from "lucide-react";
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
  const { t } = useTranslation();
  const [activePage, setActivePage] = useState("run");
  const { settings, checkSystemVersions, systemCheckStatus, loading: settings_loading } = useSettings();

  // State to track if we should show the overlay or if it has been dismissed/handled
  const [initialCheckDismissed, setInitialCheckDismissed] = useState(false);
  const [initialSubTab, setInitialSubTab] = useState<'tests' | 'connect' | 'inspector' | undefined>(undefined);

  // Initial check moved to dependence on settings_loading

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

  const getHeaderInfo = () => {
    switch (activePage) {
      case 'run':
        return { title: t('sidebar.run'), description: t('sidebar.description_run'), Icon: PlayCircle };
      case 'tests':
        return { title: t('sidebar.tests'), description: t('sidebar.description_tests'), Icon: FileText };
      case 'settings':
        return { title: t('sidebar.settings'), description: t('sidebar.description_settings'), Icon: Settings };
      case 'about':
        return { title: t('sidebar.about'), description: t('sidebar.description_about'), Icon: Info };
      default:
        return { title: 'Robot Runner', description: 'Test Automation & Device Management', Icon: Box };
    }
  };

  const { title, description, Icon } = getHeaderInfo();

  const handleTestingRedirect = () => {
    setActivePage('settings');
    setInitialCheckDismissed(true);
  };

  const handleMirroringContinue = () => {
    setInitialSubTab('tests'); // Default to Launcher (tests)
    setActivePage('run');
    setInitialCheckDismissed(true);
  };

  const handleDismiss = () => {
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


  // Apply theme and primary color immediately when settings change or load
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Theme logic
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Primary Color Logic
    const colors: Record<string, string> = {
      blue: '#2563eb',
      red: '#dc2626',
      green: '#16a34a',
      purple: '#9333ea',
      orange: '#ea580c',
      cyan: '#0891b2',
      pink: '#db2777',
    };

    const color = colors[settings.primaryColor] || colors.blue;
    document.documentElement.style.setProperty('--color-primary', color);

  }, [settings.theme, settings.primaryColor]);

  // Only check system versions AFTER settings are loaded
  useEffect(() => {
    if (!settings_loading) {
      checkSystemVersions();
    }
  }, [settings_loading]);

  // Prevent rendering (and thus flash) until settings are loaded
  if (settings_loading) {
    return null; // Or a minimal loading spinner matching the system theme background if possible, but null is safest for "no flash" if the HTML bg is neutral or handled by index.html
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
          onDismiss={handleDismiss}
        />
      )}
      <Layout activePage={activePage} onNavigate={setActivePage}>
        <div className="max-w-7xl mx-auto h-full flex flex-col">
          {/* Header area - handled by Layout usually, but title is here? */}
          {/* App Title Header */}
          <div className="flex items-center gap-4 px-8 py-6 shrink-0 z-50">
            <div className="h-[52px] w-[52px] flex items-center justify-center rounded-2xl bg-primary/10">
              <Icon size={32} className="text-[var(--color-primary)]" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                {title}
                {/* <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium tracking-wider uppercase">Beta</span> */}
              </h1>
              <p className="text-sm text-zinc-500 font-medium">{description}</p>
            </div>
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

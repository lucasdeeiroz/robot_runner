import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Layout } from "./components/templates/Layout";
import { RunPage } from "./pages/RunPage";
import { TestsPage } from "./pages/TestsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AboutPage } from "./pages/AboutPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TestSessionProvider } from "./lib/testSessionStore";
import { Toaster } from "sonner";
import { useSettings } from "./lib/settings";
import { SystemCheckOverlay } from "./components/organisms/SystemCheckOverlay";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Onboarding } from "./components/organisms/Onboarding";
import "./App.css";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { argbFromHex, themeFromSourceColor, TonalPalette } from "@material/material-color-utilities";
import { DeviceProvider } from "./lib/deviceStore";
import { ExpressiveLoading } from "./components/atoms/ExpressiveLoading";

function App() {
  const [activePage, setActivePage] = useState("run");
  const { t, i18n } = useTranslation();
  const { settings, checkSystemVersions, systemCheckStatus, loading: settings_loading, checkForAppUpdate } = useSettings();

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

  // Sync settings language with i18n globally
  useEffect(() => {
    if (settings.language) {
      const langMap: Record<string, string> = {
        'en_US': 'en',
        'pt_BR': 'pt',
        'es_ES': 'es'
      };
      const mappedLang = langMap[settings.language] || 'en';
      if (i18n.language !== mappedLang) {
        i18n.changeLanguage(mappedLang);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.language]);
  // Apply theme and primary color immediately when settings change or load
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Theme logic
    const isDark = settings.theme === 'dark';
    if (isDark) {
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

    const colorHex = colors[settings.primaryColor] || colors.blue;

    // Generate and apply Material 3 theme manually to match Tailwind's expected RGB format
    try {
      const theme = themeFromSourceColor(argbFromHex(colorHex));
      const scheme = isDark ? theme.schemes.dark : theme.schemes.light;

      // Helper to convert decimal ARGB to RGB space-separated string
      const toRgb = (argb: number) => {
        const r = (argb >> 16) & 0xFF;
        const g = (argb >> 8) & 0xFF;
        const b = argb & 0xFF;
        return `${r} ${g} ${b}`;
      };

      // Apply all colors from the scheme
      const jsonScheme = scheme.toJSON();
      for (const [key, value] of Object.entries(jsonScheme)) {
        // Convert camelCase to kebab-case (e.g. onPrimary -> on-primary)
        const token = key.replace(/([A-Z])/g, "-$1").toLowerCase();
        const colorValue = toRgb(value);
        document.documentElement.style.setProperty(`--md-sys-color-${token}`, colorValue);
      }

      // Generate Custom Colors (Success, Warning, Info)
      // We use TonalPalette to generate the correct tones for Light/Dark modes
      // Mapping:
      // Light: Color=40, On=100, Container=90, OnContainer=10
      // Dark:  Color=80, On=20,  Container=30, OnContainer=90
      const customColors = {
        success: '#22c55e', // success
        warning: '#eab308', // warning
        info: '#0ea5e9',    // sky-500
      };

      for (const [name, hex] of Object.entries(customColors)) {
        const palette = TonalPalette.fromInt(argbFromHex(hex));
        const setVar = (role: string, tone: number) => {
          document.documentElement.style.setProperty(`--md-sys-color-${name}${role}`, toRgb(palette.tone(tone)));
        };

        if (isDark) {
          setVar('', 80);            // color-success
          setVar('-on', 20);         // color-on-success
          setVar('-container', 30);  // color-success-container
          setVar('-on-container', 90); // color-on-success-container
        } else {
          setVar('', 40);            // color-success
          setVar('-on', 100);        // color-on-success
          setVar('-container', 90);  // color-success-container
          setVar('-on-container', 10); // color-on-success-container
        }
      }

    } catch (e) {
      console.error("Failed to apply Material theme:", e);
    }

  }, [settings.theme, settings.primaryColor]);

  // Only check system versions AFTER settings are loaded
  useEffect(() => {
    if (!settings_loading) {
      checkSystemVersions();
      checkForAppUpdate(false); // Silent global check on startup
    }
  }, [settings_loading]);

  // Prevent rendering (and thus flash) until settings are loaded
  if (settings_loading) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-surface text-primary">
        <ExpressiveLoading variant="circular" size="lg" />
      </div>
    );
  }

  return (
    <TestSessionProvider>
      <DeviceProvider>
        <Toaster richColors position="bottom-right" theme={settings.theme === 'dark' ? 'dark' : 'light'} />
        <AnimatePresence>
          {!settings.usageMode && (
            <Onboarding key="onboarding-flow" onComplete={() => {
              // Trigger a manual check version after onboarding is complete
              checkSystemVersions();
            }} />
          )}
          {showOverlay && settings.usageMode && (
            <SystemCheckOverlay
              key="system-check-overlay"
              status={systemCheckStatus}
              onCriticalExit={handleCriticalExit}
              onTestingRedirect={handleTestingRedirect}
              onMirroringContinue={handleMirroringContinue}
              onDismiss={handleDismiss}
            />
          )}
        </AnimatePresence>
        <Layout activePage={activePage} onNavigate={setActivePage}>
          <div className="max-w-7xl mx-auto h-full flex flex-col relative">
            {/* RunPage - Kept mounted to preserve state */}
            {/* When active, it is relative to drive the container height. When not, it is absolute/hidden. */}
            <motion.div
              className={clsx("flex flex-col w-full", activePage === 'run' ? "relative" : "absolute inset-0 pointer-events-none opacity-0")}
              initial={false}
              animate={{
                opacity: activePage === 'run' ? 1 : 0,
                zIndex: activePage === 'run' ? 10 : 0,
                scale: activePage === 'run' ? 1 : 0.98
              }}
              transition={{ duration: 0.3 }}
            >
              <RunPage onNavigate={setActivePage} initialTab={initialSubTab} />
            </motion.div>

            {/* Other Pages - Transitions using AnimatePresence */}
            <AnimatePresence mode="wait">
              {activePage !== 'run' && (
                <motion.div
                  key={activePage}
                  className="relative w-full flex flex-col z-20"
                  initial={{ opacity: 0, scale: 0.98, x: 20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.98, x: -20, position: 'absolute' }}
                  transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
                >
                  {activePage === 'tests' && <TestsPage />}
                  {activePage === 'dashboard' && <DashboardPage onNavigate={setActivePage} />}
                  {activePage === 'settings' && <SettingsPage />}
                  {activePage === 'about' && <AboutPage />}

                  {/* Placeholder for other pages */}
                  {activePage !== 'tests' && activePage !== 'settings' && activePage !== 'about' && activePage !== 'dashboard' && (
                    <div className="p-12 text-center border-2 border-dashed border-outline-variant/30 rounded-2xl m-4">
                      <p className="text-on-surface-variant/80">{t('common.coming_soon', { module: activePage })}</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Layout>
      </DeviceProvider>
    </TestSessionProvider>
  );
}

export default App;

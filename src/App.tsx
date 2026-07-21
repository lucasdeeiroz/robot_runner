import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Layout } from "./components/templates/Layout";
import { RunPage } from "./pages/RunPage";
import { TestsPage } from "./pages/TestsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AboutPage } from "./pages/AboutPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HomePage } from "./pages/HomePage";
import { TestSessionProvider } from "./lib/testSessionStore";
import { Toaster } from "sonner";
import "sonner/dist/styles.css";
import { useSettings } from "./lib/settings";
import { SystemCheckOverlay } from "./components/organisms/SystemCheckOverlay";
import { EnvironmentManager } from "./components/organisms/EnvironmentManager";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Onboarding } from "./components/organisms/Onboarding";
import "./App.css";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { argbFromHex, themeFromSourceColor, TonalPalette } from "@material/material-color-utilities";
import { DeviceProvider } from "./lib/deviceStore";
import { SelectionProvider } from "./lib/selectionStore";
import { ExpressiveLoading } from "./components/atoms/ExpressiveLoading";
import { useAuth } from "./lib/authStore";
import { LoginPage } from "./pages/LoginPage";
import { RemoteConfigProvider } from "./lib/RemoteConfigProvider";
import { Button } from "./components/atoms/Button";

function App() {
  return (
    <RemoteConfigProvider>
      <AppContent />
    </RemoteConfigProvider>
  );
}

function AppContent() {
  const [activePage, setActivePage] = useState("home");
  const { t, i18n } = useTranslation();
  const { settings, updateSetting, checkSystemVersions, systemCheckStatus, loading: settings_loading, checkForAppUpdate } = useSettings();
  const { user, skippedLogin, loading: auth_loading } = useAuth();

  // Initialize Remote Config once authenticated (now handled by RemoteConfigProvider)

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
      blue: '#4338ca',
      red: '#e11d48',
      green: '#059669',
      purple: '#7c3aed',
      orange: '#d97706',
      cyan: '#0d9488',
      pink: '#be123c',
    };

    const colorHex = settings.primaryColor?.startsWith('#') 
      ? settings.primaryColor 
      : (colors[settings.primaryColor] || colors.blue);

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
        success: '#10b981',
        warning: '#f59e0b',
        info: '#3b82f6',
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

  // Apply Global Zoom Scaling
  useEffect(() => {
    document.documentElement.style.fontSize = `${(settings.zoomFactor || 1.0) * 100}%`;
  }, [settings.zoomFactor]);

  // Global Keyboard Shortcuts (Zoom)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const step = 0.1;
        const currentZoom = settings.zoomFactor || 1.0;

        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          const nextZoom = Math.min(1.3, currentZoom + step);
          updateSetting('zoomFactor', Number(nextZoom.toFixed(1)));
        } else if (e.key === '-') {
          e.preventDefault();
          const nextZoom = Math.max(0.7, currentZoom - step);
          updateSetting('zoomFactor', Number(nextZoom.toFixed(1)));
        } else if (e.key === '0') {
          e.preventDefault();
          updateSetting('zoomFactor', 1.0);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings.zoomFactor, updateSetting]);

  // Only check system versions AFTER settings are loaded
  useEffect(() => {
    if (!settings_loading) {
      checkSystemVersions(undefined, undefined, true);
      checkForAppUpdate(false); // Silent global check on startup
    }
  }, [settings_loading]);

  // Prevent rendering (and thus flash) until settings are loaded
  // Diagnostics for loading
  const [loadingTime, setLoadingTime] = useState(0);
  useEffect(() => {
    let timer: any;
    if (settings_loading || auth_loading) {
      timer = setInterval(() => {
        setLoadingTime(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [settings_loading, auth_loading]);

  const forceBypassLoading = () => {
    console.warn("[App] Manual loading bypass triggered.");
    setLoadingTime(-1); // Special state to bypass
  };

  if ((settings_loading || auth_loading) && loadingTime !== -1) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-surface text-primary dark:text-primary/80 gap-8 p-6">
        <div className="relative">
          <ExpressiveLoading variant="circular" size="lg" />
          {/* Diagnostic info is now hidden but the logic remains active */}
        </div>
        
        {loadingTime > 10 && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 max-w-sm text-center"
          >
            <p className="text-sm text-on-surface-variant/60">
              {t('common.loading_taking_too_long')}
            </p>
            <Button variant="outline" size="sm" onClick={forceBypassLoading}>
              {t('common.continue_anyway')}
            </Button>
          </motion.div>
        )}
      </div>
    );
  }

  if (!user && !skippedLogin) {
    return <LoginPage />;
  }

  return (
    <TestSessionProvider>
      <DeviceProvider>
        <SelectionProvider>
          <AnimatePresence>
            <EnvironmentManager />
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
            <div className="max-w-8xl mx-auto h-full flex flex-col relative">
              {/* RunPage - Kept mounted to preserve state */}
              {/* When active, it is relative to drive the container height. When not, it is absolute/hidden. */}
              <motion.div
                className={clsx("flex flex-col w-full min-h-full px-4", activePage === 'run' ? "relative" : "absolute inset-0 pointer-events-none opacity-0 overflow-hidden")}
                initial={false}
                animate={{
                  opacity: activePage === 'run' ? 1 : 0,
                  zIndex: activePage === 'run' ? 10 : 0,
                  scale: activePage === 'run' ? 1 : 0.98
                }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                <RunPage onNavigate={setActivePage} initialTab={initialSubTab} />
              </motion.div>

              {/* DashboardPage - Kept mounted to preserve MapperSubTab/exploration state */}
              <motion.div
                className={clsx("flex flex-col w-full min-h-full", activePage === 'dashboard' ? "relative" : "absolute inset-0 pointer-events-none opacity-0 overflow-hidden")}
                initial={false}
                animate={{
                  opacity: activePage === 'dashboard' ? 1 : 0,
                  zIndex: activePage === 'dashboard' ? 10 : 0,
                  scale: activePage === 'dashboard' ? 1 : 0.98
                }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                <DashboardPage onNavigate={setActivePage} />
              </motion.div>

              {/* TestsPage - Kept mounted to preserve MapperSubTab/exploration state */}
              <motion.div
                className={clsx("flex flex-col w-full min-h-full", activePage === 'tests' ? "relative" : "absolute inset-0 pointer-events-none opacity-0 overflow-hidden")}
                initial={false}
                animate={{
                  opacity: activePage === 'tests' ? 1 : 0,
                  zIndex: activePage === 'tests' ? 10 : 0,
                  scale: activePage === 'tests' ? 1 : 0.98
                }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                <TestsPage onNavigate={setActivePage} />
              </motion.div>

              {/* Other Pages - Transitions using AnimatePresence */}
              <AnimatePresence mode="popLayout">
                {activePage !== 'run' && activePage !== 'dashboard' && activePage !== 'tests' && (
                  <motion.div
                    key={activePage}
                    className="relative w-full flex flex-col z-20"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  >
                    {activePage === 'settings' && <SettingsPage />}
                    {activePage === 'about' && <AboutPage />}
                    {activePage === 'home' && <HomePage onNavigate={setActivePage} />}

                    {/* Placeholder for other pages */}
                    {activePage !== 'settings' && activePage !== 'about' && activePage !== 'home' && (
                      <div className="p-12 text-center border-2 border-dashed border-outline-variant/30 rounded-2xl m-4">
                        <p className="text-on-surface-variant/80">{t('common.coming_soon', { module: activePage })}</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Layout>
          <Toaster richColors position="bottom-right" theme={settings.theme === 'dark' ? 'dark' : 'light'} />
        </SelectionProvider>
      </DeviceProvider>
    </TestSessionProvider>
  );
}

export default App;

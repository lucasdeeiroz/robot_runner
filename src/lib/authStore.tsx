import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithCredential, 
  GoogleAuthProvider, 
  signOut as firebaseSignOut 
} from 'firebase/auth';
import { auth } from './firebase';
import { feedback } from './feedback';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (!auth) {
      console.warn("[Auth] Firebase Auth is not initialized. Skipping auth listener.");
      setLoading(false);
      return;
    }

    // Safety timeout: if Firebase Auth takes more than 10s to respond, stop loading
    const safetyTimer = setTimeout(() => {
      console.warn("[Auth] Firebase Auth took too long to initialize, bypassing loading...");
      setLoading(false);
    }, 10000);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      clearTimeout(safetyTimer);
      setUser(user);
      setLoading(false);
    });

    return () => {
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    if (!auth) {
      feedback.toast.error("auth.config_missing");
      return;
    }
    setLoginLoading(true);
    try {
      console.log("Starting External Browser Auth Flow...");
      
      // 1. Set up listeners for the Rust loopback server events
      const authPromise = new Promise<string>((resolve, reject) => {
        let timeout = setTimeout(() => {
          cleanup();
          reject(new Error("Timeout"));
        }, 300000); // 5 min

        const unlistenReady = listen<{ port: number }>('auth-server-ready', (event) => {
          const { port } = event.payload;
          const projectID = import.meta.env.VITE_FIREBASE_PROJECT_ID;
          const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
          
          const bridgeUrl = `https://${projectID}.firebaseapp.com/login.html?port=${port}&apiKey=${apiKey}`;
          console.log("Opening bridge URL:", bridgeUrl);
          openUrl(bridgeUrl);
        });

        const unlistenSuccess = listen<{ code: string }>('auth-code-received', (event) => {
          clearTimeout(timeout);
          cleanup();
          resolve(event.payload.code);
        });

        const unlistenError = listen<string>('auth-error', (event) => {
          clearTimeout(timeout);
          cleanup();
          reject(new Error(event.payload));
        });

        const cleanup = async () => {
          (await unlistenReady)();
          (await unlistenSuccess)();
          (await unlistenError)();
        };
      });

      // 3. Start the Rust server
      await invoke('start_auth_server');

      // 4. Wait for the token
      const idToken = await authPromise;

      // 5. Sign in to Firebase using the received ID Token
      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(auth, credential);

      console.log("External Auth Successful");
      feedback.toast.success('auth.login_success');
    } catch (error: any) {
      console.error("External Auth Error:", error);
      feedback.toast.error('auth.login_error');
    } finally {
      setLoginLoading(false);
    }
  };

  const signOut = async () => {
    if (!auth) return;
    try {
      await firebaseSignOut(auth);
      feedback.toast.success('auth.logout_success');
    } catch (error: any) {
      feedback.toast.error('auth.logout_error');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginLoading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

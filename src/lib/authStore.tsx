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
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setLoginLoading(true);
    try {
      console.log("Starting External Browser Auth Flow...");
      
      // 1. Set up listeners for the Rust loopback server events
      const unlistenReady = await listen<number>('auth-server-ready', async (event) => {
        const port = event.payload;
        const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
        const projectID = import.meta.env.VITE_FIREBASE_PROJECT_ID;
        
        // Build the bridge URL. Note: You need to have a login.html on your Firebase Hosting.
        // For development, we'll open the browser and let the user know.
        const bridgeUrl = `https://${projectID}.firebaseapp.com/login.html?port=${port}&apiKey=${apiKey}`;
        console.log("Opening bridge URL:", bridgeUrl);
        await openUrl(bridgeUrl);
      });

      // 2. Create a promise that resolves when the code is received from Rust
      const authPromise = new Promise<string>((resolve, reject) => {
        let timeout = setTimeout(() => reject(new Error("Timeout")), 300000); // 5 min
        
        listen<{ code: string }>('auth-code-received', (event) => {
          clearTimeout(timeout);
          resolve(event.payload.code);
        });

        listen<string>('auth-error', (event) => {
          clearTimeout(timeout);
          reject(new Error(event.payload));
        });
      });

      // 3. Start the Rust server
      await invoke('start_auth_server');

      // 4. Wait for the token
      const idToken = await authPromise;
      unlistenReady();

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

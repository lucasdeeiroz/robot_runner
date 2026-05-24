import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { initRemoteConfig, getRemoteBool, getRemoteString, getRemoteNumber, isFeatureEnabled } from './remoteConfig';
import { useAuth } from './authStore';

interface RemoteConfigContextType {
    isReady: boolean;
    getBool: (key: string) => boolean;
    getString: (key: string) => string;
    getNumber: (key: string) => number;
    isFeatureEnabled: (key: string) => boolean;
}

const RemoteConfigContext = createContext<RemoteConfigContextType | undefined>(undefined);

export const RemoteConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isReady, setIsReady] = useState(false);
    const { user } = useAuth();

    useEffect(() => {
        const init = async () => {
            console.log("[RemoteConfigProvider] Initializing...");
            try {
                await initRemoteConfig();
                console.log("[RemoteConfigProvider] Initialization complete, setting isReady=true");
                setIsReady(true);
            } catch (e) {
                console.error("[RemoteConfigProvider] Initialization failed:", e);
                // Still set ready so app can at least use defaults
                setIsReady(true); 
            }
        };
        init();
    }, []);

    const userEmail = user?.email || null;

    const value = useMemo(() => ({
        isReady,
        getBool: getRemoteBool,
        getString: getRemoteString,
        getNumber: getRemoteNumber,
        isFeatureEnabled: (key: string) => isFeatureEnabled(key, userEmail)
    }), [isReady, userEmail]);

    return (
        <RemoteConfigContext.Provider value={value}>
            {children}
        </RemoteConfigContext.Provider>
    );
};

export const useRemoteConfig = () => {
    const context = useContext(RemoteConfigContext);
    if (context === undefined) {
        throw new Error('useRemoteConfig must be used within a RemoteConfigProvider');
    }
    return context;
};

import React, { createContext, useContext, useState, useEffect } from 'react';
import { initRemoteConfig, getRemoteBool, getRemoteString, getRemoteNumber } from './remoteConfig';

interface RemoteConfigContextType {
    isReady: boolean;
    getBool: (key: string) => boolean;
    getString: (key: string) => string;
    getNumber: (key: string) => number;
}

const RemoteConfigContext = createContext<RemoteConfigContextType | undefined>(undefined);

export const RemoteConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const init = async () => {
            await initRemoteConfig();
            setIsReady(true);
        };
        init();
    }, []);

    const value = {
        isReady,
        getBool: getRemoteBool,
        getString: getRemoteString,
        getNumber: getRemoteNumber
    };

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

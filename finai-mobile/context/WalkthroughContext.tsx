import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSegments } from 'expo-router';
import { useAuth } from './AuthContext';
import WalkthroughModal from '../components/WalkthroughModal';

type WalkthroughContextValue = { openWalkthrough: () => void };
const WalkthroughContext = createContext<WalkthroughContextValue | undefined>(undefined);
const seenKey = (userId: string) => `@finai_walkthrough_seen_${userId}`;

export function WalkthroughProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const segments = useSegments();
  const isUserArea = segments[0] === '(tabs)';
  const [visible, setVisible] = useState(false);
  const [readyUserId, setReadyUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setVisible(false);
    setReadyUserId(null);
    if (!user?.id || user.role === 'admin' || !isUserArea) return () => { active = false; };

    AsyncStorage.getItem(seenKey(user.id))
      .then((seen) => {
        if (!active) return;
        setReadyUserId(user.id);
        if (seen !== 'true') setVisible(true);
      })
      .catch(() => {
        // If local storage is temporarily unavailable, don't block app access.
        if (active) setReadyUserId(user.id);
      });
    return () => { active = false; };
  }, [user?.id, user?.role, isUserArea]);

  const closeWalkthrough = useCallback(async () => {
    const id = user?.id;
    setVisible(false);
    if (id) await AsyncStorage.setItem(seenKey(id), 'true').catch(() => undefined);
  }, [user?.id]);

  const openWalkthrough = useCallback(() => {
    if (user?.role !== 'admin') setVisible(true);
  }, [user?.role]);
  const contextValue = useMemo(() => ({ openWalkthrough }), [openWalkthrough]);

  return (
    <WalkthroughContext.Provider value={contextValue}>
      {children}
      {user?.id && user.role !== 'admin' && isUserArea && readyUserId === user.id && (
        <WalkthroughModal visible={visible} onClose={() => { void closeWalkthrough(); }} />
      )}
    </WalkthroughContext.Provider>
  );
}

export const useWalkthrough = () => {
  const value = useContext(WalkthroughContext);
  if (!value) throw new Error('useWalkthrough must be used within a WalkthroughProvider');
  return value;
};

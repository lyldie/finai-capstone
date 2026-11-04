import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { API_URL } from '../config';

type NetworkStatus = { isOnline: boolean | null; checking: boolean; checkNow: () => Promise<boolean> };
const NetworkStatusContext = createContext<NetworkStatus | undefined>(undefined);

export function NetworkStatusProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const checkSequence = useRef(0);
  const checkNow = useCallback(async () => {
    const sequence = ++checkSequence.current;
    setChecking(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(`${API_URL}/api/health`, { method: 'GET', signal: controller.signal });
      const health = await response.json().catch(() => ({}));
      const reachable = response.ok && health?.details?.database !== 'error' && health?.details?.database !== 'offline';
      if (sequence === checkSequence.current) setIsOnline(reachable);
      return reachable;
    } catch {
      if (sequence === checkSequence.current) setIsOnline(false);
      return false;
    } finally {
      clearTimeout(timeout);
      if (sequence === checkSequence.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkNow();
    const timer = setInterval(() => void checkNow(), 20000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkNow();
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [checkNow]);

  return <NetworkStatusContext.Provider value={{ isOnline, checking, checkNow }}>{children}</NetworkStatusContext.Provider>;
}

export function useNetworkStatus() {
  const context = useContext(NetworkStatusContext);
  if (!context) throw new Error('useNetworkStatus must be used within NetworkStatusProvider');
  return context;
}

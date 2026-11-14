import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { API_URL } from '../config';

type NetworkStatus = { isOnline: boolean | null; checking: boolean; checkNow: () => Promise<boolean> };
const NetworkStatusContext = createContext<NetworkStatus | undefined>(undefined);

export function NetworkStatusProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const checkSequence = useRef(0);
  const consecutiveFailures = useRef(0);
  const checkNow = useCallback(async () => {
    const sequence = ++checkSequence.current;
    setChecking(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(`${API_URL}/api/health`, { method: 'GET', signal: controller.signal });
      // The health endpoint also checks MongoDB and AI providers. Those can be
      // degraded while the API is still reachable, so don't call that offline.
      const reachable = response.ok;
      if (sequence === checkSequence.current) {
        consecutiveFailures.current = reachable ? 0 : consecutiveFailures.current + 1;
        // Ignore one missed probe (mobile networks briefly drop requests). A
        // second consecutive failure switches to offline mode.
        if (reachable) setIsOnline(true);
        else if (consecutiveFailures.current >= 2) setIsOnline(false);
      }
      return reachable;
    } catch {
      if (sequence === checkSequence.current) {
        consecutiveFailures.current += 1;
        if (consecutiveFailures.current >= 2) setIsOnline(false);
      }
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

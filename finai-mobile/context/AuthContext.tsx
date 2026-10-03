import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface User {
  id: string;
  name: string;
  email: string;
  role?: string;
  token?: string; // Signed session used by authenticated API requests.
}

interface AuthContextType {
  user: User | null;
  loginUser: (userData: User) => Promise<void>;
  logoutUser: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const storedId = await AsyncStorage.getItem('user_id');
        const storedName = await AsyncStorage.getItem('user_name');
        const storedEmail = await AsyncStorage.getItem('user_email');
        const storedRole = await AsyncStorage.getItem('user_role');
        const storedToken = await AsyncStorage.getItem('user_token'); // NEW

        if (storedId && storedName && storedEmail) {
          setUser({
            id: storedId,
            name: storedName,
            email: storedEmail,
            role: storedRole || undefined,
            token: storedToken || undefined, // NEW
          });
        }
      } catch (e) {
        console.log('Failed to load user session', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadUserData();
  }, []);

  const loginUser = async (userData: User) => {
    setUser(userData);
    await AsyncStorage.setItem('user_id', userData.id);
    await AsyncStorage.setItem('user_name', userData.name);
    await AsyncStorage.setItem('user_email', userData.email);
    if (userData.role) {
      await AsyncStorage.setItem('user_role', userData.role);
    }
    // Store the signed session returned by both login and OTP verification.
    if (userData.token) {
      await AsyncStorage.setItem('user_token', userData.token);
    }
  };

  const logoutUser = async () => {
    setUser(null);
    const keysToRemove = ['user_id', 'user_name', 'user_email', 'user_role', 'user_pin', 'user_token']; // NEW: user_token added
    await AsyncStorage.multiRemove(keysToRemove);
  };

  return (
    <AuthContext.Provider value={{ user, loginUser, logoutUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

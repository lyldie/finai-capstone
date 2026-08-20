import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 1. Pinalawak natin ang interface para hawak niya lahat ng importanteng data
interface User {
  id: string;
  name: string;
  email: string;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  loginUser: (userData: User) => Promise<void>;
  logoutUser: () => Promise<void>;
  isLoading: boolean; // Para hindi mag-flicker ang screen habang nagche-check ng session
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null); // Tinanggal na natin yung hardcoded name
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const storedId = await AsyncStorage.getItem('user_id');
        const storedName = await AsyncStorage.getItem('user_name');
        const storedEmail = await AsyncStorage.getItem('user_email');
        const storedRole = await AsyncStorage.getItem('user_role');

        if (storedId && storedName && storedEmail) {
          setUser({ 
            id: storedId, 
            name: storedName, 
            email: storedEmail, 
            role: storedRole || undefined 
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

  // 2. Centralized Login Function (Ito ang tatawagin natin sa login.tsx mamaya)
  const loginUser = async (userData: User) => {
    setUser(userData);
    await AsyncStorage.setItem('user_id', userData.id);
    await AsyncStorage.setItem('user_name', userData.name);
    await AsyncStorage.setItem('user_email', userData.email);
    if (userData.role) {
      await AsyncStorage.setItem('user_role', userData.role);
    }
  };

  // 3. Centralized Logout Function
  const logoutUser = async () => {
    setUser(null);
    const keysToRemove = ['user_id', 'user_name', 'user_email', 'user_role', 'user_pin'];
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
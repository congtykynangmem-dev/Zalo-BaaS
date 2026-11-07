'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { fetchApi, getAuthToken, setAuthToken, clearAuthToken } from './api';

export interface UserProfile {
  id: string;
  email: string;
  role: 'platform_owner' | 'tenant_admin' | 'tenant_agent';
  tenant?: {
    id: string;
    name: string;
    plan_id: string;
  } | null;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: UserProfile) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const storedToken = getAuthToken();
      if (!storedToken) {
        setUser(null);
        setTokenState(null);
        setIsLoading(false);
        return;
      }

      setTokenState(storedToken);
      const res = await fetchApi<{ user: UserProfile; tenant: UserProfile['tenant'] }>('/v1/auth/me');
      setUser({
        ...res.user,
        tenant: res.tenant,
      });
    } catch {
      clearAuthToken();
      setUser(null);
      setTokenState(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = (newToken: string, newUser: UserProfile) => {
    setAuthToken(newToken);
    setTokenState(newToken);
    setUser(newUser);
  };

  const logout = () => {
    clearAuthToken();
    setTokenState(null);
    setUser(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}


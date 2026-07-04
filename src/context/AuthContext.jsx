import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { loginUser, registerUser } from '../api/auth';
import { getToken, setToken, clearToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => getToken());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Keep in sync if another tab logs out.
    function onStorage() {
      setTokenState(getToken());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const res = await loginUser(email, password);
      setToken(res.access_token);
      setTokenState(res.access_token);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      await registerUser(email, password);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
  }, []);

  const value = useMemo(
    () => ({
      isAuthenticated: Boolean(token),
      loading,
      error,
      setError,
      login,
      register,
      logout,
    }),
    [token, loading, error, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

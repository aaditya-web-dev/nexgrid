import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api';
import { getAccessToken, setTokens, clearTokens } from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCurrentUser = async () => {
    try {
      if (getAccessToken()) {
        const res = await authApi.getMe();
        setUser(res.data);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Failed to fetch user profile:', err);
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const login = async (username, password) => {
    const res = await authApi.login({ username, password });
    const { access_token, refresh_token } = res.data;
    setTokens(access_token, refresh_token);
    const profileRes = await authApi.getMe();
    setUser(profileRes.data);
    return profileRes.data;
  };

  const register = async ({ username, email, full_name, password }) => {
    const res = await authApi.register({ username, email, full_name, password });
    // After register, auto login
    return login(username, password);
  };

  const logout = () => {
    clearTokens();
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshProfile: fetchCurrentUser,
      }}
    >
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

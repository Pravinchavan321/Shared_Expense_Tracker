import React, { createContext, useState, useEffect } from 'react';
import { getMe } from '../services/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  // Initialize and check token validity on mount
  useEffect(() => {
    const checkAuth = async () => {
      if (token) {
        try {
          const res = await getMe();
          setUser(res.user);
        } catch (err) {
          console.error('Session expired or invalid token');
          localStorage.removeItem('token');
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, [token]);

  // Performs user login and updates storage + state
  const handleLogin = (jwtToken, userObj) => {
    localStorage.setItem('token', jwtToken);
    setToken(jwtToken);
    setUser(userObj);
  };

  // Performs user logout and resets auth state
  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login: handleLogin, logout: handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
};

import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  login: () => {},
  logout: () => {},
  isAdmin: false
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('textile_auth_token');
    const savedUser = localStorage.getItem('textile_auth_user');

    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        // Verify with server in background
        api.get('/auth/me')
          .then(res => {
            setUser(res.data);
            localStorage.setItem('textile_auth_user', JSON.stringify(res.data));
          })
          .catch(() => {
            // Token expired or invalid
            localStorage.removeItem('textile_auth_token');
            localStorage.removeItem('textile_auth_user');
            setToken(null);
            setUser(null);
          })
          .finally(() => setLoading(false));
      } catch (err) {
        localStorage.removeItem('textile_auth_token');
        localStorage.removeItem('textile_auth_user');
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('textile_auth_token', newToken);
    localStorage.setItem('textile_auth_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('textile_auth_token');
    localStorage.removeItem('textile_auth_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        isAdmin: user?.role === 'admin'
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);


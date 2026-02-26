import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [totpRequired, setTotpRequired] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUser = async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
      setTotpRequired(false);
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.detail?.includes('TOTP')) {
        setTotpRequired(true);
      } else {
        localStorage.clear();
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('access_token', res.data.access_token);
    localStorage.setItem('refresh_token', res.data.refresh_token);
    if (res.data.totp_required) {
      setTotpRequired(true);
      return { totpRequired: true };
    }
    await fetchUser();
    return { totpRequired: false };
  };

  const verifyTotp = async (token) => {
    const res = await api.post('/auth/verify-totp', { token });
    localStorage.setItem('access_token', res.data.access_token);
    localStorage.setItem('refresh_token', res.data.refresh_token);
    setTotpRequired(false);
    await fetchUser();
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
    setTotpRequired(false);
  };

  const register = async (data) => {
    const res = await api.post('/auth/register', data);
    return res.data; // { totp_secret, qr_code_base64, message }
  };

  return (
    <AuthContext.Provider value={{
      user, loading, totpRequired,
      login, logout, register, verifyTotp, fetchUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

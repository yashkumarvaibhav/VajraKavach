import { createContext, useContext, useState, useEffect, useRef } from 'react';
import api from '../services/api';
import {
  generateRsaKeyPairPem,
  storeLocalE2EEKeyPair,
  loadLocalE2EEKeyPair,
  getSessionE2EEKeyPair,
  setSessionE2EEKeyPair,
  clearSessionE2EEKeyPair,
} from '../utils/e2eeKeyStore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState(null);
  const [showKeyImportPrompt, setShowKeyImportPrompt] = useState(false);
  const pendingLoginRef = useRef(null);

  useEffect(() => {
    fetchUser();
  }, []);

  const clearClientSession = (emailToClear = user?.email) => {
    if (emailToClear) {
      clearSessionE2EEKeyPair(emailToClear);
    }
    setUser(null);
    setTotpRequired(false);
    setTotpSetupData(null);
    pendingLoginRef.current = null;
  };

  const ensureLocalE2EEKeyPair = async (userData, password) => {
    if (!userData?.email || !password) {
      return null;
    }

    const sessionKeyPair = getSessionE2EEKeyPair(userData.email);
    if (sessionKeyPair?.privateKeyPem) {
      return sessionKeyPair;
    }

    const statusRes = await api.get('/users/me/e2ee-key/status');
    const keyStatus = statusRes.data;
    const storedKeyPair = await loadLocalE2EEKeyPair(userData.email, password).catch(() => null);

    if (storedKeyPair?.privateKeyPem) {
      setSessionE2EEKeyPair(userData.email, storedKeyPair);
      if (!keyStatus.public_key && storedKeyPair.publicKeyPem) {
        await api.put('/users/me/e2ee-key', { public_key: storedKeyPair.publicKeyPem });
      }
      return storedKeyPair;
    }

    if (keyStatus.has_server_private_key) {
      const migrationRes = await api.post('/users/me/e2ee-key/migrate');
      const migratedPrivateKey = migrationRes.data?.private_key;
      const migratedPublicKey = migrationRes.data?.public_key || keyStatus.public_key;

      if (migratedPrivateKey && migratedPublicKey) {
        const migratedKeyPair = {
          publicKeyPem: migratedPublicKey,
          privateKeyPem: migratedPrivateKey,
        };
        await storeLocalE2EEKeyPair(userData.email, migratedPublicKey, migratedPrivateKey, password);
        setSessionE2EEKeyPair(userData.email, migratedKeyPair);
        return migratedKeyPair;
      }
    }

    const generatedKeyPair = await generateRsaKeyPairPem();
    await api.put('/users/me/e2ee-key', { public_key: generatedKeyPair.publicKeyPem });
    await storeLocalE2EEKeyPair(
      userData.email,
      generatedKeyPair.publicKeyPem,
      generatedKeyPair.privateKeyPem,
      password
    );
    setSessionE2EEKeyPair(userData.email, generatedKeyPair);

    // If server already had a public key, it means keys existed on another device.
    // Show import prompt so user can import their existing key instead.
    if (keyStatus.public_key) {
      setShowKeyImportPrompt(true);
    }

    return generatedKeyPair;
  };

  const fetchUser = async () => {
    setLoading(true);
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
      setTotpRequired(false);
      return res.data;
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.detail?.includes('TOTP')) {
        setTotpRequired(true);
      } else {
        clearClientSession();
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    pendingLoginRef.current = { email, password };
    const res = await api.post('/auth/login', { email, password });
    if (res.data.totp_required) {
      setTotpRequired(true);
      // Pass QR setup data if this is first-time TOTP setup
      const setupData = res.data.totp_setup_required ? {
        totp_secret: res.data.totp_secret,
        qr_code_base64: res.data.qr_code_base64,
      } : null;
      setTotpSetupData(setupData);
      return { totpRequired: true, totpSetupData: setupData };
    }
    const userData = await fetchUser();
    if (userData) {
      await ensureLocalE2EEKeyPair(userData, password);
    }
    pendingLoginRef.current = null;
    return { totpRequired: false };
  };

  const verifyTotp = async (token) => {
    await api.post('/auth/verify-totp', { token });
    setTotpRequired(false);
    setTotpSetupData(null);
    const userData = await fetchUser();
    const pendingLogin = pendingLoginRef.current;
    if (userData && pendingLogin?.password) {
      try {
        await ensureLocalE2EEKeyPair(userData, pendingLogin.password);
      } catch (err) {
        console.warn('Failed to initialize local E2EE keys:', err);
      }
    }
    pendingLoginRef.current = null;
  };

  const logout = async ({ skipRequest = false } = {}) => {
    const emailToClear = user?.email || pendingLoginRef.current?.email;
    try {
      if (!skipRequest) {
        await api.post('/auth/logout');
      }
    } catch (err) {
      console.warn('Logout request failed:', err);
    } finally {
      clearClientSession(emailToClear);
    }
  };

  const register = async (data) => {
    const res = await api.post('/auth/register', data);
    return res.data; // { totp_secret, qr_code_base64, message }
  };

  return (
    <AuthContext.Provider value={{
      user, loading, totpRequired, totpSetupData,
      login, logout, register, verifyTotp, fetchUser,
      showKeyImportPrompt, dismissKeyImportPrompt: () => setShowKeyImportPrompt(false),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

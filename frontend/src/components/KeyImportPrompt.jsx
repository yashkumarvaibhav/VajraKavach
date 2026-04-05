import { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { importKeyPairFromFile } from '../utils/e2eeKeyStore';
import { AlertTriangle, Upload, X, KeyRound, Check } from 'lucide-react';
import api from '../services/api';

/**
 * Auto-prompt modal that appears when user logs in on a new device
 * and a new keypair was generated (replacing the old one).
 * Offers the option to import the existing key from a .vkkey file.
 */
export default function KeyImportPrompt() {
  const { user, showKeyImportPrompt, dismissKeyImportPrompt } = useAuth();
  const [password, setPassword] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef(null);

  if (!showKeyImportPrompt || !user) return null;

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!password) {
      setError('Please enter your account password first.');
      return;
    }

    setImporting(true);
    setError('');
    try {
      // Verify password against backend before importing
      try {
        await api.post('/auth/verify-password', { password });
      } catch {
        throw new Error('Incorrect account password.');
      }
      const keyPair = await importKeyPairFromFile(file, user.email, password);
      // Sync the imported public key to server
      try {
        await api.put('/users/me/e2ee-key', { public_key: keyPair.publicKeyPem });
      } catch {
        // Non-critical
      }
      setSuccess(true);
      setTimeout(() => {
        dismissKeyImportPrompt();
        window.location.reload(); // Reload to pick up imported keys everywhere
      }, 1500);
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 text-center">
          <Check className="h-12 w-12 text-green-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Key Imported!</h3>
          <p className="text-sm text-gray-500">Your encryption key has been restored. Reloading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-amber-500" />
            <h3 className="text-lg font-semibold text-gray-900">New Device Detected</h3>
          </div>
          <button onClick={dismissKeyImportPrompt} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 mb-4 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            A new encryption key was generated for this device. Your previous messages
            can only be decrypted with your original key.
          </span>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          If you exported your key from another device, import it now to continue
          decrypting your existing messages. Otherwise, dismiss this to use the new key.
        </p>

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your account password"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none mb-4"
        />

        <input
          ref={fileInputRef}
          type="file"
          accept=".vkkey,application/json"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex gap-2">
          <button
            onClick={dismissKeyImportPrompt}
            className="flex-1 py-2.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
          >
            Skip (use new key)
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!password || importing}
            className="flex-1 py-2.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50 font-medium inline-flex items-center justify-center gap-2"
          >
            <Upload className="h-4 w-4" />
            {importing ? 'Importing...' : 'Import .vkkey File'}
          </button>
        </div>
      </div>
    </div>
  );
}

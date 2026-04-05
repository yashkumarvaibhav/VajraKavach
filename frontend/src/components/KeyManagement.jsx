import { useState, useRef } from 'react';
import { Download, Upload, Shield, AlertTriangle, Check, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  exportKeyPairToFile,
  importKeyPairFromFile,
  getSessionE2EEKeyPair,
  setSessionE2EEKeyPair,
} from '../utils/e2eeKeyStore';
import api from '../services/api';

/**
 * Reusable key management component.
 * - If keys are available: shows Export button
 * - If keys are unavailable: shows Import button
 * - Can be used as inline banner or full settings section
 * 
 * Props:
 *   variant: 'banner' | 'section' (default: 'section')
 *   onKeysImported: callback when keys are successfully imported
 */
export default function KeyManagement({ variant = 'section', onKeysImported }) {
  const { user } = useAuth();
  const [importing, setImporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [password, setPassword] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const fileInputRef = useRef(null);

  const hasKeys = !!getSessionE2EEKeyPair(user?.email)?.privateKeyPem;

  const handleExport = () => {
    try {
      exportKeyPairToFile(user.email);
      setExportDone(true);
      setTimeout(() => setExportDone(false), 3000);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected
    e.target.value = '';
    setPendingFile(file);
    setShowPasswordPrompt(true);
    setImportError('');
    setPassword('');
  };

  const handleImportConfirm = async () => {
    if (!pendingFile || !password) return;
    setImporting(true);
    setImportError('');
    try {
      // Verify password against backend before importing
      try {
        await api.post('/auth/verify-password', { password });
      } catch {
        throw new Error('Incorrect account password.');
      }
      const keyPair = await importKeyPairFromFile(pendingFile, user.email, password);

      // Sync public key to server if changed
      try {
        await api.put('/users/me/e2ee-key', { public_key: keyPair.publicKeyPem });
      } catch {
        // Non-critical — key may already match
      }

      setImportSuccess(true);
      setShowPasswordPrompt(false);
      setPendingFile(null);
      setPassword('');
      setTimeout(() => setImportSuccess(false), 3000);
      onKeysImported?.(keyPair);
    } catch (err) {
      setImportError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const cancelImport = () => {
    setShowPasswordPrompt(false);
    setPendingFile(null);
    setPassword('');
    setImportError('');
  };

  // Hidden file input
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".vkkey,application/json"
      onChange={handleFileSelect}
      className="hidden"
    />
  );

  // Password prompt modal
  const passwordModal = showPasswordPrompt && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Import Encryption Key</h3>
          <button onClick={cancelImport} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Enter your account password to securely store the imported key on this device.
        </p>
        {importError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {importError}
          </div>
        )}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your account password"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none mb-4"
          onKeyDown={(e) => e.key === 'Enter' && handleImportConfirm()}
          autoFocus
        />
        <div className="flex gap-2">
          <button onClick={cancelImport}
            className="flex-1 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">
            Cancel
          </button>
          <button onClick={handleImportConfirm}
            disabled={!password || importing}
            className="flex-1 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50">
            {importing ? 'Importing...' : 'Import Key'}
          </button>
        </div>
      </div>
    </div>
  );

  // ---------- Banner variant (compact, for MessagesPage) ----------
  if (variant === 'banner') {
    if (importSuccess) {
      return (
        <>
          {fileInput}
          {passwordModal}
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
            <Check className="h-4 w-4 flex-shrink-0" />
            Encryption key imported successfully! You can now decrypt messages.
          </div>
        </>
      );
    }

    if (!hasKeys) {
      return (
        <>
          {fileInput}
          {passwordModal}
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p>Your E2EE private key is not available on this device. Messages cannot be decrypted.</p>
                <p className="mt-1">
                  <button onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-amber-900 font-medium underline hover:text-amber-950">
                    <Upload className="h-3.5 w-3.5" /> Import key from file
                  </button>
                  <span className="mx-2 text-amber-400">or</span>
                  sign in again on the device where your key was created.
                </p>
              </div>
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        {fileInput}
        {passwordModal}
      </>
    );
  }

  // ---------- Section variant (full, for ProfilePage) ----------
  return (
    <>
      {fileInput}
      {passwordModal}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-gray-900">Encryption Keys</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Your end-to-end encryption private key is stored only in this browser.
          Export it to use on another device, or import a previously exported key.
        </p>

        {importSuccess && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 flex items-center gap-2">
            <Check className="h-4 w-4" /> Key imported successfully!
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExport}
            disabled={!hasKeys}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition
              disabled:opacity-40 disabled:cursor-not-allowed
              border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100"
          >
            {exportDone ? <Check className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            {exportDone ? 'Exported!' : 'Export Key'}
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition
              border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
          >
            <Upload className="h-4 w-4" />
            Import Key
          </button>
        </div>

        {!hasKeys && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>No private key on this device. Import from another device or sign in again to generate a new one.</span>
          </div>
        )}

        {hasKeys && (
          <p className="mt-3 text-xs text-gray-400">
            Keep your exported .vkkey file safe — anyone with it can decrypt your messages.
          </p>
        )}
      </div>
    </>
  );
}

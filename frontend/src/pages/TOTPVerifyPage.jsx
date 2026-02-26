import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Key, QrCode } from 'lucide-react';
import VirtualKeyboard from '../components/VirtualKeyboard';

export default function TOTPVerifyPage() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [useVirtualKb, setUseVirtualKb] = useState(true);
  const { verifyTotp, totpSetupData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Get setup data from navigation state or context
  const setupData = location.state?.totpSetupData || totpSetupData;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await verifyTotp(token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid TOTP token.');
    } finally {
      setLoading(false);
    }
  };

  const handleVirtualKeyPress = (digit) => {
    if (token.length < 6) {
      setToken(token + digit);
    }
  };

  const handleVirtualBackspace = () => {
    setToken(token.slice(0, -1));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-primary-900 py-12 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <Key className="h-12 w-12 text-primary-600 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">
            {setupData ? 'Set Up Authenticator' : 'TOTP Verification'}
          </h1>
          <p className="text-gray-500 mt-1">
            {setupData
              ? 'Scan the QR code below with your authenticator app (e.g. Google Authenticator), then enter the 6-digit code.'
              : 'Enter the 6-digit code from your authenticator app'}
          </p>
        </div>

        {setupData && setupData.qr_code_base64 && (
          <div className="mb-6 flex flex-col items-center">
            <div className="bg-white p-3 rounded-xl border-2 border-primary-200 shadow-sm">
              <img
                src={`data:image/png;base64,${setupData.qr_code_base64}`}
                alt="TOTP QR Code"
                className="w-48 h-48"
              />
            </div>
            {setupData.totp_secret && (
              <div className="mt-3 text-center">
                <p className="text-xs text-gray-400">Manual entry key:</p>
                <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono text-gray-700 select-all">
                  {setupData.totp_secret}
                </code>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex justify-center">
            <div className="flex space-x-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`w-12 h-14 flex items-center justify-center text-2xl font-bold border-2 rounded-lg ${
                    token[i] ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-300 text-gray-400'
                  }`}
                >
                  {token[i] || '·'}
                </div>
              ))}
            </div>
          </div>

          {!useVirtualKb && (
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-center text-lg tracking-widest"
              placeholder="000000"
              autoFocus
            />
          )}

          {useVirtualKb && (
            <VirtualKeyboard
              onKeyPress={handleVirtualKeyPress}
              onBackspace={handleVirtualBackspace}
              onClear={() => setToken('')}
            />
          )}

          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => setUseVirtualKb(!useVirtualKb)}
              className="text-xs text-gray-500 hover:text-primary-600 underline"
            >
              {useVirtualKb ? 'Use physical keyboard' : 'Use virtual keyboard'}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || token.length !== 6}
            className="w-full bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>
      </div>
    </div>
  );
}

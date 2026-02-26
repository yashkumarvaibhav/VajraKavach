import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import VirtualKeyboard from '../components/VirtualKeyboard';
import { Shield, Lock, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';

function PasswordStrength({ password }) {
  const checks = [
    { label: '8-16 characters', pass: password.length >= 8 && password.length <= 16 },
    { label: 'Uppercase letter', pass: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', pass: /[a-z]/.test(password) },
    { label: 'Number', pass: /\d/.test(password) },
    { label: 'Special character', pass: /[!@#$%^&*()_+\-=\[\]{};:'"\\|,.<>\/?]/.test(password) },
  ];
  const passed = checks.filter(c => c.pass).length;

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= passed ? (passed <= 2 ? 'bg-red-400' : passed <= 4 ? 'bg-yellow-400' : 'bg-green-400') : 'bg-gray-200'}`} />
        ))}
      </div>
      {checks.map((c, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs">
          {c.pass ? <CheckCircle className="h-3 w-3 text-green-500" /> : <AlertCircle className="h-3 w-3 text-gray-300" />}
          <span className={c.pass ? 'text-green-700' : 'text-gray-400'}>{c.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function SecurityPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8 || newPassword.length > 16) {
      setError('Password must be 8-16 characters');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
        totp_token: totpToken,
      });
      setMessage('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTotpToken('');
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        setError(detail.map(d => d.msg || d).join('; '));
      } else {
        setError(detail || 'Failed to change password');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center space-x-3 mb-8">
        <Shield className="h-8 w-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">Security Settings</h1>
      </div>

      {/* Security Status */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-6 mb-8 text-white">
        <h2 className="text-lg font-semibold mb-3">Security Status</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            <span className="text-sm">TOTP Active</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            <span className="text-sm">E2E Encryption</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            <span className="text-sm">PKI Verified</span>
          </div>
        </div>
      </div>

      {message && <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm flex items-center gap-2"><CheckCircle className="h-4 w-4" />{message}</div>}
      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      {/* Change Password */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center space-x-2 mb-6">
          <Lock className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                maxLength={128}
                className={inputClass}
                placeholder="Enter current password"
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required minLength={8} maxLength={16}
                className={inputClass}
                placeholder="8-16 characters, mixed case + special"
              />
              <button type="button" onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <PasswordStrength password={newPassword} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              maxLength={128}
              className={inputClass}
              placeholder="Re-enter new password"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">TOTP Verification (required for password change)</label>
            <VirtualKeyboard value={totpToken} onChange={setTotpToken} maxLength={6} />
          </div>

          <button
            type="submit"
            disabled={loading || totpToken.length !== 6 || !currentPassword || !newPassword || newPassword !== confirmPassword}
            className="w-full bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition disabled:opacity-50"
          >
            {loading ? 'Changing Password...' : 'Change Password'}
          </button>
        </form>
      </div>

      {/* Account Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">Email:</span> <span className="font-medium">{user?.email}</span></div>
          <div><span className="text-gray-500">Role:</span> <span className="font-medium uppercase">{user?.role}</span></div>
          <div><span className="text-gray-500">TOTP:</span> <span className="font-medium text-green-600">Verified</span></div>
          <div><span className="text-gray-500">Status:</span> <span className="font-medium text-green-600">Active</span></div>
        </div>
      </div>
    </div>
  );
}

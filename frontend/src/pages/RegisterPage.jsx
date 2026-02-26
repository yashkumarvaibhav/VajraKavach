import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Shield, UserPlus, CheckCircle, XCircle } from 'lucide-react';
import VirtualKeyboard from '../components/VirtualKeyboard';
import api from '../services/api';

const COUNTRY_CODES = [
  { code: '+91', label: 'IN +91' },
  { code: '+1', label: 'US +1' },
  { code: '+44', label: 'UK +44' },
  { code: '+61', label: 'AU +61' },
  { code: '+49', label: 'DE +49' },
  { code: '+33', label: 'FR +33' },
  { code: '+81', label: 'JP +81' },
  { code: '+86', label: 'CN +86' },
  { code: '+971', label: 'AE +971' },
  { code: '+65', label: 'SG +65' },
];

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
          {c.pass ? <CheckCircle className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-gray-300" />}
          <span className={c.pass ? 'text-green-700' : 'text-gray-400'}>{c.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function RegisterPage() {
  const [form, setForm] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    role: 'user',
  });
  const [countryCode, setCountryCode] = useState('+91');
  const [totpSetup, setTotpSetup] = useState(null);
  const [verifyToken, setVerifyToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const submitData = {
        ...form,
        phone: form.phone ? `${countryCode}${form.phone.replace(/[\s\-]/g, '')}` : null,
      };
      const data = await register(submitData);
      setTotpSetup(data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        setError(detail.map(d => d.msg || d).join('; '));
      } else {
        setError(detail || 'Registration failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyTotp = async () => {
    setVerifying(true);
    setError('');
    try {
      await api.post('/auth/setup-verify', { email: form.email, token: verifyToken });
      setVerified(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Verification failed. Check your code.');
    } finally {
      setVerifying(false);
    }
  };

  if (totpSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-primary-900 py-12 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <Shield className="h-12 w-12 text-green-600 mx-auto mb-3" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Created!</h2>
          <p className="text-gray-600 mb-6">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>

          <div className="bg-gray-50 p-4 rounded-lg mb-4">
            <img
              src={`data:image/png;base64,${totpSetup.qr_code_base64}`}
              alt="TOTP QR Code"
              className="mx-auto"
              style={{ width: 200, height: 200 }}
            />
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-yellow-800">
              <strong>Backup key:</strong> {totpSetup.totp_secret}
            </p>
            <p className="text-xs text-yellow-600 mt-1">Save this key securely.</p>
          </div>

          {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>}

          {!verified ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 font-medium">Enter the 6-digit code from your authenticator to verify:</p>
              <VirtualKeyboard value={verifyToken} onChange={setVerifyToken} maxLength={6} />
              <button
                onClick={handleVerifyTotp}
                disabled={verifyToken.length !== 6 || verifying}
                className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
              >
                {verifying ? 'Verifying...' : 'Verify & Continue'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <CheckCircle className="h-5 w-5 text-green-600 mx-auto mb-1" />
                <p className="text-sm text-green-700 font-medium">TOTP verified successfully!</p>
              </div>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition"
              >
                Proceed to Login
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-primary-900 py-12 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <UserPlus className="h-12 w-12 text-primary-600 mx-auto mb-3" />
          <h1 className="text-3xl font-bold text-gray-900">Create Account</h1>
          <p className="text-gray-500 mt-1">Join VajraKavach</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text" name="full_name" value={form.full_name} onChange={handleChange}
              required className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email" name="email" value={form.email} onChange={handleChange}
              required className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password" name="password" value={form.password} onChange={handleChange}
              required minLength={8} maxLength={16}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              placeholder="8-16 characters, mixed case + special"
            />
            <PasswordStrength password={form.password} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
            <div className="flex gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="w-28 px-2 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm"
              >
                {COUNTRY_CODES.map(cc => (
                  <option key={cc.code} value={cc.code}>{cc.label}</option>
                ))}
              </select>
              <input
                type="tel" name="phone" value={form.phone} onChange={handleChange}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                placeholder="9876543210"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              name="role" value={form.role} onChange={handleChange}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            >
              <option value="user">Job Seeker</option>
              <option value="recruiter">Recruiter</option>
            </select>
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition disabled:opacity-50"
          >
            {loading ? 'Creating Account...' : 'Register'}
          </button>
        </form>

        <p className="text-center mt-6 text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">Sign In</Link>
        </p>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import VirtualKeyboard from '../components/VirtualKeyboard';
import { FileText, Upload, Download, Trash2, Shield, X, CheckCircle } from 'lucide-react';
import { toISTDate } from '../utils/time';

export default function ResumePage() {
  const { user } = useAuth();
  const [resume, setResume] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showTotpModal, setShowTotpModal] = useState(false);
  const [totpToken, setTotpToken] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchResume();
  }, []);

  const fetchResume = async () => {
    try {
      const res = await api.get('/resumes/my');
      const resumes = res.data || [];
      setResume(resumes.length > 0 ? resumes[0] : null);
    } catch (err) {
      if (err.response?.status !== 404) console.error('Resume fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const uploadResume = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Max 10MB.');
      return;
    }

    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowed.includes(file.type)) {
      setError('Only PDF and DOCX files are allowed.');
      return;
    }

    setUploading(true);
    setError('');
    try {
      // If replacing an existing resume, delete the old one first
      if (resume?.id) {
        const totpCode = prompt('Enter your TOTP code to replace the existing resume:');
        if (!totpCode) { setUploading(false); return; }
        try {
          await api.delete(`/resumes/${resume.id}`, { headers: { 'X-TOTP-Token': totpCode } });
        } catch (delErr) {
          setError(delErr.response?.data?.detail || 'Failed to remove old resume. Check your TOTP code.');
          setUploading(false);
          return;
        }
      }
      const formData = new FormData();
      formData.append('file', file);
      await api.post('/resumes/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessage('Resume uploaded successfully!');
      fetchResume();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadClick = () => {
    setShowTotpModal(true);
    setTotpToken('');
    setError('');
  };

  const downloadResume = async () => {
    setDownloading(true);
    setError('');
    try {
      const res = await api.get(`/resumes/${resume.id}/download`, {
        responseType: 'blob',
        headers: { 'X-TOTP-Token': totpToken },
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = resume.original_filename || 'resume';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setShowTotpModal(false);
      setMessage('Resume downloaded!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        setError('Invalid TOTP code. Please try again.');
        setTotpToken('');
      } else {
        setError(err.response?.data?.detail || 'Download failed');
      }
    } finally {
      setDownloading(false);
    }
  };

  const deleteResume = async () => {
    const token = prompt('This is a sensitive operation.\nEnter your TOTP code to confirm resume deletion:');
    if (!token) return;
    if (!confirm('Are you sure you want to permanently delete your resume? This cannot be undone.')) return;
    try {
      await api.delete(`/resumes/${resume.id}`, { headers: { 'X-TOTP-Token': token } });
      setResume(null);
      setMessage('Resume deleted.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Delete failed. Check your TOTP code.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center space-x-3 mb-6">
        <FileText className="h-8 w-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">Resume</h1>
      </div>

      {/* Security Banner */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-4 mb-6 text-white flex items-center gap-3">
        <Shield className="h-6 w-6 flex-shrink-0" />
        <div>
          <p className="font-medium text-sm">Encrypted Resume Storage</p>
          <p className="text-xs text-primary-200">Your resume is encrypted at rest and requires TOTP verification to download</p>
        </div>
      </div>

      {message && <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm flex items-center gap-2"><CheckCircle className="h-4 w-4" />{message}</div>}
      {error && !showTotpModal && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : resume ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-primary-50 flex items-center justify-center">
                <FileText className="h-6 w-6 text-primary-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{resume.original_filename}</p>
                <p className="text-xs text-gray-400">
                  Uploaded {toISTDate(resume.uploaded_at || resume.created_at)}
                  {resume.file_size && ` • ${(resume.file_size / 1024).toFixed(0)} KB`}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={handleDownloadClick}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition">
              <Download className="h-4 w-4" /> Download (TOTP Required)
            </button>
            <button onClick={deleteResume}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-100 text-red-700 text-sm rounded-lg hover:bg-red-200 transition">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>

          {/* Upload New */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-primary-600 transition">
              <Upload className="h-4 w-4" /> Replace with new resume
              <input type="file" className="hidden" onChange={uploadResume} accept=".pdf,.docx" disabled={uploading} />
            </label>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Resume Uploaded</h3>
          <p className="text-sm text-gray-500 mb-6">Upload your resume to apply for jobs. It will be encrypted and stored securely.</p>
          <label className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg cursor-pointer hover:bg-primary-700 transition">
            <Upload className="h-5 w-5" />
            {uploading ? 'Uploading...' : 'Upload Resume'}
            <input type="file" className="hidden" onChange={uploadResume} accept=".pdf,.docx" disabled={uploading} />
          </label>
          <p className="text-xs text-gray-400 mt-3">PDF or DOCX • Max 10MB</p>
        </div>
      )}

      {/* TOTP Verification Modal */}
      {showTotpModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 text-center">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">TOTP Verification Required</h3>
              <button onClick={() => { setShowTotpModal(false); setError(''); }}
                className="p-1 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Enter your 6-digit authenticator code to download your resume</p>
            {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>}
            <VirtualKeyboard value={totpToken} onChange={setTotpToken} maxLength={6} />
            <button onClick={downloadResume} disabled={totpToken.length !== 6 || downloading}
              className="w-full mt-4 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition disabled:opacity-50">
              {downloading ? 'Downloading...' : 'Verify & Download'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

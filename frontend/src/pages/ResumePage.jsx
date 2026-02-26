import { useState, useEffect } from 'react';
import api from '../services/api';
import { FileText, Upload, Download, Trash2, CheckCircle, Shield } from 'lucide-react';

export default function ResumePage() {
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchResumes();
  }, []);

  const fetchResumes = async () => {
    try {
      const res = await api.get('/resumes/my');
      setResumes(res.data);
    } catch (err) {
      setError('Failed to load resumes');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    setMessage('');
    setError('');

    try {
      await api.post('/resumes/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessage('Resume uploaded and encrypted successfully!');
      fetchResumes();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to upload resume');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (resumeId, filename) => {
    try {
      const res = await api.get(`/resumes/${resumeId}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError('Failed to download resume');
    }
  };

  const handleVerify = async (resumeId) => {
    try {
      const res = await api.get(`/resumes/${resumeId}/verify-integrity`);
      if (res.data.verified) {
        setMessage(`Resume integrity verified! Hash: ${res.data.file_hash.substring(0, 16)}...`);
      } else {
        setError(res.data.message);
      }
    } catch (err) {
      setError('Failed to verify resume integrity');
    }
  };

  const handleDelete = async (resumeId) => {
    if (!confirm('Are you sure you want to delete this resume?')) return;
    try {
      await api.delete(`/resumes/${resumeId}`);
      setMessage('Resume deleted');
      fetchResumes();
    } catch (err) {
      setError('Failed to delete resume');
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-3">
          <FileText className="h-8 w-8 text-primary-600" />
          <h1 className="text-3xl font-bold text-gray-900">My Resumes</h1>
        </div>

        <label className="flex items-center space-x-2 bg-primary-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-primary-700 transition cursor-pointer">
          <Upload className="h-4 w-4" />
          <span>{uploading ? 'Uploading...' : 'Upload Resume'}</span>
          <input type="file" accept=".pdf,.docx" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>

      {message && <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm">{message}</div>}
      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>}

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6 text-sm text-yellow-800">
        <Shield className="inline h-4 w-4 mr-1" />
        All resumes are encrypted at rest using AES-128 (Fernet). Digital signatures verify integrity via PKI.
      </div>

      {resumes.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No resumes uploaded yet</p>
          <p className="text-gray-400 text-sm mt-1">Upload a PDF or DOCX file to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {resumes.map((resume) => (
            <div key={resume.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-primary-50 p-3 rounded-lg">
                  <FileText className="h-6 w-6 text-primary-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">{resume.original_filename}</h3>
                  <div className="flex items-center space-x-3 mt-1 text-xs text-gray-500">
                    <span>{resume.file_size ? `${(parseInt(resume.file_size) / 1024).toFixed(1)} KB` : ''}</span>
                    <span>{resume.mime_type}</span>
                    <span>{new Date(resume.uploaded_at).toLocaleDateString()}</span>
                    {resume.has_signature && (
                      <span className="flex items-center text-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        PKI Signed
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button onClick={() => handleVerify(resume.id)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Verify integrity">
                  <Shield className="h-4 w-4" />
                </button>
                <button onClick={() => handleDownload(resume.id, resume.original_filename)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition" title="Download">
                  <Download className="h-4 w-4" />
                </button>
                <button onClick={() => handleDelete(resume.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition" title="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

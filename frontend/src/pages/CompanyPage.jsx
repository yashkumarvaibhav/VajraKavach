import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Building2, Plus, Edit, Trash2, Globe, MapPin, Briefcase, X } from 'lucide-react';

export default function CompanyPage() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', location: '', website: '' });

  // Job posting state
  const [showJobForm, setShowJobForm] = useState(false);
  const [jobCompanyId, setJobCompanyId] = useState(null);
  const [jobForm, setJobForm] = useState({
    title: '', description: '', location: '', location_type: 'onsite',
    job_type: 'full_time', salary_min: '', salary_max: '', required_skills: '',
    application_deadline: '',
  });
  const [companyJobs, setCompanyJobs] = useState({});

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const res = await api.get('/companies/');
      setCompanies(res.data);
    } catch (err) {
      setError('Failed to load companies');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitCompany = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/companies/${editingId}`, form);
        setMessage('Company updated successfully');
      } else {
        await api.post('/companies/', form);
        setMessage('Company created successfully');
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ name: '', description: '', location: '', website: '' });
      fetchCompanies();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save company');
      setTimeout(() => setError(''), 3000);
    }
  };

  const editCompany = (c) => {
    setForm({ name: c.name, description: c.description || '', location: c.location || '', website: c.website || '' });
    setEditingId(c.id);
    setShowForm(true);
  };

  const deleteCompany = async (id) => {
    if (!confirm('Delete this company and all its jobs?')) return;
    try {
      await api.delete(`/companies/${id}`);
      setMessage('Company deleted');
      fetchCompanies();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handlePostJob = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...jobForm,
        company_id: jobCompanyId,
        required_skills: jobForm.required_skills ? jobForm.required_skills.split(',').map(s => s.trim()).filter(Boolean) : [],
        application_deadline: jobForm.application_deadline || null,
        salary_min: jobForm.salary_min || null,
        salary_max: jobForm.salary_max || null,
      };
      await api.post('/jobs/', payload);
      setMessage('Job posted successfully!');
      setShowJobForm(false);
      setJobForm({ title: '', description: '', location: '', location_type: 'onsite', job_type: 'full_time', salary_min: '', salary_max: '', required_skills: '', application_deadline: '' });
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to post job');
      setTimeout(() => setError(''), 3000);
    }
  };

  const isRecruiterOrAdmin = user?.role === 'recruiter' || user?.role === 'admin';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Building2 className="h-8 w-8 text-primary-600" />
          <h1 className="text-3xl font-bold text-gray-900">Companies</h1>
        </div>
        {isRecruiterOrAdmin && (
          <button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: '', description: '', location: '', website: '' }); }}
            className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition">
            <Plus className="h-4 w-4" /> Create Company
          </button>
        )}
      </div>

      {message && <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm">{message}</div>}
      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>}

      {/* Company Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">{editingId ? 'Edit Company' : 'Create Company'}</h3>
            <button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-gray-400" /></button>
          </div>
          <form onSubmit={handleSubmitCompany} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input type="text" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="City, Country" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
              <input type="url" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="https://..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none" />
            </div>
            <button type="submit" className="bg-primary-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition">
              {editingId ? 'Update' : 'Create'}
            </button>
          </form>
        </div>
      )}

      {/* Job Posting Form */}
      {showJobForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowJobForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Post a Job</h3>
              <button onClick={() => setShowJobForm(false)}><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <form onSubmit={handlePostJob} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
                <input type="text" value={jobForm.title} onChange={e => setJobForm({ ...jobForm, title: e.target.value })} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <textarea value={jobForm.description} onChange={e => setJobForm({ ...jobForm, description: e.target.value })} required rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input type="text" value={jobForm.location} onChange={e => setJobForm({ ...jobForm, location: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Work Type</label>
                  <select value={jobForm.location_type} onChange={e => setJobForm({ ...jobForm, location_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                    <option value="onsite">On-site</option>
                    <option value="remote">Remote</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Job Type</label>
                  <select value={jobForm.job_type} onChange={e => setJobForm({ ...jobForm, job_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                    <option value="internship">Internship</option>
                    <option value="contract">Contract</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
                  <input type="date" value={jobForm.application_deadline} onChange={e => setJobForm({ ...jobForm, application_deadline: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Salary</label>
                  <input type="text" value={jobForm.salary_min} onChange={e => setJobForm({ ...jobForm, salary_min: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="e.g., 50000" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Salary</label>
                  <input type="text" value={jobForm.salary_max} onChange={e => setJobForm({ ...jobForm, salary_max: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="e.g., 80000" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Required Skills (comma-separated)</label>
                <input type="text" value={jobForm.required_skills} onChange={e => setJobForm({ ...jobForm, required_skills: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Python, React, PostgreSQL" />
              </div>
              <button type="submit" className="w-full bg-primary-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-700 transition">
                Post Job
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Company List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : companies.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Building2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-medium">No companies yet</p>
          {isRecruiterOrAdmin && <p className="text-sm">Create a company page to start posting jobs</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {companies.map(c => (
            <div key={c.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{c.name}</h3>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                    {c.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {c.location}</span>}
                    {c.website && <a href={c.website} target="_blank" rel="noopener" className="flex items-center gap-1 text-primary-600 hover:underline"><Globe className="h-3 w-3" /> Website</a>}
                  </div>
                </div>
                {c.is_verified && <span className="px-2 py-0.5 text-xs bg-green-50 text-green-700 rounded-full">Verified</span>}
              </div>
              {c.description && <p className="text-sm text-gray-600 mt-3 line-clamp-3">{c.description}</p>}

              {(c.admin_id === user?.id || user?.role === 'admin') && (
                <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                  <button onClick={() => editCompany(c)}
                    className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 px-2 py-1 rounded hover:bg-primary-50 transition">
                    <Edit className="h-3 w-3" /> Edit
                  </button>
                  <button onClick={() => deleteCompany(c.id)}
                    className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition">
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                  <button onClick={() => { setJobCompanyId(c.id); setShowJobForm(true); }}
                    className="flex items-center gap-1 text-xs bg-primary-600 text-white px-3 py-1 rounded hover:bg-primary-700 transition ml-auto">
                    <Briefcase className="h-3 w-3" /> Post Job
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

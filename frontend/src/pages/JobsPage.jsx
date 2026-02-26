import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Briefcase, MapPin, Clock, DollarSign, Search, Building2, Calendar, CheckCircle } from 'lucide-react';

export default function JobsPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [applying, setApplying] = useState(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [selectedResume, setSelectedResume] = useState('');
  const [resumes, setResumes] = useState([]);
  const [appliedJobIds, setAppliedJobIds] = useState(new Set());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isJobSeeker = user?.role === 'user';

  useEffect(() => {
    fetchJobs();
    if (isJobSeeker) {
      fetchResumes();
      fetchMyApplications();
    }
  }, []);

  const fetchJobs = async (q = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.append('keyword', q);
      const res = await api.get(`/jobs/search?${params.toString()}`);
      setJobs(res.data || []);
    } catch (err) {
      console.error('Fetch jobs error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchResumes = async () => {
    try {
      const res = await api.get('/resumes/');
      setResumes(res.data || []);
    } catch (err) {
      console.error('Fetch resumes error:', err);
    }
  };

  const fetchMyApplications = async () => {
    try {
      const res = await api.get('/applications/my');
      const ids = new Set((res.data || []).map(a => a.job_id));
      setAppliedJobIds(ids);
    } catch (err) {
      console.error('Fetch applications error:', err);
    }
  };

  const handleSearch = () => fetchJobs(searchQuery);

  const applyForJob = async (jobId) => {
    setError('');
    try {
      const payload = { job_id: jobId };
      if (coverLetter.trim()) payload.cover_note = coverLetter.trim();
      if (selectedResume) payload.resume_id = selectedResume;
      await api.post('/applications/', payload);
      setApplying(null);
      setCoverLetter('');
      setSelectedResume('');
      setAppliedJobIds(prev => new Set([...prev, jobId]));
      setMessage('Application submitted successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to apply');
    }
  };

  const formatSalary = (job) => {
    const currency = job.salary_currency || 'INR';
    if (job.salary_min && job.salary_max) {
      return `${currency} ${job.salary_min.toLocaleString()} - ${job.salary_max.toLocaleString()}`;
    }
    if (job.salary_min) return `${currency} ${job.salary_min.toLocaleString()}+`;
    if (job.salary_max) return `Up to ${currency} ${job.salary_max.toLocaleString()}`;
    return null;
  };

  const isJobSeeker = user?.role === 'user';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center space-x-3 mb-6">
        <Briefcase className="h-8 w-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">Jobs</h1>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-6">
        <input
          type="text" value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search by title, location, or company..."
          maxLength={100}
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
        />
        <button onClick={handleSearch}
          className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition flex items-center gap-1">
          <Search className="h-4 w-4" /> Search
        </button>
      </div>

      {message && <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm">{message}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading jobs...</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Briefcase className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No jobs found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map(job => (
            <div key={job.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{job.title}</h3>
                  <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                    <Building2 className="h-3.5 w-3.5" />
                    <span>{job.company_name || 'Unknown Company'}</span>
                  </div>
                </div>
                <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                  appliedJobIds.has(job.id) ? 'bg-blue-50 text-blue-700' :
                  job.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {appliedJobIds.has(job.id) ? 'Applied' : job.is_active ? 'Active' : 'Closed'}
                </span>
              </div>

              <p className="text-sm text-gray-600 mt-3 line-clamp-3">{job.description}</p>

              <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-gray-500">
                {job.location && (
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.location}</span>
                )}
                {formatSalary(job) && (
                  <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" />{formatSalary(job)}</span>
                )}
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /><span className="capitalize">{job.job_type}</span></span>
                {job.application_deadline && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Deadline: {new Date(job.application_deadline).toLocaleDateString()}
                  </span>
                )}
              </div>

              {isJobSeeker && job.is_active && !appliedJobIds.has(job.id) && (
                <div className="mt-4">
                  {applying === job.id ? (
                    <div className="space-y-3">
                      {resumes.length > 0 && (
                        <div>
                          <label className="text-sm font-medium text-gray-700 mb-1 block">Select Resume</label>
                          <select value={selectedResume} onChange={(e) => setSelectedResume(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                            <option value="">No resume attached</option>
                            {resumes.map(r => (
                              <option key={r.id} value={r.id}>{r.title || r.filename || 'Resume'}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <textarea
                        value={coverLetter}
                        onChange={(e) => setCoverLetter(e.target.value)}
                        placeholder="Write a cover letter (optional)..."
                        maxLength={2000}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-20 resize-none focus:ring-2 focus:ring-primary-500 outline-none"
                      />
                      {error && <p className="text-sm text-red-600">{error}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => applyForJob(job.id)}
                          className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition">
                          Submit Application
                        </button>
                        <button onClick={() => { setApplying(null); setError(''); setCoverLetter(''); setSelectedResume(''); }}
                          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setApplying(job.id)}
                      className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition">
                      Apply Now
                    </button>
                  )}
                </div>
              )}
              {isJobSeeker && appliedJobIds.has(job.id) && (
                <div className="mt-4 flex items-center gap-2 text-sm text-blue-700">
                  <CheckCircle className="h-4 w-4" /> You have applied to this job
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

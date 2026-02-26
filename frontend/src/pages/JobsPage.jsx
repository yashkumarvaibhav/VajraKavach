import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Search, MapPin, Briefcase, Clock, Filter, ChevronDown, ChevronUp, Building2, DollarSign, Send } from 'lucide-react';

export default function JobsPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [myApplications, setMyApplications] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [applyModal, setApplyModal] = useState(null);
  const [coverNote, setCoverNote] = useState('');
  const [selectedResume, setSelectedResume] = useState('');

  const [filters, setFilters] = useState({
    keyword: '',
    company: '',
    location: '',
    location_type: '',
    job_type: '',
  });

  useEffect(() => {
    fetchJobs();
    fetchMyApplications();
    fetchResumes();
  }, []);

  const fetchJobs = async (params = {}) => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      Object.entries({ ...filters, ...params }).forEach(([k, v]) => { if (v) query.set(k, v); });
      const res = await api.get(`/jobs/search?${query.toString()}`);
      setJobs(res.data);
    } catch (err) {
      setError('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const fetchMyApplications = async () => {
    try {
      const res = await api.get('/applications/my');
      setMyApplications(res.data);
    } catch (_) {}
  };

  const fetchResumes = async () => {
    try {
      const res = await api.get('/resumes/my');
      setResumes(res.data);
    } catch (_) {}
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchJobs();
  };

  const handleApply = async (jobId) => {
    try {
      await api.post('/applications/', {
        job_id: jobId,
        resume_id: selectedResume || null,
        cover_note: coverNote || null,
      });
      setMessage('Application submitted successfully!');
      setApplyModal(null);
      setCoverNote('');
      setSelectedResume('');
      fetchMyApplications();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to apply');
      setTimeout(() => setError(''), 3000);
    }
  };

  const hasApplied = (jobId) => myApplications.some(a => a.job_id === jobId);

  const locationTypeLabel = { remote: 'Remote', onsite: 'On-site', hybrid: 'Hybrid' };
  const jobTypeLabel = { full_time: 'Full-time', part_time: 'Part-time', internship: 'Internship', contract: 'Contract' };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Job Search</h1>

      {message && <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm">{message}</div>}
      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>}

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text" placeholder="Search jobs by title, description..."
              value={filters.keyword} onChange={e => setFilters({ ...filters, keyword: e.target.value })}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>
          <button type="submit" className="bg-primary-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-700 transition">
            Search
          </button>
          <button type="button" onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1 border border-gray-300 px-4 py-2.5 rounded-lg text-gray-600 hover:bg-gray-50 transition">
            <Filter className="h-4 w-4" /> Filters {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 bg-gray-50 p-4 rounded-lg">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
              <input type="text" value={filters.company} onChange={e => setFilters({ ...filters, company: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Company name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
              <input type="text" value={filters.location} onChange={e => setFilters({ ...filters, location: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="City, state..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Work Type</label>
              <select value={filters.location_type} onChange={e => setFilters({ ...filters, location_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                <option value="">All</option>
                <option value="remote">Remote</option>
                <option value="onsite">On-site</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Job Type</label>
              <select value={filters.job_type} onChange={e => setFilters({ ...filters, job_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                <option value="">All</option>
                <option value="full_time">Full-time</option>
                <option value="part_time">Part-time</option>
                <option value="internship">Internship</option>
                <option value="contract">Contract</option>
              </select>
            </div>
          </div>
        )}
      </form>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Briefcase className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-medium">No jobs found</p>
          <p className="text-sm">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map(job => (
            <div key={job.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition cursor-pointer"
              onClick={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">{job.title}</h3>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                    <span className="flex items-center gap-1"><Building2 className="h-4 w-4" /> {job.company_name || 'Company'}</span>
                    {job.location && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {job.location}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-full">
                      {locationTypeLabel[job.location_type] || job.location_type}
                    </span>
                    <span className="px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 rounded-full">
                      {jobTypeLabel[job.job_type] || job.job_type}
                    </span>
                    {(job.salary_min || job.salary_max) && (
                      <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-yellow-50 text-yellow-700 rounded-full">
                        <DollarSign className="h-3 w-3" />
                        {job.salary_min && job.salary_max ? `${job.salary_min} - ${job.salary_max}` : job.salary_min || job.salary_max}
                      </span>
                    )}
                  </div>
                  {job.required_skills?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {job.required_skills.map(skill => (
                        <span key={skill} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">{skill}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right ml-4">
                  <span className="text-xs text-gray-400">
                    <Clock className="h-3 w-3 inline mr-1" />
                    {new Date(job.created_at).toLocaleDateString()}
                  </span>
                  {hasApplied(job.id) ? (
                    <div className="mt-2 px-3 py-1.5 bg-green-50 text-green-700 text-xs rounded-lg font-medium">Applied</div>
                  ) : user?.role === 'user' ? (
                    <button onClick={(e) => { e.stopPropagation(); setApplyModal(job); }}
                      className="mt-2 flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white text-xs rounded-lg font-medium hover:bg-primary-700 transition">
                      <Send className="h-3 w-3" /> Apply
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Expanded details */}
              {selectedJob?.id === job.id && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.description}</p>
                  {job.application_deadline && (
                    <p className="text-xs text-red-600 mt-2">Deadline: {job.application_deadline}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Apply Modal */}
      {applyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setApplyModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Apply to {applyModal.title}</h3>
            <p className="text-sm text-gray-500 mb-4">{applyModal.company_name}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Resume (optional)</label>
                <select value={selectedResume} onChange={e => setSelectedResume(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                  <option value="">No resume</option>
                  {resumes.map(r => (
                    <option key={r.id} value={r.id}>{r.original_filename}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cover Note (optional)</label>
                <textarea value={coverNote} onChange={e => setCoverNote(e.target.value)} rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"
                  placeholder="Why are you a good fit for this role?" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setApplyModal(null)} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button onClick={() => handleApply(applyModal.id)} className="flex-1 bg-primary-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition">
                  Submit Application
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

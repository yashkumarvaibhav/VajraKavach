import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Building2, Plus, Briefcase, MapPin, Globe, Search, ChevronDown, ChevronUp, Users as UsersIcon } from 'lucide-react';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];

export default function CompanyPage() {
  const { user } = useAuth();
  const isRecruiter = user?.role === 'recruiter';
  const [tab, setTab] = useState(isRecruiter ? 'my' : 'search');
  const [companies, setCompanies] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [myJobs, setMyJobs] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedCompany, setExpandedCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [companyForm, setCompanyForm] = useState({
    name: '', description: '', website: '', location: '', industry: '', size: '',
  });

  const [jobForm, setJobForm] = useState({
    title: '', description: '', location: '', salary_min: '', salary_max: '',
    salary_currency: 'INR', job_type: 'full-time', application_deadline: '',
  });
  const [postingJobFor, setPostingJobFor] = useState(null);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (isRecruiter) fetchMyCompanies();
  }, [isRecruiter]);

  const fetchMyCompanies = async () => {
    setLoading(true);
    try {
      const res = await api.get('/companies/my');
      setCompanies(res.data || []);
    } catch (err) {
      console.error('Fetch companies error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyJobs = async () => {
    try {
      const res = await api.get('/jobs/my');
      setMyJobs(res.data || []);
    } catch (err) {
      console.error('Fetch jobs error:', err);
    }
  };

  useEffect(() => {
    if (tab === 'jobs' && isRecruiter) fetchMyJobs();
  }, [tab]);

  const searchCompanies = async () => {
    if (!searchQuery.trim()) return;
    try {
      const res = await api.get(`/companies/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(res.data || []);
    } catch (err) {
      console.error('Search error:', err);
    }
  };

  const createCompany = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/companies/', companyForm);
      setShowCreate(false);
      setCompanyForm({ name: '', description: '', website: '', location: '', industry: '', size: '' });
      fetchMyCompanies();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) setError(detail.map(d => d.msg || d).join('; '));
      else setError(detail || 'Failed to create company');
    }
  };

  const postJob = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/jobs/', {
        ...jobForm,
        company_id: postingJobFor,
        salary_min: jobForm.salary_min ? Number(jobForm.salary_min) : null,
        salary_max: jobForm.salary_max ? Number(jobForm.salary_max) : null,
      });
      setPostingJobFor(null);
      setJobForm({
        title: '', description: '', location: '', salary_min: '', salary_max: '',
        salary_currency: 'INR', job_type: 'full-time', application_deadline: '',
      });
      if (tab === 'jobs') fetchMyJobs();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) setError(detail.map(d => d.msg || d).join('; '));
      else setError(detail || 'Failed to post job');
    }
  };

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm";

  const CompanyCard = ({ company, showActions }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{company.name}</h3>
          {company.industry && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{company.industry}</span>}
        </div>
        {showActions && (
          <button onClick={() => setExpandedCompany(expandedCompany === company.id ? null : company.id)}
            className="p-1 hover:bg-gray-100 rounded">
            {expandedCompany === company.id ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        )}
      </div>
      {company.description && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{company.description}</p>}
      <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
        {company.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{company.location}</span>}
        {company.website && <a href={company.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary-600 hover:underline"><Globe className="h-3.5 w-3.5" />{company.website}</a>}
        {company.size && <span>{company.size} employees</span>}
      </div>
      {showActions && expandedCompany === company.id && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <button onClick={() => setPostingJobFor(company.id)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition">
            <Briefcase className="h-4 w-4" /> Post a Job
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center space-x-3 mb-6">
        <Building2 className="h-8 w-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">Companies</h1>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-6">
        {isRecruiter && (
          <button onClick={() => setTab('my')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${tab === 'my' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            My Companies
          </button>
        )}
        <button onClick={() => setTab('search')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${tab === 'search' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Search Companies
        </button>
        {isRecruiter && (
          <button onClick={() => setTab('jobs')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${tab === 'jobs' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            My Job Postings
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>}

      {/* My Companies Tab */}
      {tab === 'my' && isRecruiter && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition">
              <Plus className="h-4 w-4" /> New Company
            </button>
          </div>

          {showCreate && (
            <form onSubmit={createCompany} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Company</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Company Name <span className="text-red-500">*</span></label>
                  <input type="text" value={companyForm.name} onChange={(e) => setCompanyForm(f => ({ ...f, name: e.target.value }))}
                    required className={inputClass} placeholder="Acme Corp" />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Description <span className="text-red-500">*</span></label>
                  <textarea value={companyForm.description} onChange={(e) => setCompanyForm(f => ({ ...f, description: e.target.value }))}
                    required className={inputClass + " h-20 resize-none"} placeholder="What does the company do?" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Location <span className="text-red-500">*</span></label>
                  <input type="text" value={companyForm.location} onChange={(e) => setCompanyForm(f => ({ ...f, location: e.target.value }))}
                    required className={inputClass} placeholder="New Delhi, India" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Website <span className="text-red-500">*</span></label>
                  <input type="url" value={companyForm.website} onChange={(e) => setCompanyForm(f => ({ ...f, website: e.target.value }))}
                    required className={inputClass} placeholder="https://acme.com" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Industry</label>
                  <input type="text" value={companyForm.industry} onChange={(e) => setCompanyForm(f => ({ ...f, industry: e.target.value }))}
                    className={inputClass} placeholder="Technology" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Size</label>
                  <input type="text" value={companyForm.size} onChange={(e) => setCompanyForm(f => ({ ...f, size: e.target.value }))}
                    className={inputClass} placeholder="100-500" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit"
                  className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">Create</button>
              </div>
            </form>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading...</div>
          ) : companies.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No companies yet. Create your first company!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {companies.map(c => <CompanyCard key={c.id} company={c} showActions={true} />)}
            </div>
          )}
        </div>
      )}

      {/* Search Tab */}
      {tab === 'search' && (
        <div>
          <div className="flex gap-2 mb-6">
            <input type="text" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchCompanies()}
              placeholder="Search by name or location..."
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            <button onClick={searchCompanies}
              className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition flex items-center gap-1">
              <Search className="h-4 w-4" /> Search
            </button>
          </div>
          <div className="space-y-4">
            {searchResults.map(c => <CompanyCard key={c.id} company={c} showActions={false} />)}
            {searchResults.length === 0 && searchQuery && (
              <div className="text-center py-8 text-gray-400">No companies found</div>
            )}
          </div>
        </div>
      )}

      {/* My Jobs Tab */}
      {tab === 'jobs' && isRecruiter && (
        <div>
          {myJobs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Briefcase className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No job postings yet. Post jobs from your company page.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myJobs.map(job => (
                <div key={job.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{job.title}</h3>
                      <p className="text-sm text-gray-500">{job.company_name}</p>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-primary-600 bg-primary-50 px-2 py-1 rounded-full">
                      <UsersIcon className="h-3.5 w-3.5" />
                      {job.applicant_count || 0} applicants
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    {job.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.location}</span>}
                    {(job.salary_min || job.salary_max) && (
                      <span>{job.salary_currency || 'INR'} {job.salary_min?.toLocaleString()}{job.salary_max ? ` - ${job.salary_max.toLocaleString()}` : ''}</span>
                    )}
                    <span className="capitalize">{job.job_type}</span>
                    {job.is_active ? <span className="text-green-600">Active</span> : <span className="text-red-500">Closed</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Job Posting Modal */}
      {postingJobFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Post a Job</h3>
            {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>}
            <form onSubmit={postJob} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Job Title <span className="text-red-500">*</span></label>
                <input type="text" value={jobForm.title} onChange={(e) => setJobForm(f => ({ ...f, title: e.target.value }))}
                  required className={inputClass} placeholder="Software Engineer" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Description <span className="text-red-500">*</span></label>
                <textarea value={jobForm.description} onChange={(e) => setJobForm(f => ({ ...f, description: e.target.value }))}
                  required className={inputClass + " h-24 resize-none"} placeholder="Job description..." />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Location</label>
                <input type="text" value={jobForm.location} onChange={(e) => setJobForm(f => ({ ...f, location: e.target.value }))}
                  className={inputClass} placeholder="Remote / City" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Currency</label>
                  <select value={jobForm.salary_currency} onChange={(e) => setJobForm(f => ({ ...f, salary_currency: e.target.value }))}
                    className={inputClass}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Min Salary</label>
                  <input type="number" value={jobForm.salary_min} onChange={(e) => setJobForm(f => ({ ...f, salary_min: e.target.value }))}
                    className={inputClass} placeholder="50000" min="0" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Max Salary</label>
                  <input type="number" value={jobForm.salary_max} onChange={(e) => setJobForm(f => ({ ...f, salary_max: e.target.value }))}
                    className={inputClass} placeholder="100000" min="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Job Type</label>
                  <select value={jobForm.job_type} onChange={(e) => setJobForm(f => ({ ...f, job_type: e.target.value }))}
                    className={inputClass}>
                    <option value="full-time">Full Time</option>
                    <option value="part-time">Part Time</option>
                    <option value="contract">Contract</option>
                    <option value="internship">Internship</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Deadline</label>
                  <input type="date" value={jobForm.application_deadline}
                    onChange={(e) => setJobForm(f => ({ ...f, application_deadline: e.target.value }))}
                    className={inputClass} min={today} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setPostingJobFor(null); setError(''); }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit"
                  className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">Post Job</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

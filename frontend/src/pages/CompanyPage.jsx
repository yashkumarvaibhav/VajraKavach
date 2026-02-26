import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Building2, Plus, Briefcase, MapPin, Globe, Search, ChevronDown, ChevronUp, Users as UsersIcon, Filter, SortAsc, Eye, Mail, FileText, CheckCircle, XCircle, Clock, Trash2, Edit, MessageSquare, Download, Lock } from 'lucide-react';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];
const STATUS_OPTIONS = [
  { value: 'applied', label: 'Applied', color: 'bg-blue-50 text-blue-700' },
  { value: 'reviewed', label: 'Reviewed', color: 'bg-yellow-50 text-yellow-700' },
  { value: 'interviewed', label: 'Interviewed', color: 'bg-purple-50 text-purple-700' },
  { value: 'offer', label: 'Offer', color: 'bg-green-50 text-green-700' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-50 text-red-700' },
];

export default function CompanyPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isRecruiter = user?.role === 'recruiter';
  const initialTab = searchParams.get('tab') || (isRecruiter ? 'my' : 'browse');
  const [tab, setTab] = useState(initialTab);
  const [companies, setCompanies] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [allCompanies, setAllCompanies] = useState([]);
  const [industryFilter, setIndustryFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
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
    salary_currency: 'INR', job_type: 'full_time', location_type: 'onsite', application_deadline: '',
  });
  const [postingJobFor, setPostingJobFor] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [loadingApplicants, setLoadingApplicants] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [editJobForm, setEditJobForm] = useState({});

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (isRecruiter) fetchMyCompanies();
    fetchAllCompanies();
  }, [isRecruiter]);

  const fetchAllCompanies = async () => {
    try {
      const res = await api.get('/companies/search');
      setAllCompanies(res.data || []);
    } catch (err) {
      console.error('Fetch all companies error:', err);
    }
  };

  const filteredCompanies = allCompanies
    .filter(c => {
      if (searchQuery && !c.name?.toLowerCase().includes(searchQuery.toLowerCase()) && !c.location?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (industryFilter && c.industry !== industryFilter) return false;
      if (locationFilter && !c.location?.toLowerCase().includes(locationFilter.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => sortOrder === 'asc' ? (a.name || '').localeCompare(b.name || '') : (b.name || '').localeCompare(a.name || ''));

  const uniqueIndustries = [...new Set(allCompanies.map(c => c.industry).filter(Boolean))].sort();

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

  const createCompany = async (e) => {
    e.preventDefault();
    setError('');
    try {
      // Auto-prepend https:// if no protocol present
      const submitForm = { ...companyForm };
      if (submitForm.website && !submitForm.website.match(/^https?:\/\//i)) {
        submitForm.website = 'https://' + submitForm.website;
      }
      await api.post('/companies/', submitForm);
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
    if (jobForm.salary_min && jobForm.salary_max && Number(jobForm.salary_max) < Number(jobForm.salary_min)) {
      setError('Maximum salary cannot be less than minimum salary');
      return;
    }
    try {
      await api.post('/jobs/', {
        ...jobForm,
        company_id: postingJobFor,
        salary_min: jobForm.salary_min || null,
        salary_max: jobForm.salary_max || null,
      });
      setPostingJobFor(null);
      setJobForm({
        title: '', description: '', location: '', salary_min: '', salary_max: '',
        salary_currency: 'INR', job_type: 'full_time', location_type: 'onsite', application_deadline: '',
      });
      if (tab === 'jobs') fetchMyJobs();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) setError(detail.map(d => d.msg || d).join('; '));
      else setError(detail || 'Failed to post job');
    }
  };

  const fetchApplicants = async (jobId) => {
    if (selectedJob === jobId) { setSelectedJob(null); setApplicants([]); return; }
    setSelectedJob(jobId);
    setLoadingApplicants(true);
    try {
      const res = await api.get(`/applications/job/${jobId}`);
      setApplicants(res.data || []);
    } catch (err) {
      console.error('Fetch applicants error:', err);
      setApplicants([]);
    } finally {
      setLoadingApplicants(false);
    }
  };

  const updateApplicationStatus = async (appId, newStatus, notes) => {
    try {
      const payload = { status: newStatus };
      if (notes !== undefined) payload.recruiter_notes = notes;
      await api.put(`/applications/${appId}/status`, payload);
      setApplicants(prev => prev.map(a =>
        a.id === appId ? { ...a, status: newStatus, ...(notes !== undefined ? { recruiter_notes: notes } : {}) } : a
      ));
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update status');
    }
  };

  const downloadResume = async (resumeId, filename) => {
    const token = prompt('Enter your TOTP code to download this resume:');
    if (!token) return;
    try {
      const res = await api.get(`/resumes/${resumeId}/download?totp_token=${encodeURIComponent(token)}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'resume';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to download resume. Check your TOTP code and access permissions.');
    }
  };

  const startEditJob = (job) => {
    setEditingJob(job.id);
    setEditJobForm({
      title: job.title || '',
      description: job.description || '',
      location: job.location || '',
      salary_min: job.salary_min || '',
      salary_max: job.salary_max || '',
      salary_currency: job.salary_currency || 'INR',
      job_type: job.job_type || 'full_time',
      location_type: job.location_type || 'onsite',
      application_deadline: job.application_deadline || '',
      is_active: job.is_active,
    });
  };

  const saveEditJob = async (e) => {
    e.preventDefault();
    setError('');
    if (editJobForm.salary_min && editJobForm.salary_max && Number(editJobForm.salary_max) < Number(editJobForm.salary_min)) {
      setError('Maximum salary cannot be less than minimum salary');
      return;
    }
    try {
      await api.put(`/jobs/${editingJob}`, {
        ...editJobForm,
        salary_min: editJobForm.salary_min || null,
        salary_max: editJobForm.salary_max || null,
        application_deadline: editJobForm.application_deadline || null,
      });
      setEditingJob(null);
      setEditJobForm({});
      fetchMyJobs();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) setError(detail.map(d => d.msg || d).join('; '));
      else setError(detail || 'Failed to update job');
    }
  };

  const deleteJob = async (jobId) => {
    if (!confirm('Delete this job listing? This cannot be undone.')) return;
    try {
      await api.delete(`/jobs/${jobId}`);
      setSelectedJob(null);
      setApplicants([]);
      fetchMyJobs();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete job');
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
        <button onClick={() => setTab('browse')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${tab === 'browse' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Browse Companies
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
                    required maxLength={255} className={inputClass} placeholder="Acme Corp" />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Description <span className="text-red-500">*</span></label>
                  <textarea value={companyForm.description} onChange={(e) => setCompanyForm(f => ({ ...f, description: e.target.value }))}
                    required maxLength={5000} className={inputClass + " h-20 resize-none"} placeholder="What does the company do?" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Location <span className="text-red-500">*</span></label>
                  <input type="text" value={companyForm.location} onChange={(e) => setCompanyForm(f => ({ ...f, location: e.target.value }))}
                    required maxLength={255} className={inputClass} placeholder="New Delhi, India" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Website <span className="text-red-500">*</span></label>
                  <input type="text" value={companyForm.website} onChange={(e) => setCompanyForm(f => ({ ...f, website: e.target.value }))}
                    required maxLength={512} className={inputClass} placeholder="acme.com or https://acme.com" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Industry</label>
                  <input type="text" value={companyForm.industry} onChange={(e) => setCompanyForm(f => ({ ...f, industry: e.target.value }))}
                    maxLength={255} className={inputClass} placeholder="Technology" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Size</label>
                  <input type="text" value={companyForm.size} onChange={(e) => setCompanyForm(f => ({ ...f, size: e.target.value }))}
                    maxLength={50} className={inputClass} placeholder="100-500" />
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

      {/* Browse Tab */}
      {tab === 'browse' && (
        <div>
          <div className="flex flex-wrap gap-2 mb-6">
            <input type="text" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or location..."
              maxLength={100}
              className="flex-1 min-w-[200px] px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            {uniqueIndustries.length > 0 && (
              <select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)}
                className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                <option value="">All Industries</option>
                {uniqueIndustries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
              </select>
            )}
            <button onClick={() => setSortOrder(s => s === 'asc' ? 'desc' : 'asc')}
              className="px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition flex items-center gap-1 text-sm">
              <SortAsc className="h-4 w-4" /> {sortOrder === 'asc' ? 'A → Z' : 'Z → A'}
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-4">{filteredCompanies.length} companies</p>
          <div className="space-y-4">
            {filteredCompanies.map(c => <CompanyCard key={c.id} company={c} showActions={false} />)}
            {filteredCompanies.length === 0 && (
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
                <div key={job.id} className="bg-white rounded-xl shadow-sm border border-gray-100">
                  <div className="p-5 cursor-pointer" onClick={() => fetchApplicants(job.id)}>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">{job.title}</h3>
                        <p className="text-sm text-gray-500">{job.company_name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 text-sm text-primary-600 bg-primary-50 px-2 py-1 rounded-full">
                          <UsersIcon className="h-3.5 w-3.5" />
                          {job.applicant_count || 0} applicants
                        </div>
                        {selectedJob === job.id ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      {job.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.location}</span>}
                      {(job.salary_min || job.salary_max) && (
                        <span>{job.salary_currency || 'INR'} {job.salary_min?.toLocaleString()}{job.salary_max ? ` - ${job.salary_max.toLocaleString()}` : ''}</span>
                      )}
                      <span className="capitalize">{job.job_type?.replace('_', ' ')}</span>
                      {job.is_active ? <span className="text-green-600">Active</span> : <span className="text-red-500">Closed</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <button onClick={(e) => { e.stopPropagation(); startEditJob(job); }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                        <Edit className="h-3 w-3" /> Edit
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteJob(job.id); }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition">
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </div>
                  </div>

                  {/* Applicants Panel */}
                  {selectedJob === job.id && (
                    <div className="border-t border-gray-100 p-5 bg-gray-50">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Applicants</h4>
                      {loadingApplicants ? (
                        <p className="text-sm text-gray-400 text-center py-4">Loading applicants...</p>
                      ) : applicants.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">No applicants yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {applicants.map(app => {
                            const statusInfo = STATUS_OPTIONS.find(s => s.value === app.status) || STATUS_OPTIONS[0];
                            return (
                              <div key={app.id} className="bg-white rounded-lg border border-gray-200 p-4">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-semibold text-gray-900">{app.applicant_name || 'Unknown'}</p>
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>
                                        {statusInfo.label}
                                      </span>
                                    </div>
                                    {app.applicant_email && (
                                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                        <Mail className="h-3 w-3" /> {app.applicant_email}
                                      </p>
                                    )}
                                    {app.cover_note && (
                                      <div className="mt-2 p-2 bg-gray-50 rounded text-sm text-gray-600 border-l-2 border-primary-300">
                                        <p className="text-xs font-medium text-gray-500 mb-1">Cover Note:</p>
                                        {app.cover_note}
                                      </div>
                                    )}
                                    <p className="text-xs text-gray-400 mt-2">
                                      Applied {new Date(app.created_at).toLocaleDateString()}
                                    </p>
                                    <div className="flex items-center gap-2 mt-2">
                                      {app.user_id && (
                                        <button onClick={() => navigate(`/profile/${app.user_id}`)}
                                          className="text-xs px-2 py-1 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 flex items-center gap-1">
                                          <Eye className="h-3 w-3" /> View Profile
                                        </button>
                                      )}
                                      {app.user_id && (
                                        <button onClick={() => navigate(`/messages?newConv=${app.user_id}&name=${encodeURIComponent(app.applicant_name || 'Applicant')}`)}
                                          className="text-xs px-2 py-1 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 flex items-center gap-1">
                                          <MessageSquare className="h-3 w-3" /> Message
                                        </button>
                                      )}
                                      {app.resume_id && (
                                        <button onClick={() => downloadResume(app.resume_id, app.resume_filename || 'resume')}
                                          className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 flex items-center gap-1">
                                          <Download className="h-3 w-3" /> Resume
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Status Update Controls */}
                                  <div className="flex flex-col gap-2 flex-shrink-0">
                                    <select
                                      value={app.status}
                                      onChange={(e) => updateApplicationStatus(app.id, e.target.value)}
                                      className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-primary-500 outline-none">
                                      {STATUS_OPTIONS.map(s => (
                                        <option key={s.value} value={s.value}>{s.label}</option>
                                      ))}
                                    </select>
                                    <button
                                      onClick={() => {
                                        const notes = prompt('Recruiter Notes:', app.recruiter_notes || '');
                                        if (notes !== null) updateApplicationStatus(app.id, app.status, notes);
                                      }}
                                      className="text-xs px-2 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">
                                      <FileText className="h-3 w-3" /> Notes
                                    </button>
                                  </div>
                                </div>

                                {app.recruiter_notes && (
                                  <div className="mt-2 p-2 bg-yellow-50 rounded text-sm text-yellow-800 border-l-2 border-yellow-400">
                                    <p className="text-xs font-medium text-yellow-600 mb-1">Your Notes:</p>
                                    {app.recruiter_notes}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
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
                  required maxLength={255} className={inputClass} placeholder="Software Engineer" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Description <span className="text-red-500">*</span></label>
                <textarea value={jobForm.description} onChange={(e) => setJobForm(f => ({ ...f, description: e.target.value }))}
                  required maxLength={10000} className={inputClass + " h-24 resize-none"} placeholder="Job description..." />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Location</label>
                <input type="text" value={jobForm.location} onChange={(e) => setJobForm(f => ({ ...f, location: e.target.value }))}
                  maxLength={255} className={inputClass} placeholder="Remote / City" />
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
                    className={inputClass} placeholder="50000" min="0" max="999999999" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Max Salary</label>
                  <input type="number" value={jobForm.salary_max} onChange={(e) => setJobForm(f => ({ ...f, salary_max: e.target.value }))}
                    className={inputClass} placeholder="100000" min="0" max="999999999" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Job Type</label>
                  <select value={jobForm.job_type} onChange={(e) => setJobForm(f => ({ ...f, job_type: e.target.value }))}
                    className={inputClass}>
                    <option value="full_time">Full Time</option>
                    <option value="part_time">Part Time</option>
                    <option value="contract">Contract</option>
                    <option value="internship">Internship</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Location Type</label>
                  <select value={jobForm.location_type} onChange={(e) => setJobForm(f => ({ ...f, location_type: e.target.value }))}
                    className={inputClass}>
                    <option value="onsite">On-site</option>
                    <option value="remote">Remote</option>
                    <option value="hybrid">Hybrid</option>
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

      {/* Edit Job Modal */}
      {editingJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Job</h3>
            {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>}
            <form onSubmit={saveEditJob} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Job Title <span className="text-red-500">*</span></label>
                <input type="text" value={editJobForm.title} onChange={(e) => setEditJobForm(f => ({ ...f, title: e.target.value }))}
                  required maxLength={255} className={inputClass} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Description <span className="text-red-500">*</span></label>
                <textarea value={editJobForm.description} onChange={(e) => setEditJobForm(f => ({ ...f, description: e.target.value }))}
                  required maxLength={10000} className={inputClass + " h-24 resize-none"} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Location</label>
                <input type="text" value={editJobForm.location} onChange={(e) => setEditJobForm(f => ({ ...f, location: e.target.value }))}
                  maxLength={255} className={inputClass} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Currency</label>
                  <select value={editJobForm.salary_currency} onChange={(e) => setEditJobForm(f => ({ ...f, salary_currency: e.target.value }))}
                    className={inputClass}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Min Salary</label>
                  <input type="number" value={editJobForm.salary_min} onChange={(e) => setEditJobForm(f => ({ ...f, salary_min: e.target.value }))}
                    className={inputClass} min="0" max="999999999" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Max Salary</label>
                  <input type="number" value={editJobForm.salary_max} onChange={(e) => setEditJobForm(f => ({ ...f, salary_max: e.target.value }))}
                    className={inputClass} min="0" max="999999999" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Job Type</label>
                  <select value={editJobForm.job_type} onChange={(e) => setEditJobForm(f => ({ ...f, job_type: e.target.value }))}
                    className={inputClass}>
                    <option value="full_time">Full Time</option>
                    <option value="part_time">Part Time</option>
                    <option value="contract">Contract</option>
                    <option value="internship">Internship</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Location Type</label>
                  <select value={editJobForm.location_type} onChange={(e) => setEditJobForm(f => ({ ...f, location_type: e.target.value }))}
                    className={inputClass}>
                    <option value="onsite">On-site</option>
                    <option value="remote">Remote</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Deadline</label>
                  <input type="date" value={editJobForm.application_deadline || ''}
                    onChange={(e) => setEditJobForm(f => ({ ...f, application_deadline: e.target.value }))}
                    className={inputClass} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Active</label>
                <input type="checkbox" checked={editJobForm.is_active}
                  onChange={(e) => setEditJobForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="h-4 w-4 text-primary-600 rounded border-gray-300" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setEditingJob(null); setError(''); }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit"
                  className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

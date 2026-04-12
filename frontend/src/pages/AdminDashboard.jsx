import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import VirtualKeyboard from '../components/VirtualKeyboard';
import { Shield, Users, BarChart3, FileText, AlertTriangle, UserX, UserCheck, Search, ChevronLeft, ChevronRight, Briefcase, Megaphone, Trash2, Download, Flag } from 'lucide-react';
import { toISTDate, toISTDateTime } from '../utils/time';

export default function AdminDashboard() {
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === 'platform_admin';
  const [tab, setTab] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [allJobs, setAllJobs] = useState([]);
  const [totpToken, setTotpToken] = useState('');
  const [verified, setVerified] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [userPage, setUserPage] = useState(1);
  const usersPerPage = 20;
  const [auditPage, setAuditPage] = useState(1);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementContent, setAnnouncementContent] = useState('');
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);
  const [allResumes, setAllResumes] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportStatusFilter, setReportStatusFilter] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [blockchainStatus, setBlockchainStatus] = useState(null);
  const [mining, setMining] = useState(false);

  const verify = async () => {
    setVerifyError('');
    try {
      await api.post('/auth/verify-totp', { token: totpToken });
      setVerified(true);
      fetchDashboard();
      fetchUsers();
    } catch (err) {
      setVerifyError(err.response?.data?.detail || 'Verification failed');
      setTotpToken('');
    }
  };

  const fetchDashboard = async () => {
    try {
      const res = await api.get('/admin/dashboard');
      setDashboard(res.data);
    } catch (err) {
      console.error('Dashboard error:', err);
    }
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/users?page_size=100');
      setUsers(res.data || []);
    } catch (err) {
      console.error('Users error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAuditLogs = async (page = 1) => {
    try {
      const res = await api.get(`/admin/audit-logs?page=${page}&page_size=20`);
      setAuditLogs(res.data || []);
      setAuditPage(page);
    } catch (err) {
      console.error('Audit error:', err);
    }
  };

  useEffect(() => {
    if (verified && tab === 'audit') { fetchAuditLogs(auditPage); fetchBlockchain(); }
    if (verified && tab === 'jobs') fetchAdminJobs();
    if (verified && tab === 'announcements') fetchAnnouncements();
    if (verified && tab === 'resumes') fetchResumes();
    if (verified && tab === 'reports') fetchReports();
  }, [verified, tab]);

  const fetchResumes = async () => {
    try {
      const res = await api.get('/admin/resumes');
      setAllResumes(res.data || []);
    } catch (err) {
      console.error('Admin resumes error:', err);
    }
  };

  const fetchReports = async (statusFilter) => {
    try {
      const params = statusFilter ? `?status_filter=${statusFilter}` : '';
      const res = await api.get(`/reports/admin/all${params}`);
      setReports(res.data || []);
    } catch (err) {
      console.error('Reports error:', err);
    }
  };

  const updateReportStatus = async (reportId, newStatus, notes) => {
    try {
      await api.put(`/reports/admin/${reportId}`, { status: newStatus, admin_notes: notes || null });
      fetchReports(reportStatusFilter);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update report');
    }
  };

  const fetchBlockchain = async () => {
    try {
      const [blocksRes, verifyRes] = await Promise.all([
        api.get('/admin/blockchain/blocks'),
        api.get('/admin/blockchain/verify'),
      ]);
      setBlocks(blocksRes.data || []);
      setBlockchainStatus(verifyRes.data);
    } catch (err) {
      console.error('Blockchain error:', err);
    }
  };

  const mineBlock = async () => {
    setMining(true);
    try {
      const res = await api.post('/admin/blockchain/mine');
      alert(res.data.message);
      fetchBlockchain();
    } catch (err) {
      alert(err.response?.data?.detail || 'Mining failed');
    } finally {
      setMining(false);
    }
  };

  const downloadResume = async (resumeId, filename) => {
    const token = prompt('Enter your TOTP code to download this resume:');
    if (!token) return;
    try {
      const res = await api.get(`/resumes/${resumeId}/download`, { responseType: 'blob', headers: { 'X-TOTP-Token': token } });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'resume';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to download resume');
    }
  };

  const fetchAdminJobs = async () => {
    try {
      const res = await api.get('/admin/jobs');
      setAllJobs(res.data || []);
    } catch (err) {
      console.error('Admin jobs error:', err);
    }
  };

  const toggleJobActive = async (jobId) => {
    setActionLoading(jobId);
    try {
      await api.put(`/admin/jobs/${jobId}/delist`);
      fetchAdminJobs();
      fetchDashboard();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to toggle job');
    } finally {
      setActionLoading(null);
    }
  };

  const toggleSuspend = async (userId, currentSuspended) => {
    setActionLoading(userId);
    try {
      if (currentSuspended) {
        await api.put(`/admin/users/${userId}/activate`);
      } else {
        await api.put(`/admin/users/${userId}/suspend`);
      }
      fetchUsers();
      fetchDashboard();
    } catch (err) {
      alert(err.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const deleteUser = async (userId, email) => {
    if (!confirm(`Permanently delete user ${email}? This action cannot be undone. All their data will be removed.`)) return;
    setActionLoading(userId);
    try {
      await api.delete(`/admin/users/${userId}`);
      fetchUsers();
      fetchDashboard();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete user');
    } finally {
      setActionLoading(null);
    }
  };

  const fetchAnnouncements = async () => {
    try {
      const res = await api.get('/messages/announcements');
      setAnnouncements(res.data || []);
    } catch (err) {
      console.error('Announcements error:', err);
    }
  };

  const sendAnnouncement = async () => {
    if (!announcementTitle.trim() || !announcementContent.trim()) {
      alert('Please enter both a title and content for the announcement');
      return;
    }
    setSendingAnnouncement(true);
    try {
      await api.post('/messages/announcements', {
        title: announcementTitle.trim(),
        content: announcementContent.trim(),
      });
      setAnnouncementTitle('');
      setAnnouncementContent('');
      fetchAnnouncements();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to send announcement');
    } finally {
      setSendingAnnouncement(false);
    }
  };

  const deleteAnnouncement = async (id) => {
    if (!confirm('Deactivate this announcement?')) return;
    try {
      await api.delete(`/messages/announcements/${id}`);
      fetchAnnouncements();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete announcement');
    }
  };

  const filteredUsers = users.filter(u => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || (
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.ip_address?.toLowerCase().includes(q)
    );
    const matchesRole = !roleFilter || u.role === roleFilter;
    const matchesStatus = !statusFilter ||
      (statusFilter === 'suspended' && u.is_suspended) ||
      (statusFilter === 'active' && u.is_active && !u.is_suspended) ||
      (statusFilter === 'inactive' && !u.is_active && !u.is_suspended);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalUserPages = Math.ceil(filteredUsers.length / usersPerPage);
  const paginatedUsers = filteredUsers.slice((userPage - 1) * usersPerPage, userPage * usersPerPage);

  // Reset to page 1 when filters change
  useEffect(() => { setUserPage(1); }, [searchQuery, roleFilter, statusFilter]);

  if (!verified) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 max-w-md w-full text-center">
          <Shield className="h-12 w-12 text-primary-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Admin Verification</h2>
          <p className="text-gray-500 mb-6">Enter your TOTP code to access the admin panel</p>
          {verifyError && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{verifyError}</div>}
          <VirtualKeyboard value={totpToken} onChange={setTotpToken} maxLength={6} />
          <button onClick={verify} disabled={totpToken.length !== 6}
            className="w-full mt-4 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition disabled:opacity-50">
            Verify & Access
          </button>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Users', value: dashboard?.total_users || 0, icon: Users, color: 'blue' },
    { label: 'Active Users', value: dashboard?.active_users || 0, icon: UserCheck, color: 'green' },
    { label: 'Suspended', value: dashboard?.suspended_users || 0, icon: UserX, color: 'red' },
    { label: 'Total Jobs', value: dashboard?.total_jobs || 0, icon: BarChart3, color: 'indigo' },
    { label: 'Audit Logs', value: dashboard?.total_audit_logs || 0, icon: FileText, color: 'purple' },
  ];

  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center space-x-3 mb-6">
        <Shield className="h-8 w-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard{!isPlatformAdmin && ' (View Only)'}</h1>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-6">
        {[
          { key: 'overview', label: 'Overview', icon: BarChart3 },
          { key: 'users', label: 'Users', icon: Users },
          { key: 'jobs', label: 'Jobs', icon: Briefcase },
          { key: 'resumes', label: 'Resumes', icon: Download },
          { key: 'announcements', label: 'Announcements', icon: Megaphone },
          { key: 'reports', label: 'Reports', icon: Flag },
          { key: 'audit', label: 'Audit Logs', icon: FileText },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition ${
              tab === t.key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {statCards.map(card => (
            <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${colorMap[card.color]}`}>
                <card.icon className="h-5 w-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              <p className="text-sm text-gray-500">{card.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Users */}
      {tab === 'users' && (
        <div>
          <div className="flex gap-2 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email or IP..." maxLength={100}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm" />
            </div>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none">
              <option value="">All Roles</option>
              <option value="user">User</option>
              <option value="recruiter">Recruiter</option>
              <option value="admin">Admin</option>
              <option value="platform_admin">Platform Admin</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
            <span className="self-center text-xs text-gray-400">{filteredUsers.length} of {users.length} users</span>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading users...</div>
          ) : (
            <>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">User</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">IP Address</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginatedUsers.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 max-w-[200px]">
                        <div>
                          <p className="font-medium text-gray-900 text-sm truncate" title={u.full_name}>{u.full_name}</p>
                          <p className="text-xs text-gray-400 truncate" title={u.email}>{u.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          u.role === 'platform_admin' ? 'bg-red-50 text-red-700' :
                          u.role === 'admin' ? 'bg-purple-50 text-purple-700' :
                          u.role === 'recruiter' ? 'bg-blue-50 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {u.role === 'platform_admin' ? 'Platform Admin' : u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          u.is_suspended
                            ? 'bg-red-50 text-red-700'
                            : u.is_active
                              ? 'bg-green-50 text-green-700'
                              : 'bg-yellow-50 text-yellow-700'
                        }`}>
                          {u.is_suspended ? 'Suspended' : u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono text-gray-500">
                          {u.ip_address || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {isPlatformAdmin && u.role !== 'platform_admin' && (
                          <>
                            <button
                              onClick={() => toggleSuspend(u.id, u.is_suspended)}
                              disabled={actionLoading === u.id}
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                                u.is_suspended
                                  ? 'bg-green-600 text-white hover:bg-green-700'
                                  : 'bg-red-100 text-red-700 hover:bg-red-200'
                              } disabled:opacity-50`}
                            >
                              {actionLoading === u.id ? '...' : u.is_suspended ? 'Activate' : 'Suspend'}
                            </button>
                            <button
                              onClick={() => deleteUser(u.id, u.email)}
                              disabled={actionLoading === u.id}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
                            >
                              {actionLoading === u.id ? '...' : 'Delete'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalUserPages > 1 && (
              <div className="flex items-center justify-between mt-4 px-1">
                <span className="text-sm text-gray-500">
                  Page {userPage} of {totalUserPages} ({filteredUsers.length} users)
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setUserPage(p => Math.max(1, p - 1))} disabled={userPage === 1}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </button>
                  <button onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))} disabled={userPage === totalUserPages}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            </>
          )}
        </div>
      )}

      {/* Jobs */}
      {tab === 'jobs' && (
        <div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Job Title</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Company</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Created</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {allJobs.map(job => (
                  <tr key={job.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 text-sm">{job.title}</p>
                      {job.location && <p className="text-xs text-gray-400">{job.location}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{job.company_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">{job.job_type?.replace('_', ' ')}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        job.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {job.is_active ? 'Active' : 'Delisted'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{toISTDate(job.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {isPlatformAdmin && (
                        <button
                          onClick={() => toggleJobActive(job.id)}
                          disabled={actionLoading === job.id}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                            job.is_active
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-green-600 text-white hover:bg-green-700'
                          } disabled:opacity-50`}
                        >
                          {actionLoading === job.id ? '...' : job.is_active ? 'Delist' : 'Re-activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {allJobs.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No jobs found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resumes */}
      {tab === 'resumes' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Download className="h-5 w-5 text-primary-600" />
              All Resumes ({allResumes.length})
            </h3>
          </div>
          {allResumes.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No resumes uploaded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Owner</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Filename</th>
                    <th className="px-4 py-3 text-left">Size</th>
                    <th className="px-4 py-3 text-left">Uploaded</th>
                    <th className="px-4 py-3 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {allResumes.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.owner_name}</td>
                      <td className="px-4 py-3 text-gray-500">{r.owner_email}</td>
                      <td className="px-4 py-3 text-gray-700">{r.original_filename}</td>
                      <td className="px-4 py-3 text-gray-500">{r.file_size ? `${(r.file_size / 1024).toFixed(1)} KB` : '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{r.uploaded_at ? toISTDate(r.uploaded_at) : '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => downloadResume(r.id, r.original_filename)}
                          className="text-xs px-3 py-1.5 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 flex items-center gap-1">
                          <Download className="h-3 w-3" /> Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Audit Logs */}
      {/* Announcements */}
      {tab === 'announcements' && (
        <div className="space-y-6">
          {/* Create Announcement — platform admin only */}
          {isPlatformAdmin && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-primary-600" />
                New Announcement
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                Announcements are server-side encrypted (AES/Fernet) at rest and broadcast to all users.
              </p>
              <div className="space-y-3">
                <input
                  type="text" value={announcementTitle}
                  onChange={(e) => setAnnouncementTitle(e.target.value)}
                  placeholder="Announcement title..."
                  maxLength={200}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
                <textarea
                  value={announcementContent}
                  onChange={(e) => setAnnouncementContent(e.target.value)}
                  placeholder="Announcement content..."
                  maxLength={10000}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"
                />
                <button onClick={sendAnnouncement} disabled={sendingAnnouncement || !announcementTitle.trim() || !announcementContent.trim()}
                  className="px-5 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition disabled:opacity-50 font-medium">
                  {sendingAnnouncement ? 'Sending...' : 'Broadcast Announcement'}
                </button>
              </div>
            </div>
          )}

          {/* Existing Announcements */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Announcements</h3>
            {announcements.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">No announcements yet</p>
            ) : (
              <div className="space-y-3">
                {announcements.map(a => (
                  <div key={a.id} className="border border-gray-100 rounded-lg p-4 hover:bg-gray-50 transition">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900">{a.title}</h4>
                        <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{a.content}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                          <span>By {a.sender_name || 'Admin'}</span>
                          <span>{toISTDateTime(a.created_at)}</span>
                          <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded-full text-xs">Server-side encrypted</span>
                        </div>
                      </div>
                      {isPlatformAdmin && (
                        <button onClick={() => deleteAnnouncement(a.id)}
                          className="p-2 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600 transition ml-2" title="Deactivate">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reports */}
      {tab === 'reports' && (
        <div>
          <div className="flex gap-2 mb-4">
            <select value={reportStatusFilter} onChange={(e) => { setReportStatusFilter(e.target.value); fetchReports(e.target.value); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-white">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="reviewed">Reviewed</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Reporter</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Reported User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reports.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{toISTDateTime(r.created_at)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{r.reporter_name || 'Unknown'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{r.reported_user_name || r.resource_type || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        r.category === 'harassment' || r.category === 'fraud' ? 'bg-red-50 text-red-700' :
                        r.category === 'spam' ? 'bg-yellow-50 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {r.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{r.description}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        r.status === 'pending' ? 'bg-yellow-50 text-yellow-700' :
                        r.status === 'reviewed' ? 'bg-blue-50 text-blue-700' :
                        r.status === 'resolved' ? 'bg-green-50 text-green-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isPlatformAdmin && r.status === 'pending' && (
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => updateReportStatus(r.id, 'reviewed')}
                            className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100">Review</button>
                          <button onClick={() => updateReportStatus(r.id, 'resolved')}
                            className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100">Resolve</button>
                          <button onClick={() => updateReportStatus(r.id, 'dismissed')}
                            className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200">Dismiss</button>
                        </div>
                      )}
                      {isPlatformAdmin && r.status === 'reviewed' && (
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => updateReportStatus(r.id, 'resolved')}
                            className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100">Resolve</button>
                          <button onClick={() => updateReportStatus(r.id, 'dismissed')}
                            className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200">Dismiss</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {reports.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No reports found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit Logs */}
      {tab === 'audit' && (
        <div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Timestamp</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Action</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Integrity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{toISTDateTime(log.created_at)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{log.action}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{log.user_id || 'System'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        log.integrity_valid !== false ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {log.integrity_valid !== false ? 'Valid' : 'Tampered'}
                      </span>
                    </td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No audit logs found</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center mt-4">
            <button onClick={() => fetchAuditLogs(Math.max(1, auditPage - 1))} disabled={auditPage === 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <span className="text-sm text-gray-500">
              Showing {(auditPage - 1) * 20 + 1} - {(auditPage - 1) * 20 + auditLogs.length}
            </span>
            <button onClick={() => fetchAuditLogs(auditPage + 1)} disabled={auditLogs.length < 20}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Blockchain Section */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Blockchain Audit Blocks</h3>
              <div className="flex items-center gap-3">
                {blockchainStatus && (
                  <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                    blockchainStatus.valid ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  }`}>
                    Chain: {blockchainStatus.valid ? 'Valid' : 'Tampered'} ({blockchainStatus.total_blocks} blocks)
                  </span>
                )}
                {isPlatformAdmin && (
                  <button onClick={mineBlock} disabled={mining}
                    className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50">
                    {mining ? 'Mining...' : 'Mine New Block'}
                  </button>
                )}
              </div>
            </div>
            {blocks.length > 0 ? (
              <div className="space-y-2">
                {blocks.map(b => (
                  <div key={b.id} className="bg-white rounded-lg border border-gray-100 p-4 text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-indigo-700">Block #{b.block_number}</span>
                      <span className="text-xs text-gray-400">{toISTDateTime(b.timestamp)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <div><span className="font-medium">Hash:</span> <span className="font-mono">{b.block_hash.slice(0, 16)}...</span></div>
                      <div><span className="font-medium">Prev:</span> <span className="font-mono">{b.previous_block_hash.slice(0, 16)}...</span></div>
                      <div><span className="font-medium">Merkle:</span> <span className="font-mono">{b.merkle_root.slice(0, 16)}...</span></div>
                      <div><span className="font-medium">Nonce:</span> {b.nonce} | <span className="font-medium">Entries:</span> {b.entry_count}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No blocks mined yet. Click "Mine New Block" to create one.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

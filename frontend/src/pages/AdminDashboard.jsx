import { useState, useEffect } from 'react';
import api from '../services/api';
import { Shield, Users, Briefcase, FileText, Activity, CheckCircle, XCircle, UserX, UserCheck, UserPlus, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [integrityResult, setIntegrityResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Create admin form
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [adminForm, setAdminForm] = useState({ email: '', password: '', full_name: '' });
  const [newAdminInfo, setNewAdminInfo] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([
        api.get('/admin/dashboard'),
        api.get('/admin/users'),
      ]);
      setStats(statsRes.data);
      setUsers(usersRes.data);
    } catch (err) {
      setError('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await api.get('/admin/audit-logs');
      setAuditLogs(res.data);
    } catch (err) {
      setError('Failed to load audit logs');
    }
  };

  const verifyIntegrity = async () => {
    try {
      const res = await api.get('/admin/audit-logs/verify-integrity');
      setIntegrityResult(res.data);
    } catch (err) {
      setError('Failed to verify audit log integrity');
    }
  };

  const suspendUser = async (userId) => {
    try {
      await api.put(`/admin/users/${userId}/suspend`);
      setMessage('User suspended');
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to suspend user');
      setTimeout(() => setError(''), 3000);
    }
  };

  const activateUser = async (userId) => {
    try {
      await api.put(`/admin/users/${userId}/activate`);
      setMessage('User activated');
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to activate user');
      setTimeout(() => setError(''), 3000);
    }
  };

  const deleteUser = async (userId) => {
    if (!confirm('Permanently delete this user?')) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      setMessage('User deleted');
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete user');
      setTimeout(() => setError(''), 3000);
    }
  };

  const promoteToAdmin = async (userId) => {
    if (!confirm('Promote this user to admin?')) return;
    try {
      await api.put(`/admin/users/${userId}/promote-admin`);
      setMessage('User promoted to admin');
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to promote');
      setTimeout(() => setError(''), 3000);
    }
  };

  const demoteFromAdmin = async (userId) => {
    if (!confirm('Remove admin privileges from this user?')) return;
    try {
      await api.put(`/admin/users/${userId}/demote-admin`);
      setMessage('Admin privileges removed');
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to demote');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/create-admin', adminForm);
      setNewAdminInfo(res.data);
      setMessage('Admin created successfully');
      setAdminForm({ email: '', password: '', full_name: '' });
      fetchData();
      setTimeout(() => setMessage(''), 5000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create admin');
      setTimeout(() => setError(''), 3000);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users' },
    { id: 'admins', label: 'Admin Mgmt' },
    { id: 'audit', label: 'Audit Logs' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center space-x-3 mb-8">
        <Shield className="h-8 w-8 text-red-600" />
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
      </div>

      {message && <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm">{message}</div>}
      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>}

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); if (tab.id === 'audit') fetchAuditLogs(); }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              activeTab === tab.id ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Users', value: stats.total_users, icon: Users, color: 'text-blue-600 bg-blue-50' },
            { label: 'Companies', value: stats.total_companies, icon: Briefcase, color: 'text-green-600 bg-green-50' },
            { label: 'Jobs', value: stats.total_jobs, icon: Briefcase, color: 'text-purple-600 bg-purple-50' },
            { label: 'Applications', value: stats.total_applications, icon: FileText, color: 'text-orange-600 bg-orange-50' },
            { label: 'Resumes', value: stats.total_resumes, icon: FileText, color: 'text-red-600 bg-red-50' },
            { label: 'Audit Logs', value: stats.total_audit_logs, icon: Activity, color: 'text-indigo-600 bg-indigo-50' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className={`w-10 h-10 ${stat.color} rounded-lg flex items-center justify-center mb-3`}>
                <stat.icon className="h-5 w-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-sm text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">TOTP</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{u.full_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{u.email}</td>
                  <td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-medium rounded-full uppercase ${
                    u.role === 'admin' ? 'bg-red-100 text-red-700' : u.role === 'recruiter' ? 'bg-green-100 text-green-700' : 'bg-primary-100 text-primary-700'
                  }`}>{u.role}</span></td>
                  <td className="px-6 py-4">{u.is_active ? <span className="text-green-600 text-sm">Active</span> : <span className="text-red-600 text-sm">Suspended</span>}</td>
                  <td className="px-6 py-4">{u.totp_verified ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-gray-400" />}</td>
                  <td className="px-6 py-4 flex space-x-1">
                    <button onClick={() => suspendUser(u.id)} className="text-red-600 hover:text-red-700 p-1 rounded hover:bg-red-50" title="Suspend">
                      <UserX className="h-4 w-4" />
                    </button>
                    <button onClick={() => activateUser(u.id)} className="text-green-600 hover:text-green-700 p-1 rounded hover:bg-green-50" title="Activate">
                      <UserCheck className="h-4 w-4" />
                    </button>
                    <button onClick={() => deleteUser(u.id)} className="text-red-600 hover:text-red-700 p-1 rounded hover:bg-red-50" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Admin Management Tab */}
      {activeTab === 'admins' && (
        <div>
          {/* Create Admin Form */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Create New Admin</h3>
              <button onClick={() => setShowCreateAdmin(!showCreateAdmin)} className="text-primary-600 text-sm">
                {showCreateAdmin ? 'Hide' : 'Show Form'}
              </button>
            </div>
            {showCreateAdmin && (
              <form onSubmit={handleCreateAdmin} className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input type="text" value={adminForm.full_name} onChange={e => setAdminForm({ ...adminForm, full_name: e.target.value })} required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" value={adminForm.email} onChange={e => setAdminForm({ ...adminForm, email: e.target.value })} required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input type="password" value={adminForm.password} onChange={e => setAdminForm({ ...adminForm, password: e.target.value })} required minLength={8}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                  </div>
                </div>
                <button type="submit" className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition">
                  <UserPlus className="h-4 w-4" /> Create Admin
                </button>
              </form>
            )}
            {newAdminInfo && (
              <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm font-medium text-yellow-800">New admin created! Share TOTP secret with them:</p>
                <p className="font-mono text-sm mt-1 text-yellow-900">{newAdminInfo.totp_secret}</p>
                {newAdminInfo.qr_code_base64 && (
                  <img src={`data:image/png;base64,${newAdminInfo.qr_code_base64}`} alt="TOTP QR" className="mt-2" style={{ width: 150, height: 150 }} />
                )}
              </div>
            )}
          </div>

          {/* Admin Users List */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Admins & User Roles</h3>
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50">
                  <div>
                    <span className="font-medium text-gray-900 text-sm">{u.full_name}</span>
                    <span className="text-gray-400 text-sm ml-2">({u.email})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full uppercase ${
                      u.role === 'admin' ? 'bg-red-100 text-red-700' : u.role === 'recruiter' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>{u.role}</span>
                    {u.role !== 'admin' && (
                      <button onClick={() => promoteToAdmin(u.id)}
                        className="flex items-center gap-1 text-xs bg-red-50 text-red-600 px-2 py-1 rounded hover:bg-red-100 transition">
                        <ChevronUp className="h-3 w-3" /> Promote
                      </button>
                    )}
                    {u.role === 'admin' && (
                      <button onClick={() => demoteFromAdmin(u.id)}
                        className="flex items-center gap-1 text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded hover:bg-gray-100 transition">
                        <ChevronDown className="h-3 w-3" /> Demote
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Audit Logs Tab */}
      {activeTab === 'audit' && (
        <div>
          <div className="flex items-center space-x-4 mb-4">
            <button
              onClick={verifyIntegrity}
              className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
            >
              <Shield className="h-4 w-4" />
              <span>Verify Chain Integrity</span>
            </button>
            {integrityResult && (
              <div className={`flex items-center space-x-2 text-sm ${integrityResult.valid ? 'text-green-600' : 'text-red-600'}`}>
                {integrityResult.valid ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                <span>{integrityResult.valid ? `Chain intact (${integrityResult.total_entries} entries)` : `Chain broken at entry ${integrityResult.broken_at}`}</span>
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Resource</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hash (first 12)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 text-sm">
                    <td className="px-4 py-3 text-gray-600 text-xs">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{log.action}</td>
                    <td className="px-4 py-3 text-gray-600">{log.resource || '-'}</td>
                    <td className="px-4 py-3 text-gray-500">{log.ip_address || '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.entry_hash?.substring(0, 12)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

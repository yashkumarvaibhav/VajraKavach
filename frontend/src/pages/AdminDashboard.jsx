import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import VirtualKeyboard from '../components/VirtualKeyboard';
import { Shield, Users, BarChart3, FileText, AlertTriangle, UserX, UserCheck, Search, ChevronLeft, ChevronRight } from 'lucide-react';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [totpToken, setTotpToken] = useState('');
  const [verified, setVerified] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [auditPage, setAuditPage] = useState(0);

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
      const res = await api.get('/admin/users');
      setUsers(res.data || []);
    } catch (err) {
      console.error('Users error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAuditLogs = async (skip = 0) => {
    try {
      const res = await api.get(`/admin/audit-logs?skip=${skip}&limit=20`);
      setAuditLogs(res.data || []);
      setAuditPage(skip);
    } catch (err) {
      console.error('Audit error:', err);
    }
  };

  useEffect(() => {
    if (verified && tab === 'audit') fetchAuditLogs(auditPage);
  }, [verified, tab]);

  const toggleSuspend = async (userId, currentSuspended) => {
    setActionLoading(userId);
    try {
      if (currentSuspended) {
        await api.post(`/admin/users/${userId}/activate`);
      } else {
        await api.post(`/admin/users/${userId}/suspend`);
      }
      fetchUsers();
      fetchDashboard();
    } catch (err) {
      alert(err.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = searchQuery
    ? users.filter(u =>
        u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : users;

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
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-6">
        {[
          { key: 'overview', label: 'Overview', icon: BarChart3 },
          { key: 'users', label: 'Users', icon: Users },
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
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter users by name or email..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm" />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading users...</div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">User</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredUsers.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{u.full_name}</p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          u.role === 'admin' ? 'bg-purple-50 text-purple-700' :
                          u.role === 'recruiter' ? 'bg-blue-50 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {u.role}
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
                      <td className="px-4 py-3 text-right">
                        {u.role !== 'admin' && (
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
                        )}
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
                    <td className="px-4 py-3 text-sm text-gray-600">{new Date(log.created_at).toLocaleString()}</td>
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
            <button onClick={() => fetchAuditLogs(Math.max(0, auditPage - 20))} disabled={auditPage === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <span className="text-sm text-gray-500">Showing {auditPage + 1} - {auditPage + auditLogs.length}</span>
            <button onClick={() => fetchAuditLogs(auditPage + 20)} disabled={auditLogs.length < 20}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

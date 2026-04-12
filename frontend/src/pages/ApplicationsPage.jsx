import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { ClipboardList, Building2, Calendar, FileText, XCircle } from 'lucide-react';
import Pagination from '../components/Pagination';
import { toISTDate } from '../utils/time';

const STATUS_COLORS = {
  applied: 'bg-yellow-50 text-yellow-700',
  reviewed: 'bg-blue-50 text-blue-700',
  interviewed: 'bg-indigo-50 text-indigo-700',
  offer: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
};

export default function ApplicationsPage() {
  const { user } = useAuth();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(null);
  const [appPage, setAppPage] = useState(1);
  const perPage = 20;

  const fetchApplications = async () => {
    try {
      const res = await api.get('/applications/my');
      setApplications(res.data || []);
    } catch (err) {
      console.error('Fetch applications error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  const withdrawApplication = async (appId) => {
    if (!confirm('Withdraw this application? This cannot be undone.')) return;
    setWithdrawing(appId);
    try {
      await api.delete(`/applications/${appId}`);
      setApplications(prev => prev.filter(a => a.id !== appId));
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to withdraw application');
    } finally {
      setWithdrawing(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center space-x-3 mb-6">
        <ClipboardList className="h-8 w-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">My Applications</h1>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading applications...</div>
      ) : applications.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No applications yet. Browse jobs to apply!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.slice((appPage - 1) * perPage, appPage * perPage).map(app => (
            <div key={app.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{app.job_title || 'Untitled Position'}</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {app.company_name || 'Unknown Company'}
                    </span>
                    {app.job_is_active === false && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">Job Closed</span>
                    )}
                  </div>
                </div>
                <span className={`px-3 py-1 text-xs font-medium rounded-full capitalize ${STATUS_COLORS[app.status] || 'bg-gray-50 text-gray-700'}`}>
                  {app.status}
                </span>
              </div>

              {app.cover_note && (
                <div className="mt-3 flex items-start gap-2">
                  <FileText className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-gray-600 line-clamp-2">{app.cover_note}</p>
                </div>
              )}

              <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Applied {toISTDate(app.applied_at || app.created_at)}
                </span>
              </div>

              {(app.status === 'applied' || app.status === 'pending') && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => withdrawApplication(app.id)}
                    disabled={withdrawing === app.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition disabled:opacity-50">
                    <XCircle className="h-3.5 w-3.5" />
                    {withdrawing === app.id ? 'Withdrawing...' : 'Withdraw Application'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {!loading && applications.length > 0 && (
        <Pagination currentPage={appPage} totalPages={Math.ceil(applications.length / perPage)}
          totalItems={applications.length} onPageChange={setAppPage} itemLabel="applications" />
      )}
    </div>
  );
}

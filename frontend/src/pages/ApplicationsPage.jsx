import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { FileText, Clock, CheckCircle, XCircle, Eye, MessageSquare, Briefcase } from 'lucide-react';

const statusConfig = {
  applied: { label: 'Applied', color: 'bg-blue-100 text-blue-700', icon: Clock },
  reviewed: { label: 'Reviewed', color: 'bg-yellow-100 text-yellow-700', icon: Eye },
  interviewed: { label: 'Interviewed', color: 'bg-purple-100 text-purple-700', icon: MessageSquare },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
  offer: { label: 'Offer', color: 'bg-green-100 text-green-700', icon: CheckCircle },
};

export default function ApplicationsPage() {
  const { user } = useAuth();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [jobDetails, setJobDetails] = useState({});

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      const res = await api.get('/applications/my');
      setApplications(res.data);

      // Fetch job details for each application
      const details = {};
      await Promise.all(
        res.data.map(async (app) => {
          if (!details[app.job_id]) {
            try {
              const jobRes = await api.get(`/jobs/${app.job_id}`);
              details[app.job_id] = jobRes.data;
            } catch (_) {
              details[app.job_id] = { title: 'Unknown Job', company_name: '' };
            }
          }
        })
      );
      setJobDetails(details);
    } catch (err) {
      setError('Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Briefcase className="h-8 w-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">My Applications</h1>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>}

      {/* Status Summary */}
      {!loading && applications.length > 0 && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          {Object.entries(statusConfig).map(([key, cfg]) => {
            const count = applications.filter(a => a.status === key).length;
            const Icon = cfg.icon;
            return (
              <div key={key} className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 text-center">
                <Icon className={`h-5 w-5 mx-auto mb-1 ${cfg.color.split(' ')[1]}`} />
                <p className="text-xl font-bold text-gray-900">{count}</p>
                <p className="text-xs text-gray-500">{cfg.label}</p>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : applications.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-medium">No applications yet</p>
          <p className="text-sm">Search for jobs and apply to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map(app => {
            const job = jobDetails[app.job_id] || {};
            const status = statusConfig[app.status] || statusConfig.applied;
            const StatusIcon = status.icon;
            return (
              <div key={app.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{job.title || 'Job'}</h3>
                    <p className="text-sm text-gray-500">{job.company_name || ''}</p>
                    {app.cover_note && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-1">Note: {app.cover_note}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${status.color}`}>
                      <StatusIcon className="h-3 w-3" /> {status.label}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">{new Date(app.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

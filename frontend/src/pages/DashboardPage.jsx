import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { BarChart3, Users, MessageSquare, FileText, Briefcase, Building2, Shield, ClipboardList } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const endpoints = {
          connections: '/users/connections',
          conversations: '/messages/conversations',
        };
        const [connRes, convRes] = await Promise.all([
          api.get(endpoints.connections),
          api.get(endpoints.conversations),
        ]);
        const s = {
          connections: (connRes.data || []).filter(c => c.status === 'accepted').length,
          conversations: (convRes.data || []).length,
        };

        if (user?.role === 'user') {
          const appRes = await api.get('/applications/my');
          s.applications = (appRes.data || []).length;
        }
        if (user?.role === 'recruiter') {
          try {
            const compRes = await api.get('/companies/my');
            s.companies = (compRes.data || []).length;
            const jobRes = await api.get('/jobs/my');
            s.myJobs = (jobRes.data || []).length;
          } catch { s.companies = 0; s.myJobs = 0; }
        }

        setStats(s);
      } catch (err) {
        console.error('Stats error:', err);
      }
    };
    fetchStats();
  }, [user]);

  const userCards = [
    { icon: Briefcase, label: 'Browse Jobs', desc: 'Search and apply for positions', to: '/jobs', color: 'blue' },
    { icon: ClipboardList, label: 'My Applications', desc: `${stats?.applications || 0} applications submitted`, to: '/applications', color: 'indigo' },
    { icon: FileText, label: 'My Resume', desc: 'Manage your encrypted resume', to: '/resume', color: 'purple' },
    { icon: Users, label: 'Connections', desc: `${stats?.connections || 0} active connections`, to: '/connections', color: 'green' },
    { icon: MessageSquare, label: 'Messages', desc: `${stats?.conversations || 0} conversations`, to: '/messages', color: 'teal' },
    { icon: Shield, label: 'Security', desc: 'Change password & TOTP', to: '/security', color: 'red' },
  ];

  const recruiterCards = [
    { icon: Building2, label: 'My Companies', desc: `${stats?.companies || 0} companies`, to: '/companies', color: 'blue' },
    { icon: Briefcase, label: 'My Job Postings', desc: `${stats?.myJobs || 0} active listings`, to: '/companies', color: 'indigo' },
    { icon: Users, label: 'Connections', desc: `${stats?.connections || 0} active connections`, to: '/connections', color: 'green' },
    { icon: MessageSquare, label: 'Messages', desc: `${stats?.conversations || 0} conversations`, to: '/messages', color: 'teal' },
    { icon: Shield, label: 'Security', desc: 'Change password & TOTP', to: '/security', color: 'red' },
  ];

  const adminCards = [
    { icon: BarChart3, label: 'Admin Panel', desc: 'Manage platform users', to: '/admin', color: 'blue' },
    { icon: Briefcase, label: 'All Jobs', desc: 'Monitor job listings', to: '/jobs', color: 'indigo' },
    { icon: Users, label: 'Connections', desc: `${stats?.connections || 0} connections`, to: '/connections', color: 'green' },
    { icon: MessageSquare, label: 'Messages', desc: `${stats?.conversations || 0} conversations`, to: '/messages', color: 'teal' },
    { icon: Shield, label: 'Security', desc: 'Change password & TOTP', to: '/security', color: 'red' },
  ];

  const cards = user?.role === 'admin' ? adminCards : user?.role === 'recruiter' ? recruiterCards : userCards;

  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
    teal: 'bg-teal-50 text-teal-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-8 mb-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Welcome back, {user?.full_name}!</h1>
        <p className="text-primary-100">
          {user?.role === 'admin' ? 'Platform Administrator' : user?.role === 'recruiter' ? 'Recruiter Dashboard' : 'Your secure professional hub'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((card, i) => (
          <Link key={i} to={card.to}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition group">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${colorClasses[card.color]}`}>
              <card.icon className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">{card.label}</h3>
            <p className="text-sm text-gray-500 mt-1">{card.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

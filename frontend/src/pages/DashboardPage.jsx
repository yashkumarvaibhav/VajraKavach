import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Shield, Users, Briefcase, FileText, MessageSquare, Lock, ClipboardList, Building2 } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();

  const features = [
    { icon: Briefcase, title: 'Job Search', desc: 'Find your next opportunity', color: 'text-green-600 bg-green-50', to: '/jobs' },
    { icon: Users, title: 'Connections', desc: 'Build your professional network', color: 'text-blue-600 bg-blue-50', to: '/connections' },
    { icon: MessageSquare, title: 'Messaging', desc: 'End-to-end encrypted chat', color: 'text-orange-600 bg-orange-50', to: '/messages' },
    { icon: FileText, title: 'Resume', desc: 'Encrypted resume management', color: 'text-purple-600 bg-purple-50', to: '/resumes' },
    { icon: ClipboardList, title: 'Applications', desc: 'Track your job applications', color: 'text-teal-600 bg-teal-50', to: '/applications', roles: ['user'] },
    { icon: Building2, title: 'Companies', desc: 'Manage company pages & jobs', color: 'text-cyan-600 bg-cyan-50', to: '/companies', roles: ['recruiter', 'admin'] },
    { icon: Lock, title: 'Security', desc: 'PKI-backed trust & TOTP auth', color: 'text-red-600 bg-red-50', to: '/profile' },
    { icon: Shield, title: 'Admin Panel', desc: 'Platform management & audit', color: 'text-indigo-600 bg-indigo-50', to: '/admin', roles: ['admin'] },
  ];

  const visibleFeatures = features.filter(f => !f.roles || f.roles.includes(user?.role));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {user?.full_name}!
        </h1>
        <p className="text-gray-600 mt-1">Your secure professional dashboard</p>
      </div>

      {/* Security Status Card */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-6 mb-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Security Status</h2>
            <div className="flex items-center space-x-4 mt-3">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-sm">TOTP Active</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-sm">E2E Encryption</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-sm">PKI Verified</span>
              </div>
            </div>
          </div>
          <Shield className="h-16 w-16 opacity-20" />
        </div>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleFeatures.map((feature) => (
          <Link key={feature.title} to={feature.to}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition cursor-pointer block">
            <div className={`w-12 h-12 ${feature.color} rounded-lg flex items-center justify-center mb-4`}>
              <feature.icon className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{feature.title}</h3>
            <p className="text-gray-500 text-sm mt-1">{feature.desc}</p>
          </Link>
        ))}
      </div>

      {/* Account Info */}
      <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">Email:</span> <span className="font-medium">{user?.email}</span></div>
          <div><span className="text-gray-500">Role:</span> <span className="font-medium uppercase">{user?.role}</span></div>
          <div><span className="text-gray-500">TOTP:</span> <span className="font-medium text-green-600">Verified</span></div>
          <div><span className="text-gray-500">Status:</span> <span className="font-medium text-green-600">Active</span></div>
        </div>
      </div>
    </div>
  );
}

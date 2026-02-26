import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { LogOut, User, Shield, LayoutDashboard, FileText, Briefcase, Users, MessageSquare, Building2, ClipboardList } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isActive = (path) => location.pathname === path;

  const navLink = (to, icon, label) => {
    const Icon = icon;
    return (
      <Link to={to} className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition ${
        isActive(to) ? 'text-primary-700 bg-primary-50' : 'text-gray-600 hover:text-primary-600'
      }`}>
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-6">
            <Link to="/dashboard" className="flex items-center space-x-2">
              <Shield className="h-8 w-8 text-primary-600" />
              <span className="text-xl font-bold text-gray-900">VajraKavach</span>
            </Link>
            <div className="hidden md:flex space-x-1">
              {navLink('/dashboard', LayoutDashboard, 'Dashboard')}
              {navLink('/jobs', Briefcase, 'Jobs')}
              {navLink('/connections', Users, 'Connections')}
              {navLink('/messages', MessageSquare, 'Messages')}
              {navLink('/profile', User, 'Profile')}
              {navLink('/resumes', FileText, 'Resumes')}
              {user?.role === 'user' && navLink('/applications', ClipboardList, 'Applications')}
              {(user?.role === 'recruiter' || user?.role === 'admin') && navLink('/companies', Building2, 'Companies')}
              {user?.role === 'admin' && (
                <Link to="/admin" className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition ${
                  isActive('/admin') ? 'text-red-700 bg-red-50' : 'text-red-600 hover:text-red-700'
                }`}>
                  <Shield className="h-4 w-4" />
                  <span>Admin</span>
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600 hidden sm:inline">{user?.full_name}</span>
            <span className="text-xs px-2 py-1 bg-primary-100 text-primary-700 rounded-full uppercase">{user?.role}</span>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 text-gray-500 hover:text-red-600 px-3 py-2 rounded-md text-sm font-medium transition"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

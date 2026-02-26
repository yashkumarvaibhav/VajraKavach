import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Shield, LogOut } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isActive = (path) => location.pathname === path
    ? 'bg-primary-700 text-white'
    : 'text-gray-200 hover:bg-primary-700/50 hover:text-white';

  const baseLink = "px-3 py-2 rounded-lg text-sm font-medium transition-colors";

  const commonLinks = user?.role === 'admin'
    ? [
        { to: '/dashboard', label: 'Dashboard' },
        { to: '/companies', label: 'Companies' },
      ]
    : [
        { to: '/dashboard', label: 'Dashboard' },
        { to: '/connections', label: 'Connections' },
        { to: '/messages', label: 'Messages' },
        { to: '/companies', label: 'Companies' },
      ];

  const roleLinks = {
    user: [
      { to: '/jobs', label: 'Jobs' },
      { to: '/applications', label: 'Applications' },
      { to: '/resume', label: 'Resume' },
      { to: '/profile', label: 'Profile' },
      { to: '/security', label: 'Security' },
    ],
    recruiter: [
      { to: '/profile', label: 'Profile' },
      { to: '/security', label: 'Security' },
    ],
    admin: [
      { to: '/admin', label: 'Admin Panel' },
      { to: '/jobs', label: 'Jobs' },
      { to: '/profile', label: 'Profile' },
      { to: '/security', label: 'Security' },
    ],
  };

  const links = [...commonLinks, ...(roleLinks[user?.role] || [])];

  return (
    <nav className="bg-gradient-to-r from-primary-800 to-primary-900 shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/dashboard" className="flex items-center space-x-2">
            <Shield className="h-8 w-8 text-primary-300" />
            <span className="text-white font-bold text-lg">VajraKavach</span>
          </Link>

          <div className="flex items-center space-x-1">
            {links.map(link => (
              <Link key={link.to} to={link.to}
                className={`${baseLink} ${isActive(link.to)}`}>
                {link.label}
              </Link>
            ))}
            <button onClick={logout}
              className="ml-2 px-3 py-2 rounded-lg text-sm font-medium text-red-200 hover:bg-red-600/30 hover:text-white transition-colors flex items-center gap-1">
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function GreetingBar() {
  const { user } = useAuth();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!user) return null;

  const roleLabel = user.role === 'admin' ? 'Admin' : user.role === 'recruiter' ? 'Recruiter' : 'Job Seeker';

  const istTime = time.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const utcTime = time.toLocaleTimeString('en-US', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return (
    <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white px-4 py-2 text-sm flex items-center justify-between flex-wrap gap-2">
      <span className="font-medium">
        Hi {user.full_name} ({roleLabel})
      </span>
      <div className="flex items-center gap-4 text-primary-100 text-xs">
        <span>IST: {istTime}</span>
        <span>UTC: {utcTime}</span>
        {user.ip_address && <span>IP: {user.ip_address}</span>}
      </div>
    </div>
  );
}

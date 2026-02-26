import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { User, ArrowLeft, MapPin, Globe, Briefcase, GraduationCap, Mail, UserPlus, UserCheck, Clock, MessageSquare } from 'lucide-react';

export default function ViewProfilePage() {
  const { userId } = useParams();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState(null);

  useEffect(() => {
    if (!userId) return;
    // If viewing own profile, redirect to /profile
    if (userId === currentUser?.id) {
      navigate('/profile');
      return;
    }
    fetchProfile();
    checkConnectionStatus();
  }, [userId, currentUser]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/users/${userId}/profile`);
      setProfile(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const checkConnectionStatus = async () => {
    try {
      const res = await api.get(`/users/search?q=`);
      const found = (res.data || []).find(u => u.id === userId);
      if (found) {
        setConnectionStatus(found.connection_status);
      }
    } catch (err) {
      console.error('Connection status check error:', err);
    }
  };

  const sendConnectionRequest = async () => {
    try {
      await api.post('/users/connections', { addressee_id: userId });
      setConnectionStatus('pending');
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to send request');
    }
  };

  const startConversation = () => {
    navigate('/messages');
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="text-center py-12 text-gray-400">Loading profile...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>
      </div>
    );
  }

  if (!profile) return null;

  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  const education = Array.isArray(profile.education) ? profile.education : [];
  const experience = Array.isArray(profile.experience) ? profile.experience : [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Profile Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-start gap-5">
          <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden flex-shrink-0">
            {profile.profile_picture_url ? (
              <img src={profile.profile_picture_url} alt="" className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <span className="text-primary-600 font-bold text-3xl">
                {(profile.full_name || '?')[0].toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{profile.full_name || 'Unknown User'}</h1>
            {profile.headline && <p className="text-gray-600 mt-1">{profile.headline}</p>}
            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500">
              {profile.location && (
                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{profile.location}</span>
              )}
              {profile.email && (
                <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{profile.email}</span>
              )}
              {profile.website && (
                <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary-600 hover:underline">
                  <Globe className="h-3.5 w-3.5" />{profile.website}
                </a>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-4">
              {connectionStatus === 'accepted' ? (
                <>
                  <span className="px-4 py-2 bg-green-50 text-green-700 text-sm rounded-lg font-medium flex items-center gap-1.5">
                    <UserCheck className="h-4 w-4" /> Connected
                  </span>
                  <button onClick={startConversation}
                    className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition flex items-center gap-1.5">
                    <MessageSquare className="h-4 w-4" /> Message
                  </button>
                </>
              ) : connectionStatus === 'pending' ? (
                <span className="px-4 py-2 bg-yellow-50 text-yellow-700 text-sm rounded-lg font-medium flex items-center gap-1.5">
                  <Clock className="h-4 w-4" /> Request Pending
                </span>
              ) : (
                <button onClick={sendConnectionRequest}
                  className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition flex items-center gap-1.5">
                  <UserPlus className="h-4 w-4" /> Connect
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bio */}
      {profile.bio && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">About</h2>
          <p className="text-gray-600 whitespace-pre-wrap">{profile.bio}</p>
        </div>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Skills</h2>
          <div className="flex flex-wrap gap-2">
            {skills.map((skill, idx) => (
              <span key={idx} className="px-3 py-1 bg-primary-50 text-primary-700 rounded-full text-sm font-medium">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Experience */}
      {experience.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">Experience</h2>
          </div>
          <div className="space-y-4">
            {experience.map((exp, idx) => (
              <div key={idx} className="border-l-2 border-primary-200 pl-4">
                <h3 className="font-semibold text-gray-900">{exp.title}</h3>
                <p className="text-sm text-gray-600">{exp.company}{exp.location ? ` • ${exp.location}` : ''}</p>
                {(exp.start_date || exp.end_date) && (
                  <p className="text-xs text-gray-400 mt-1">
                    {exp.start_date || '?'} — {exp.end_date || 'Present'}
                  </p>
                )}
                {exp.description && <p className="text-sm text-gray-500 mt-2">{exp.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {education.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <GraduationCap className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">Education</h2>
          </div>
          <div className="space-y-4">
            {education.map((edu, idx) => (
              <div key={idx} className="border-l-2 border-primary-200 pl-4">
                <h3 className="font-semibold text-gray-900">{edu.institution}</h3>
                <p className="text-sm text-gray-600">
                  {edu.degree}{edu.field_of_study ? ` in ${edu.field_of_study}` : ''}
                </p>
                {(edu.start_year || edu.end_year) && (
                  <p className="text-xs text-gray-400 mt-1">
                    {edu.start_year || '?'} — {edu.end_year || 'Present'}
                  </p>
                )}
                {edu.grade && (
                  <p className="text-xs text-gray-500 mt-1">Grade: {edu.grade}{edu.max_grade ? ` / ${edu.max_grade}` : ''}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* view_count is private — only profile owner can see it */}
    </div>
  );
}

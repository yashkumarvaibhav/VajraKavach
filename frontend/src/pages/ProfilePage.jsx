import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { User, Save, AlertCircle, Camera, Plus, Trash2, GraduationCap, Briefcase } from 'lucide-react';

export default function ProfilePage() {
  const { user, fetchUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await api.get('/users/me/profile');
      setProfile(res.data);
      setFullName(res.data.full_name || user?.full_name || '');
    } catch (err) {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    setError('');

    try {
      // Update name if changed
      if (fullName !== user?.full_name) {
        await api.put('/users/me', { full_name: fullName });
        await fetchUser(); // refresh auth context
      }

      // Update profile fields
      const res = await api.put('/users/me/profile', {
        headline: profile.headline,
        location: profile.location,
        bio: profile.bio,
        skills: profile.skills,
        education: profile.education || [],
        experience: profile.experience || [],
      });
      setProfile(res.data);
      setMessage('Profile updated successfully!');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setProfile({ ...profile, [field]: value });
  };

  /* ── Education helpers ── */
  const addEducation = () => {
    const edu = profile.education || [];
    handleChange('education', [...edu, { institution: '', degree: '', field_of_study: '', start_year: '', end_year: '', description: '' }]);
  };
  const updateEducation = (idx, key, val) => {
    const edu = [...(profile.education || [])];
    edu[idx] = { ...edu[idx], [key]: val };
    handleChange('education', edu);
  };
  const removeEducation = (idx) => {
    handleChange('education', (profile.education || []).filter((_, i) => i !== idx));
  };

  /* ── Experience helpers ── */
  const addExperience = () => {
    const exp = profile.experience || [];
    handleChange('experience', [...exp, { company: '', title: '', location: '', start_date: '', end_date: '', current: false, description: '' }]);
  };
  const updateExperience = (idx, key, val) => {
    const exp = [...(profile.experience || [])];
    exp[idx] = { ...exp[idx], [key]: val };
    handleChange('experience', exp);
  };
  const removeExperience = (idx) => {
    handleChange('experience', (profile.experience || []).filter((_, i) => i !== idx));
  };

  /* ── Profile picture ── */
  const handlePictureUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/users/me/profile-picture', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProfile(prev => ({ ...prev, profile_picture_url: res.data.url }));
      setMessage('Profile picture updated!');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to upload picture');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  const inputClass = "w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-8">
        <User className="h-8 w-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
      </div>

      {message && <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm">{message}</div>}
      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm flex items-center space-x-2"><AlertCircle className="h-4 w-4 shrink-0" /><span>{error}</span></div>}

      <div className="space-y-6">
        {/* ── Profile Picture + Basic Info ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start space-x-6">
            {/* Avatar */}
            <div className="relative group shrink-0">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 border-2 border-gray-100">
                {profile?.profile_picture_url ? (
                  <img src={profile.profile_picture_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <User className="h-10 w-10" />
                  </div>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition cursor-pointer"
              >
                <Camera className="h-6 w-6 text-white" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePictureUpload} />
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
                </div>
              )}
            </div>

            {/* Name + Email */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClass}
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
                <p className="px-4 py-2.5 bg-gray-50 rounded-lg text-gray-800 text-sm">{user?.email}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Headline</label>
                <input
                  type="text"
                  value={profile?.headline || ''}
                  onChange={(e) => handleChange('headline', e.target.value)}
                  className={inputClass}
                  placeholder="e.g., Software Engineer at Google"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input
                  type="text"
                  value={profile?.location || ''}
                  onChange={(e) => handleChange('location', e.target.value)}
                  className={inputClass}
                  placeholder="e.g., New Delhi, India"
                />
              </div>
            </div>
          </div>

          {/* Bio */}
          <div className="mt-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
            <textarea
              value={profile?.bio || ''}
              onChange={(e) => handleChange('bio', e.target.value)}
              rows={3}
              className={inputClass + ' resize-none'}
              placeholder="Tell us about yourself..."
            />
          </div>

          {/* Skills */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Skills (comma-separated)</label>
            <input
              type="text"
              value={(profile?.skills || []).join(', ')}
              onChange={(e) => handleChange('skills', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              className={inputClass}
              placeholder="e.g., Python, React, PostgreSQL"
            />
          </div>
        </div>

        {/* ── Education ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <GraduationCap className="h-5 w-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-gray-900">Education</h2>
            </div>
            <button onClick={addEducation} className="flex items-center space-x-1 text-sm text-primary-600 hover:text-primary-700 font-medium">
              <Plus className="h-4 w-4" />
              <span>Add</span>
            </button>
          </div>

          {(!profile?.education || profile.education.length === 0) && (
            <p className="text-sm text-gray-400 text-center py-4">No education entries yet. Click "Add" to start.</p>
          )}

          <div className="space-y-4">
            {(profile?.education || []).map((edu, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4 relative">
                <button onClick={() => removeEducation(idx)} className="absolute top-3 right-3 text-gray-400 hover:text-red-500 transition">
                  <Trash2 className="h-4 w-4" />
                </button>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Institution</label>
                    <input value={edu.institution || ''} onChange={(e) => updateEducation(idx, 'institution', e.target.value)} className={inputClass} placeholder="University name" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Degree</label>
                    <input value={edu.degree || ''} onChange={(e) => updateEducation(idx, 'degree', e.target.value)} className={inputClass} placeholder="e.g., B.Tech" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Field of Study</label>
                    <input value={edu.field_of_study || ''} onChange={(e) => updateEducation(idx, 'field_of_study', e.target.value)} className={inputClass} placeholder="e.g., Computer Science" />
                  </div>
                  <div className="flex space-x-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Start Year</label>
                      <input value={edu.start_year || ''} onChange={(e) => updateEducation(idx, 'start_year', e.target.value)} className={inputClass} placeholder="2022" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1">End Year</label>
                      <input value={edu.end_year || ''} onChange={(e) => updateEducation(idx, 'end_year', e.target.value)} className={inputClass} placeholder="2026" />
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                  <textarea value={edu.description || ''} onChange={(e) => updateEducation(idx, 'description', e.target.value)} rows={2} className={inputClass + ' resize-none'} placeholder="Relevant coursework, achievements..." />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Experience ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Briefcase className="h-5 w-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-gray-900">Experience</h2>
            </div>
            <button onClick={addExperience} className="flex items-center space-x-1 text-sm text-primary-600 hover:text-primary-700 font-medium">
              <Plus className="h-4 w-4" />
              <span>Add</span>
            </button>
          </div>

          {(!profile?.experience || profile.experience.length === 0) && (
            <p className="text-sm text-gray-400 text-center py-4">No experience entries yet. Click "Add" to start.</p>
          )}

          <div className="space-y-4">
            {(profile?.experience || []).map((exp, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4 relative">
                <button onClick={() => removeExperience(idx)} className="absolute top-3 right-3 text-gray-400 hover:text-red-500 transition">
                  <Trash2 className="h-4 w-4" />
                </button>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
                    <input value={exp.company || ''} onChange={(e) => updateExperience(idx, 'company', e.target.value)} className={inputClass} placeholder="Company name" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Job Title</label>
                    <input value={exp.title || ''} onChange={(e) => updateExperience(idx, 'title', e.target.value)} className={inputClass} placeholder="e.g., SDE Intern" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
                    <input value={exp.location || ''} onChange={(e) => updateExperience(idx, 'location', e.target.value)} className={inputClass} placeholder="e.g., Bangalore, India" />
                  </div>
                  <div className="flex space-x-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                      <input type="month" value={exp.start_date || ''} onChange={(e) => updateExperience(idx, 'start_date', e.target.value)} className={inputClass} />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
                      <input type="month" value={exp.end_date || ''} onChange={(e) => updateExperience(idx, 'end_date', e.target.value)} disabled={exp.current} className={inputClass + (exp.current ? ' opacity-50' : '')} />
                    </div>
                  </div>
                </div>
                <label className="flex items-center space-x-2 mt-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={exp.current || false} onChange={(e) => updateExperience(idx, 'current', e.target.checked)} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                  <span>Currently working here</span>
                </label>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                  <textarea value={exp.description || ''} onChange={(e) => updateExperience(idx, 'description', e.target.value)} rows={2} className={inputClass + ' resize-none'} placeholder="Describe your responsibilities and achievements..." />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center space-x-2 bg-primary-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-primary-700 transition disabled:opacity-50 shadow-sm"
          >
            <Save className="h-5 w-5" />
            <span>{saving ? 'Saving...' : 'Save All Changes'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

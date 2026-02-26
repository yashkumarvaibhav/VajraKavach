import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { User, Save, Plus, Trash2, GraduationCap, Briefcase, Globe, Lock, Users, Upload } from 'lucide-react';

const PRIVACY_OPTIONS = [
  { value: 'public', label: 'Public', icon: Globe },
  { value: 'connections', label: 'Connections Only', icon: Users },
  { value: 'private', label: 'Private', icon: Lock },
];

function PrivacySelect({ value, onChange }) {
  return (
    <select value={value || 'public'} onChange={(e) => onChange(e.target.value)}
      className="text-xs border border-gray-200 rounded px-2 py-1 bg-gray-50">
      {PRIVACY_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

function CharCount({ current, max }) {
  const pct = (current / max) * 100;
  return (
    <span className={`text-xs ${pct > 90 ? 'text-red-500' : pct > 70 ? 'text-yellow-500' : 'text-gray-400'}`}>
      {current}/{max}
    </span>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState({
    headline: '', bio: '', location: '', website: '',
    skills: '', profile_picture_url: '',
  });
  const [education, setEducation] = useState([]);
  const [experience, setExperience] = useState([]);
  const [privacy, setPrivacy] = useState({
    headline: 'public', bio: 'public', location: 'public',
    education: 'public', experience: 'public', skills: 'public',
  });
  const [saving, setSaving] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [viewCount, setViewCount] = useState(0);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('/users/me/profile');
        const data = res.data || {};
        setProfile({
          headline: data.headline || '',
          bio: data.bio || '',
          location: data.location || '',
          website: data.website || '',
          skills: Array.isArray(data.skills) ? data.skills.join(', ') : (data.skills || ''),
          profile_picture_url: data.profile_picture_url || '',
        });
        setEducation(data.education || []);
        setExperience(data.experience || []);
        if (data.privacy_settings) {
          setPrivacy(prev => ({ ...prev, ...data.privacy_settings }));
        }
        setViewCount(data.view_count || 0);
      } catch (err) {
        console.error('Profile fetch error:', err);
      }
    };
    if (user?.id) fetchProfile();
  }, [user]);

  const showMsg = (text, isError = false) => {
    if (isError) { setError(text); setMessage(''); }
    else { setMessage(text); setError(''); }
    setTimeout(() => { setMessage(''); setError(''); }, 3000);
  };

  const saveProfile = async () => {
    setSaving(prev => ({ ...prev, profile: true }));
    try {
      const skills = profile.skills
        ? profile.skills.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      await api.put('/users/me/profile', {
        headline: profile.headline,
        bio: profile.bio,
        location: profile.location,
        website: profile.website,
        skills,
        privacy_settings: privacy,
      });
      showMsg('Profile saved!');
    } catch (err) {
      showMsg(err.response?.data?.detail || 'Failed to save profile', true);
    } finally {
      setSaving(prev => ({ ...prev, profile: false }));
    }
  };

  const saveEducation = async () => {
    setSaving(prev => ({ ...prev, education: true }));
    try {
      // Validate education entries
      for (const edu of education) {
        if (edu.start_year && edu.end_year && Number(edu.start_year) > Number(edu.end_year)) {
          showMsg('Start year cannot be later than end year in education entries', true);
          setSaving(prev => ({ ...prev, education: false }));
          return;
        }
        const grade = parseFloat(edu.grade);
        const maxGrade = parseFloat(edu.max_grade);
        if (edu.grade && grade < 0) {
          showMsg('Grade cannot be negative', true);
          setSaving(prev => ({ ...prev, education: false }));
          return;
        }
        if (edu.grade && edu.max_grade && grade > maxGrade) {
          showMsg('Grade cannot exceed max grade', true);
          setSaving(prev => ({ ...prev, education: false }));
          return;
        }
      }
      await api.put('/users/me/profile', { education });
      showMsg('Education saved!');
    } catch (err) {
      showMsg(err.response?.data?.detail || 'Failed to save education', true);
    } finally {
      setSaving(prev => ({ ...prev, education: false }));
    }
  };

  const saveExperience = async () => {
    // Validate dates
    for (const exp of experience) {
      if (exp.start_date && exp.end_date && exp.start_date >= exp.end_date) {
        showMsg('Start date must be before end date in experience entries', true);
        return;
      }
    }
    setSaving(prev => ({ ...prev, experience: true }));
    try {
      await api.put('/users/me/profile', { experience });
      showMsg('Experience saved!');
    } catch (err) {
      showMsg(err.response?.data?.detail || 'Failed to save experience', true);
    } finally {
      setSaving(prev => ({ ...prev, experience: false }));
    }
  };

  const addEducation = () => {
    setEducation([...education, {
      institution: '', degree: '', field_of_study: '',
      start_year: '', end_year: '', grade: '', max_grade: '',
    }]);
  };

  const addExperience = () => {
    setExperience([...experience, {
      company: '', title: '', location: '',
      start_date: '', end_date: '', description: '',
    }]);
  };

  const updateEducation = (idx, field, value) => {
    setEducation(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  };

  const updateExperience = (idx, field, value) => {
    setExperience(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  };

  const removeEducation = (idx) => setEducation(prev => prev.filter((_, i) => i !== idx));
  const removeExperience = (idx) => setExperience(prev => prev.filter((_, i) => i !== idx));

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <User className="h-8 w-8 text-primary-600" />
          <h1 className="text-3xl font-bold text-gray-900">Profile</h1>
        </div>
        <span className="text-sm text-gray-400">{viewCount} profile views</span>
      </div>

      {message && <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm">{message}</div>}
      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>}

      {/* Basic Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Basic Information</h2>
          <button onClick={saveProfile} disabled={saving.profile}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition disabled:opacity-50">
            <Save className="h-4 w-4" />
            {saving.profile ? 'Saving...' : 'Save'}
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">Headline</label>
              <div className="flex items-center gap-2">
                <CharCount current={profile.headline.length} max={255} />
                <PrivacySelect value={privacy.headline} onChange={(v) => setPrivacy(p => ({ ...p, headline: v }))} />
              </div>
            </div>
            <input type="text" value={profile.headline}
              onChange={(e) => setProfile(p => ({ ...p, headline: e.target.value.slice(0, 255) }))}
              className={inputClass} placeholder="e.g., Software Engineer at Google" maxLength={255} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">Bio</label>
              <div className="flex items-center gap-2">
                <CharCount current={profile.bio.length} max={5000} />
                <PrivacySelect value={privacy.bio} onChange={(v) => setPrivacy(p => ({ ...p, bio: v }))} />
              </div>
            </div>
            <textarea value={profile.bio}
              onChange={(e) => setProfile(p => ({ ...p, bio: e.target.value.slice(0, 5000) }))}
              className={inputClass + " h-24 resize-none"} placeholder="Tell us about yourself..." maxLength={5000} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-gray-700">Location</label>
                <PrivacySelect value={privacy.location} onChange={(v) => setPrivacy(p => ({ ...p, location: v }))} />
              </div>
              <input type="text" value={profile.location}
                onChange={(e) => setProfile(p => ({ ...p, location: e.target.value }))}
                className={inputClass} placeholder="City, Country" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Website</label>
              <input type="url" value={profile.website}
                onChange={(e) => setProfile(p => ({ ...p, website: e.target.value }))}
                className={inputClass} placeholder="https://..." />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">Skills (comma-separated)</label>
              <PrivacySelect value={privacy.skills} onChange={(v) => setPrivacy(p => ({ ...p, skills: v }))} />
            </div>
            <input type="text" value={profile.skills}
              onChange={(e) => setProfile(p => ({ ...p, skills: e.target.value }))}
              className={inputClass} placeholder="Python, React, Machine Learning" />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Profile Picture</label>
            {profile.profile_picture_url && (
              <div className="mb-2 flex items-center gap-3">
                <img src={profile.profile_picture_url} alt="Profile" className="w-16 h-16 rounded-full object-cover border-2 border-gray-200" />
                <span className="text-xs text-green-600">Current photo</span>
              </div>
            )}
            <label className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition text-sm text-gray-600">
              <Upload className="h-4 w-4" />
              Upload Profile Picture
              <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) { showMsg('Image too large. Max 2MB.', true); return; }
                const formData = new FormData();
                formData.append('file', file);
                try {
                  const res = await api.post('/users/me/profile-picture', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                  setProfile(p => ({ ...p, profile_picture_url: res.data?.url || res.data?.profile_picture_url || '' }));
                  showMsg('Profile picture uploaded!');
                } catch (err) {
                  showMsg(err.response?.data?.detail || 'Upload failed', true);
                }
              }} />
            </label>
            <p className="text-xs text-gray-400 mt-1">JPG, PNG, or GIF. Max 2MB.</p>
          </div>
        </div>
      </div>

      {/* Education */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">Education</h2>
            <PrivacySelect value={privacy.education} onChange={(v) => setPrivacy(p => ({ ...p, education: v }))} />
          </div>
          <div className="flex gap-2">
            <button onClick={addEducation}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
            <button onClick={saveEducation} disabled={saving.education}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> {saving.education ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {education.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">No education added yet</p>
        ) : (
          <div className="space-y-4">
            {education.map((edu, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4 relative">
                <button onClick={() => removeEducation(idx)}
                  className="absolute top-3 right-3 p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                  <Trash2 className="h-4 w-4" />
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500">Institution</label>
                    <input type="text" value={edu.institution || ''} onChange={(e) => updateEducation(idx, 'institution', e.target.value)}
                      className={inputClass} placeholder="University Name" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Degree</label>
                    <input type="text" value={edu.degree || ''} onChange={(e) => updateEducation(idx, 'degree', e.target.value)}
                      className={inputClass} placeholder="B.Tech" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Field of Study</label>
                    <input type="text" value={edu.field_of_study || ''} onChange={(e) => updateEducation(idx, 'field_of_study', e.target.value)}
                      className={inputClass} placeholder="Computer Science" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Start Year</label>
                    <input type="number" value={edu.start_year || ''} onChange={(e) => updateEducation(idx, 'start_year', e.target.value)}
                      className={inputClass} placeholder="2020" min="1950" max="2030" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">End Year</label>
                    <input type="number" value={edu.end_year || ''} onChange={(e) => updateEducation(idx, 'end_year', e.target.value)}
                      className={inputClass} placeholder="2024" min="1950" max="2035" />
                    {edu.start_year && edu.end_year && Number(edu.start_year) > Number(edu.end_year) && (
                      <p className="text-xs text-red-500 mt-1">Start year cannot be later than end year</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Grade / GPA</label>
                    <input type="number" step="0.01" min="0" value={edu.grade || ''} onChange={(e) => updateEducation(idx, 'grade', e.target.value)}
                      className={inputClass} placeholder="9.2" />
                    {edu.grade && parseFloat(edu.grade) < 0 && (
                      <p className="text-xs text-red-500 mt-1">Grade cannot be negative</p>
                    )}
                    {edu.grade && edu.max_grade && parseFloat(edu.grade) > parseFloat(edu.max_grade) && (
                      <p className="text-xs text-red-500 mt-1">Grade exceeds max grade</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Max Grade / Scale</label>
                    <input type="number" step="0.01" min="0" value={edu.max_grade || ''} onChange={(e) => updateEducation(idx, 'max_grade', e.target.value)}
                      className={inputClass} placeholder="10" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Experience */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">Experience</h2>
            <PrivacySelect value={privacy.experience} onChange={(v) => setPrivacy(p => ({ ...p, experience: v }))} />
          </div>
          <div className="flex gap-2">
            <button onClick={addExperience}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
            <button onClick={saveExperience} disabled={saving.experience}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> {saving.experience ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {experience.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">No experience added yet</p>
        ) : (
          <div className="space-y-4">
            {experience.map((exp, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4 relative">
                <button onClick={() => removeExperience(idx)}
                  className="absolute top-3 right-3 p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                  <Trash2 className="h-4 w-4" />
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">Company</label>
                    <input type="text" value={exp.company || ''} onChange={(e) => updateExperience(idx, 'company', e.target.value)}
                      className={inputClass} placeholder="Company Name" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Title</label>
                    <input type="text" value={exp.title || ''} onChange={(e) => updateExperience(idx, 'title', e.target.value)}
                      className={inputClass} placeholder="Software Engineer" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Location</label>
                    <input type="text" value={exp.location || ''} onChange={(e) => updateExperience(idx, 'location', e.target.value)}
                      className={inputClass} placeholder="City, Country" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500">Description</label>
                    <textarea value={exp.description || ''} onChange={(e) => updateExperience(idx, 'description', e.target.value)}
                      className={inputClass + " h-16 resize-none"} placeholder="What did you do?" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Start Date</label>
                    <input type="date" value={exp.start_date || ''} onChange={(e) => updateExperience(idx, 'start_date', e.target.value)}
                      className={inputClass} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">End Date</label>
                    <input type="date" value={exp.end_date || ''} onChange={(e) => updateExperience(idx, 'end_date', e.target.value)}
                      className={inputClass} min={exp.start_date || ''} />
                    {exp.start_date && exp.end_date && exp.start_date >= exp.end_date && (
                      <p className="text-xs text-red-500 mt-1">End date must be after start date</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

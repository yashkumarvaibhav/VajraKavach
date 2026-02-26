import { useState } from 'react';
import { Flag } from 'lucide-react';
import api from '../services/api';

const CATEGORIES = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'fraud', label: 'Fraud / Scam' },
  { value: 'inappropriate', label: 'Inappropriate Content' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'other', label: 'Other' },
];

export default function ReportButton({ reportedUserId, resourceType, resourceId, className = '' }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('spam');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!description.trim() || description.trim().length < 5) {
      alert('Please provide a description (at least 5 characters)');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/reports/', {
        reported_user_id: reportedUserId || null,
        category,
        description: description.trim(),
        resource_type: resourceType || null,
        resource_id: resourceId || null,
      });
      setDone(true);
      setTimeout(() => { setOpen(false); setDone(false); setDescription(''); }, 2000);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)}
        className={`text-gray-400 hover:text-red-500 transition ${className}`}
        title="Report">
        <Flag className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            {done ? (
              <div className="text-center py-4">
                <p className="text-green-600 font-medium">Report submitted successfully!</p>
                <p className="text-sm text-gray-500 mt-1">An admin will review it shortly.</p>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Flag className="h-5 w-5 text-red-500" /> Report
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Category</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none bg-white">
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Description</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe the issue..."
                      maxLength={2000}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-24 resize-none focus:ring-2 focus:ring-red-500 outline-none" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={submit} disabled={submitting}
                      className="flex-1 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition disabled:opacity-50">
                      {submitting ? 'Submitting...' : 'Submit Report'}
                    </button>
                    <button onClick={() => setOpen(false)}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                      Cancel
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

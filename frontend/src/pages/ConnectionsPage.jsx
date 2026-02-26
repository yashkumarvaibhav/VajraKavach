import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Users, UserPlus, UserCheck, UserX, Search, Clock, CheckCircle, XCircle } from 'lucide-react';

export default function ConnectionsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('connections');
  const [connections, setConnections] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [userCache, setUserCache] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [connRes, pendingRes] = await Promise.all([
        api.get('/users/connections'),
        api.get('/users/connections/pending'),
      ]);
      setConnections(connRes.data);
      setPendingRequests(pendingRes.data);

      // Fetch user details for all connection IDs
      const userIds = new Set();
      connRes.data.forEach(c => {
        userIds.add(c.requester_id);
        userIds.add(c.addressee_id);
      });
      pendingRes.data.forEach(c => {
        userIds.add(c.requester_id);
      });
      userIds.delete(user.id);

      const userDetails = {};
      await Promise.all(
        Array.from(userIds).map(async (uid) => {
          try {
            const res = await api.get(`/users/${uid}/profile`);
            userDetails[uid] = res.data;
          } catch (_) {
            userDetails[uid] = { full_name: 'Unknown User', email: '' };
          }
        })
      );
      setUserCache(prev => ({ ...prev, ...userDetails }));
    } catch (err) {
      setError('Failed to load connections');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      const res = await api.get(`/users/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(res.data);
    } catch (err) {
      setError('Search failed');
    }
  };

  const sendRequest = async (addresseeId) => {
    try {
      await api.post('/users/connections', { addressee_id: addresseeId });
      setMessage('Connection request sent!');
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send request');
      setTimeout(() => setError(''), 3000);
    }
  };

  const acceptRequest = async (connectionId) => {
    try {
      await api.put(`/users/connections/${connectionId}/accept`);
      setMessage('Connection accepted!');
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to accept');
      setTimeout(() => setError(''), 3000);
    }
  };

  const removeConnection = async (connectionId) => {
    try {
      await api.delete(`/users/connections/${connectionId}`);
      setMessage('Connection removed');
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove');
      setTimeout(() => setError(''), 3000);
    }
  };

  const getOtherUser = (conn) => {
    const otherId = conn.requester_id === user.id ? conn.addressee_id : conn.requester_id;
    return userCache[otherId] || { full_name: 'Loading...', email: '' };
  };

  const tabs = [
    { id: 'connections', label: 'My Connections', count: connections.length },
    { id: 'pending', label: 'Pending Requests', count: pendingRequests.length },
    { id: 'find', label: 'Find People' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Users className="h-8 w-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">Connections</h1>
      </div>

      {message && <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm">{message}</div>}
      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>}

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition flex items-center gap-2 ${
              activeTab === tab.id ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}>
            {tab.label}
            {tab.count !== undefined && <span className="px-1.5 py-0.5 text-xs bg-primary-100 text-primary-700 rounded-full">{tab.count}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <>
          {/* My Connections */}
          {activeTab === 'connections' && (
            <div className="space-y-3">
              {connections.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>No connections yet. Find people to connect with!</p>
                </div>
              ) : connections.map(conn => {
                const other = getOtherUser(conn);
                return (
                  <div key={conn.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center font-semibold text-sm">
                        {(other.full_name || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{other.full_name}</p>
                        <p className="text-sm text-gray-500">{other.headline || other.email}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="h-3 w-3" /> Connected</span>
                      <button onClick={() => removeConnection(conn.id)}
                        className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50 transition">
                        <UserX className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pending Requests */}
          {activeTab === 'pending' && (
            <div className="space-y-3">
              {pendingRequests.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>No pending connection requests</p>
                </div>
              ) : pendingRequests.map(conn => {
                const requester = userCache[conn.requester_id] || { full_name: 'Unknown' };
                return (
                  <div key={conn.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-yellow-100 text-yellow-700 rounded-full flex items-center justify-center font-semibold text-sm">
                        {(requester.full_name || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{requester.full_name}</p>
                        <p className="text-xs text-gray-400">Sent {new Date(conn.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => acceptRequest(conn.id)}
                        className="flex items-center gap-1 text-xs bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition">
                        <UserCheck className="h-3 w-3" /> Accept
                      </button>
                      <button onClick={() => removeConnection(conn.id)}
                        className="flex items-center gap-1 text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition">
                        <XCircle className="h-3 w-3" /> Decline
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Find People */}
          {activeTab === 'find' && (
            <div>
              <form onSubmit={handleSearch} className="flex gap-3 mb-6">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input type="text" placeholder="Search by name or email..." value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
                </div>
                <button type="submit" className="bg-primary-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-700 transition">
                  Search
                </button>
              </form>

              <div className="space-y-3">
                {searchResults.length === 0 && searchQuery && (
                  <p className="text-center text-gray-500 py-8">No users found for "{searchQuery}"</p>
                )}
                {searchResults.map(u => (
                  <div key={u.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-semibold text-sm">
                        {(u.full_name || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{u.full_name}</p>
                        <p className="text-sm text-gray-500">{u.email}</p>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full uppercase">{u.role}</span>
                      </div>
                    </div>
                    <button onClick={() => sendRequest(u.id)}
                      className="flex items-center gap-1 text-xs bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition">
                      <UserPlus className="h-3 w-3" /> Connect
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

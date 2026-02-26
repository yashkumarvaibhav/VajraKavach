import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Users, Search, UserPlus, UserCheck, Clock, Send, Network, X, Trash2 } from 'lucide-react';

/** Simple force-directed SVG graph for connection visualization */
function NetworkGraph({ nodes, edges, currentUserId, userName }) {
  const svgRef = useRef(null);
  const [positions, setPositions] = useState([]);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    if (!nodes || nodes.length === 0) return;

    const width = 700, height = 450;
    const cx = width / 2, cy = height / 2;

    // Place center user at middle, connections in a circle around
    const allNodes = [
      { id: currentUserId, name: userName || 'You', isCenter: true },
      ...nodes.filter(n => n.id !== currentUserId),
    ];

    const angleStep = (2 * Math.PI) / Math.max(allNodes.length - 1, 1);
    const radius = Math.min(width, height) * 0.35;

    const pos = allNodes.map((node, i) => {
      if (node.isCenter || i === 0) {
        return { ...node, x: cx, y: cy };
      }
      const angle = angleStep * (i - 1) - Math.PI / 2;
      return {
        ...node,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    });

    setPositions(pos);
  }, [nodes, currentUserId, userName]);

  if (positions.length === 0) return null;

  const posMap = {};
  positions.forEach(p => { posMap[p.id] = p; });

  const edgeLines = (edges || []).map((edge, i) => {
    const from = posMap[edge.from] || posMap[edge.source];
    const to = posMap[edge.to] || posMap[edge.target];
    if (!from || !to) return null;
    return (
      <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
        stroke="#cbd5e1" strokeWidth="1.5" opacity="0.7" />
    );
  }).filter(Boolean);

  // If no edges provided, draw lines from center to all
  const fallbackEdges = (!edges || edges.length === 0) ? positions.slice(1).map((p, i) => (
    <line key={`fb-${i}`} x1={positions[0].x} y1={positions[0].y} x2={p.x} y2={p.y}
      stroke="#cbd5e1" strokeWidth="1.5" opacity="0.6" />
  )) : [];

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Network ({nodes.length} connections)</h3>
      <svg ref={svgRef} viewBox="0 0 700 450" className="w-full border border-gray-100 rounded-lg bg-gradient-to-br from-gray-50 to-white">
        {edgeLines.length > 0 ? edgeLines : fallbackEdges}
        {positions.map((node) => (
          <g key={node.id}
             onMouseEnter={() => setHovered(node.id)}
             onMouseLeave={() => setHovered(null)}
             style={{ cursor: 'pointer' }}>
            <circle cx={node.x} cy={node.y}
              r={node.isCenter ? 28 : 22}
              fill={node.isCenter ? '#4f46e5' : hovered === node.id ? '#6366f1' : '#818cf8'}
              stroke="white" strokeWidth="3"
              className="transition-all duration-200"
            />
            <text x={node.x} y={node.y + 1} textAnchor="middle" dominantBaseline="central"
              fill="white" fontSize={node.isCenter ? 14 : 11} fontWeight="bold">
              {(node.name || '?')[0].toUpperCase()}
            </text>
            <text x={node.x} y={node.y + (node.isCenter ? 40 : 34)} textAnchor="middle"
              fill="#374151" fontSize="11" fontWeight="500">
              {node.isCenter ? 'You' : (node.name || 'Unknown')}
            </text>
            {node.mutual_count > 0 && !node.isCenter && (
              <text x={node.x} y={node.y + 46} textAnchor="middle"
                fill="#9ca3af" fontSize="9">
                {node.mutual_count} mutual
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function ConnectionsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('connections');
  const [connections, setConnections] = useState([]);
  const [pending, setPending] = useState([]);
  const [sent, setSent] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [graph, setGraph] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [connRes, pendRes, sentRes] = await Promise.all([
        api.get('/users/connections'),
        api.get('/users/connections/pending'),
        api.get('/users/connections/sent'),
      ]);
      setConnections((connRes.data || []).filter(c => c.status === 'accepted'));
      setPending(pendRes.data || []);
      setSent(sentRes.data || []);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.get(`/users/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(res.data || []);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = async (userId) => {
    try {
      await api.post('/users/connections', { addressee_id: userId });
      setSearchResults(prev =>
        prev.map(u => u.id === userId ? { ...u, connection_status: 'pending' } : u)
      );
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to send request');
    }
  };

  const respondRequest = async (connId, accept) => {
    try {
      if (accept) {
        await api.put(`/users/connections/${connId}/accept`);
      } else {
        await api.delete(`/users/connections/${connId}`);
      }
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to respond');
    }
  };

  const removeConnection = async (connId) => {
    if (!confirm('Remove this connection?')) return;
    try {
      await api.delete(`/users/connections/${connId}`);
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to remove connection');
    }
  };

  const fetchGraph = async () => {
    try {
      const res = await api.get('/users/connections/graph');
      setGraph(res.data);
    } catch (err) {
      console.error('Graph error:', err);
    }
  };

  useEffect(() => {
    if (tab === 'graph' && !graph) fetchGraph();
  }, [tab]);

  const getPartnerInfo = (conn) => {
    const isRequester = conn.requester_id === user?.id;
    return {
      id: isRequester ? conn.addressee_id : conn.requester_id,
      name: isRequester ? conn.addressee_name : conn.requester_name,
      headline: isRequester ? conn.addressee_headline : conn.requester_headline,
      picture: isRequester ? conn.addressee_picture : conn.requester_picture,
    };
  };

  const PersonCard = ({ name, headline, picture, actions }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center space-x-4">
      <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden flex-shrink-0">
        {picture ? (
          <img src={picture} alt="" className="w-12 h-12 rounded-full object-cover" />
        ) : (
          <span className="text-primary-600 font-bold text-lg">{(name || '?')[0].toUpperCase()}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate">{name || 'Unknown User'}</p>
        {headline && <p className="text-sm text-gray-500 truncate">{headline}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );

  const tabDefs = [
    { key: 'connections', label: 'Connections', icon: UserCheck, count: connections.length },
    { key: 'pending', label: 'Pending', icon: Clock, count: pending.length },
    { key: 'sent', label: 'Sent', icon: Send, count: sent.length },
    { key: 'search', label: 'Find People', icon: Search },
    { key: 'graph', label: 'Network', icon: Network },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center space-x-3 mb-6">
        <Users className="h-8 w-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">Connections</h1>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-6 overflow-x-auto">
        {tabDefs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition whitespace-nowrap ${
              tab === t.key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.count !== undefined && <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-200 rounded-full">{t.count}</span>}
          </button>
        ))}
      </div>

      {loading && tab !== 'search' && tab !== 'graph' ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <>
          {/* Connections Tab */}
          {tab === 'connections' && (
            <div className="space-y-3">
              {connections.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No connections yet. Find people to connect with!</p>
                </div>
              ) : connections.map(conn => {
                const p = getPartnerInfo(conn);
                return <PersonCard key={conn.id} name={p.name} headline={p.headline} picture={p.picture}
                  actions={
                    <button onClick={() => removeConnection(conn.id)}
                      className="px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded-lg hover:bg-red-200 transition">
                      Remove
                    </button>
                  }
                />;
              })}
            </div>
          )}

          {/* Pending Tab */}
          {tab === 'pending' && (
            <div className="space-y-3">
              {pending.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No pending requests</p>
                </div>
              ) : pending.map(conn => (
                <PersonCard key={conn.id}
                  name={conn.requester_name}
                  headline={conn.requester_headline}
                  picture={conn.requester_picture}
                  actions={
                    <>
                      <button onClick={() => respondRequest(conn.id, true)}
                        className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition">Accept</button>
                      <button onClick={() => respondRequest(conn.id, false)}
                        className="px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded-lg hover:bg-red-200 transition">Decline</button>
                    </>
                  }
                />
              ))}
            </div>
          )}

          {/* Sent Tab */}
          {tab === 'sent' && (
            <div className="space-y-3">
              {sent.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Send className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No sent requests</p>
                </div>
              ) : sent.map(conn => (
                <PersonCard key={conn.id}
                  name={conn.addressee_name}
                  headline={conn.addressee_headline}
                  picture={conn.addressee_picture}
                  actions={
                    <span className="px-3 py-1.5 bg-yellow-50 text-yellow-700 text-sm rounded-lg font-medium">Pending</span>
                  }
                />
              ))}
            </div>
          )}

          {/* Search Tab */}
          {tab === 'search' && (
            <div>
              <div className="flex gap-2 mb-6">
                <input
                  type="text" value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search by name or email..."
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                />
                <button onClick={handleSearch} disabled={searching}
                  className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50">
                  {searching ? 'Searching...' : 'Search'}
                </button>
              </div>
              <div className="space-y-3">
                {searchResults.map(u => (
                  <PersonCard key={u.id}
                    name={u.full_name}
                    headline={u.headline}
                    picture={u.profile_picture_url}
                    actions={
                      u.connection_status === 'accepted' ? (
                        <span className="px-3 py-1.5 bg-green-50 text-green-700 text-sm rounded-lg font-medium flex items-center gap-1">
                          <UserCheck className="h-3.5 w-3.5" /> Connected
                        </span>
                      ) : u.connection_status === 'pending' ? (
                        <span className="px-3 py-1.5 bg-yellow-50 text-yellow-700 text-sm rounded-lg font-medium flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> Pending
                        </span>
                      ) : (
                        <button onClick={() => sendRequest(u.id)}
                          className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition flex items-center gap-1">
                          <UserPlus className="h-3.5 w-3.5" /> Connect
                        </button>
                      )
                    }
                  />
                ))}
                {searchResults.length === 0 && searchQuery && !searching && (
                  <div className="text-center py-8 text-gray-400">No results found</div>
                )}
              </div>
            </div>
          )}

          {/* Graph Tab */}
          {tab === 'graph' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              {!graph ? (
                <div className="text-center py-12 text-gray-400">Loading network graph...</div>
              ) : (!graph.nodes || graph.nodes.length === 0) ? (
                <div className="text-center py-12 text-gray-400">
                  <Network className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No connections in your network yet</p>
                </div>
              ) : (
                <NetworkGraph nodes={graph.nodes} edges={graph.edges} currentUserId={user?.id} userName={user?.full_name} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Users, Search, UserPlus, UserCheck, Clock, Send, Network, X, Trash2 } from 'lucide-react';
import Pagination from '../components/Pagination';

/** Enhanced force-directed SVG graph for connection visualization */
function NetworkGraph({ nodes, edges, currentUserId, userName, onNodeClick }) {
  const svgRef = useRef(null);
  const [positions, setPositions] = useState([]);
  const [hovered, setHovered] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    if (!nodes || nodes.length === 0) return;

    const width = 700, height = 500;
    const cx = width / 2, cy = height / 2;

    // Build node list with center user first
    const allNodes = [
      { id: currentUserId, name: userName || 'You', isCenter: true, role: 'self' },
      ...nodes.filter(n => n.id !== currentUserId).map(n => ({ ...n, isCenter: false })),
    ];

    // Count connections per node for sizing
    const edgeCount = {};
    (edges || []).forEach(e => {
      edgeCount[e.from] = (edgeCount[e.from] || 0) + 1;
      edgeCount[e.to] = (edgeCount[e.to] || 0) + 1;
    });

    // Identify mutual edges (edges between non-center nodes)
    const mutualEdgeSet = new Set();
    (edges || []).forEach(e => {
      if (e.from !== currentUserId && e.to !== currentUserId) {
        mutualEdgeSet.add(`${e.from}-${e.to}`);
        mutualEdgeSet.add(`${e.to}-${e.from}`);
      }
    });

    // Count mutual connections per node
    allNodes.forEach(n => {
      if (!n.isCenter) {
        let mc = 0;
        allNodes.forEach(other => {
          if (other.id !== n.id && !other.isCenter) {
            if (mutualEdgeSet.has(`${n.id}-${other.id}`)) mc++;
          }
        });
        n.mutual_count = mc;
      }
    });

    // Force-directed layout: initialize with circle, then simulate
    const angleStep = (2 * Math.PI) / Math.max(allNodes.length - 1, 1);
    const radius = Math.min(width, height) * 0.32;

    let pos = allNodes.map((node, i) => {
      if (node.isCenter || i === 0) {
        return { ...node, x: cx, y: cy, vx: 0, vy: 0 };
      }
      const angle = angleStep * (i - 1) - Math.PI / 2;
      return {
        ...node,
        x: cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 20,
        y: cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 20,
        vx: 0, vy: 0,
      };
    });

    // Build edge lookup for force simulation
    const edgeList = (edges || []).length > 0 ? edges : allNodes.slice(1).map(n => ({ from: currentUserId, to: n.id }));
    const nodeIdx = {};
    pos.forEach((n, i) => { nodeIdx[n.id] = i; });

    // Simple force simulation (50 iterations)
    const repulsion = 8000;
    const attraction = 0.005;
    const centerGravity = 0.01;
    const damping = 0.85;

    for (let iter = 0; iter < 60; iter++) {
      // Repulsion between all nodes
      for (let i = 0; i < pos.length; i++) {
        for (let j = i + 1; j < pos.length; j++) {
          const dx = pos[i].x - pos[j].x;
          const dy = pos[i].y - pos[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = repulsion / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (!pos[i].isCenter) { pos[i].vx += fx; pos[i].vy += fy; }
          if (!pos[j].isCenter) { pos[j].vx -= fx; pos[j].vy -= fy; }
        }
      }

      // Attraction along edges
      edgeList.forEach(e => {
        const si = nodeIdx[e.from];
        const ti = nodeIdx[e.to];
        if (si === undefined || ti === undefined) return;
        const dx = pos[ti].x - pos[si].x;
        const dy = pos[ti].y - pos[si].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const isMutual = e.from !== currentUserId && e.to !== currentUserId;
        const str = isMutual ? attraction * 1.5 : attraction;
        const fx = dx * str;
        const fy = dy * str;
        if (!pos[si].isCenter) { pos[si].vx += fx; pos[si].vy += fy; }
        if (!pos[ti].isCenter) { pos[ti].vx -= fx; pos[ti].vy -= fy; }
      });

      // Center gravity
      pos.forEach(n => {
        if (!n.isCenter) {
          n.vx += (cx - n.x) * centerGravity;
          n.vy += (cy - n.y) * centerGravity;
        }
      });

      // Apply velocities with damping and boundary clamping
      pos.forEach(n => {
        if (!n.isCenter) {
          n.vx *= damping;
          n.vy *= damping;
          n.x += n.vx;
          n.y += n.vy;
          n.x = Math.max(40, Math.min(width - 40, n.x));
          n.y = Math.max(40, Math.min(height - 40, n.y));
        }
      });
    }

    setPositions(pos);
  }, [nodes, edges, currentUserId, userName]);

  if (positions.length === 0) return null;

  const posMap = {};
  positions.forEach(p => { posMap[p.id] = p; });

  // Classify edges: direct (to center) vs mutual (between connections)
  const processedEdges = (edges || []).map((edge, i) => {
    const from = posMap[edge.from];
    const to = posMap[edge.to];
    if (!from || !to) return null;
    const isDirect = edge.from === currentUserId || edge.to === currentUserId;
    return { from, to, isDirect, key: i };
  }).filter(Boolean);

  // Fallback: draw lines from center to all if no edges
  const fallbackEdges = processedEdges.length === 0 ? positions.slice(1).map((p, i) => ({
    from: positions[0], to: p, isDirect: true, key: `fb-${i}`
  })) : [];

  const allEdges = processedEdges.length > 0 ? processedEdges : fallbackEdges;

  // Stats
  const totalConnections = nodes.filter(n => n.id !== currentUserId).length;
  const mutualEdgeCount = allEdges.filter(e => !e.isDirect).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Your Network</h3>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-indigo-600 inline-block"></span>
            You
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-indigo-400 inline-block"></span>
            {totalConnections} connection{totalConnections !== 1 ? 's' : ''}
          </span>
          {mutualEdgeCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-6 h-0.5 bg-emerald-400 inline-block rounded"></span>
              {mutualEdgeCount} mutual link{mutualEdgeCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
      <svg ref={svgRef} viewBox="0 0 700 500" className="w-full border border-gray-100 rounded-lg bg-gradient-to-br from-slate-50 via-white to-indigo-50"
        style={{ minHeight: '400px' }}>
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <radialGradient id="centerGrad" cx="40%" cy="40%">
            <stop offset="0%" stopColor="#818cf8"/>
            <stop offset="100%" stopColor="#4338ca"/>
          </radialGradient>
          <radialGradient id="nodeGrad" cx="40%" cy="40%">
            <stop offset="0%" stopColor="#a5b4fc"/>
            <stop offset="100%" stopColor="#6366f1"/>
          </radialGradient>
          <radialGradient id="nodeHoverGrad" cx="40%" cy="40%">
            <stop offset="0%" stopColor="#c7d2fe"/>
            <stop offset="100%" stopColor="#4f46e5"/>
          </radialGradient>
        </defs>

        {/* Draw edges */}
        {allEdges.map((edge) => (
          <line key={edge.key}
            x1={edge.from.x} y1={edge.from.y} x2={edge.to.x} y2={edge.to.y}
            stroke={edge.isDirect ? '#c7d2fe' : '#6ee7b7'}
            strokeWidth={edge.isDirect ? 1.5 : 2}
            strokeDasharray={edge.isDirect ? 'none' : '6 3'}
            opacity={0.7}
          />
        ))}

        {/* Draw nodes */}
        {positions.map((node) => {
          const nodeConns = (edges || []).filter(e => e.from === node.id || e.to === node.id).length;
          const baseR = node.isCenter ? 30 : Math.min(26, 18 + nodeConns * 2);
          const isHovered = hovered === node.id;

          return (
            <g key={node.id}
               onMouseEnter={() => { setHovered(node.id); setTooltip(node); }}
               onMouseLeave={() => { setHovered(null); setTooltip(null); }}
               onClick={() => !node.isCenter && onNodeClick && onNodeClick(node.id)}
               style={{ cursor: node.isCenter ? 'default' : 'pointer' }}>
              {/* Hover glow ring */}
              {isHovered && !node.isCenter && (
                <circle cx={node.x} cy={node.y} r={baseR + 6}
                  fill="none" stroke="#a5b4fc" strokeWidth="2" opacity="0.5" filter="url(#glow)" />
              )}
              {/* Node circle */}
              <circle cx={node.x} cy={node.y} r={baseR}
                fill={node.isCenter ? 'url(#centerGrad)' : isHovered ? 'url(#nodeHoverGrad)' : 'url(#nodeGrad)'}
                stroke="white" strokeWidth={node.isCenter ? 4 : 3}
                filter={node.isCenter ? 'url(#glow)' : 'none'}
              />
              {/* Initial letter */}
              <text x={node.x} y={node.y + 1} textAnchor="middle" dominantBaseline="central"
                fill="white" fontSize={node.isCenter ? 16 : 13} fontWeight="bold"
                style={{ pointerEvents: 'none' }}>
                {(node.name || '?')[0].toUpperCase()}
              </text>
              {/* Name label */}
              <text x={node.x} y={node.y + baseR + 14} textAnchor="middle"
                fill="#374151" fontSize="11" fontWeight="600"
                style={{ pointerEvents: 'none' }}>
                {node.isCenter ? 'You' : (node.name || 'Unknown').split(' ')[0]}
              </text>
              {/* Mutual count badge */}
              {node.mutual_count > 0 && !node.isCenter && (
                <>
                  <circle cx={node.x + baseR - 4} cy={node.y - baseR + 4} r="8"
                    fill="#10b981" stroke="white" strokeWidth="1.5" />
                  <text x={node.x + baseR - 4} y={node.y - baseR + 5} textAnchor="middle"
                    dominantBaseline="central" fill="white" fontSize="8" fontWeight="bold"
                    style={{ pointerEvents: 'none' }}>
                    {node.mutual_count}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && !tooltip.isCenter && (
        <div className="mt-2 p-3 bg-white rounded-lg border border-gray-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
            <span className="text-indigo-700 font-bold">{(tooltip.name || '?')[0].toUpperCase()}</span>
          </div>
          <div>
            <p className="font-semibold text-gray-900">{tooltip.name || 'Unknown'}</p>
            <p className="text-xs text-gray-500">
              {tooltip.role === 'recruiter' ? 'Recruiter' : 'Job Seeker'}
              {tooltip.mutual_count > 0 && ` · ${tooltip.mutual_count} mutual connection${tooltip.mutual_count > 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={() => onNodeClick && onNodeClick(tooltip.id)}
            className="ml-auto text-xs px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition">
            View Profile
          </button>
        </div>
      )}
    </div>
  );
}

export default function ConnectionsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('connections');
  const [connections, setConnections] = useState([]);
  const [pending, setPending] = useState([]);
  const [sent, setSent] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [graph, setGraph] = useState(null);
  const [connPage, setConnPage] = useState(1);
  const perPage = 20;

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

  const cancelRequestFromSearch = async (userId) => {
    try {
      // Find the connection in sent list for this user
      const conn = sent.find(s => s.addressee_id === userId);
      if (conn) {
        await api.delete(`/users/connections/${conn.id}`);
      } else {
        // Fetch sent list first to find the conn id
        const sentRes = await api.get('/users/connections/sent');
        const sentConn = (sentRes.data || []).find(s => s.addressee_id === userId);
        if (sentConn) {
          await api.delete(`/users/connections/${sentConn.id}`);
        }
      }
      // Optimistic update: reset connection_status to null in search results
      setSearchResults(prev =>
        prev.map(u => u.id === userId ? { ...u, connection_status: null } : u)
      );
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to cancel request');
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

  const PersonCard = ({ userId, name, headline, picture, actions }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center space-x-4">
      <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden flex-shrink-0 cursor-pointer"
        onClick={() => userId && navigate(`/profile/${userId}`)}>
        {picture ? (
          <img src={picture} alt="" className="w-12 h-12 rounded-full object-cover" />
        ) : (
          <span className="text-primary-600 font-bold text-lg">{(name || '?')[0].toUpperCase()}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate cursor-pointer hover:text-primary-600"
          onClick={() => userId && navigate(`/profile/${userId}`)}>
          {name || 'Unknown User'}
        </p>
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
              ) : connections.slice((connPage - 1) * perPage, connPage * perPage).map(conn => {
                const p = getPartnerInfo(conn);
                return <PersonCard key={conn.id} userId={p.id} name={p.name} headline={p.headline} picture={p.picture}
                  actions={
                    <button onClick={() => removeConnection(conn.id)}
                      className="px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded-lg hover:bg-red-200 transition">
                      Remove
                    </button>
                  }
                />;
              })}
              <Pagination currentPage={connPage} totalPages={Math.ceil(connections.length / perPage)}
                totalItems={connections.length} onPageChange={setConnPage} itemLabel="connections" />
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
                  userId={conn.requester_id}
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
                  userId={conn.addressee_id}
                  name={conn.addressee_name}
                  headline={conn.addressee_headline}
                  picture={conn.addressee_picture}
                  actions={
                    <>
                      <span className="px-3 py-1.5 bg-yellow-50 text-yellow-700 text-sm rounded-lg font-medium">Pending</span>
                      <button onClick={() => removeConnection(conn.id)}
                        className="px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded-lg hover:bg-red-200 transition">
                        Cancel
                      </button>
                    </>
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
                  maxLength={100}
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
                    userId={u.id}
                    name={u.full_name}
                    headline={u.headline}
                    picture={u.profile_picture_url}
                    actions={
                      u.connection_status === 'accepted' ? (
                        <span className="px-3 py-1.5 bg-green-50 text-green-700 text-sm rounded-lg font-medium flex items-center gap-1">
                          <UserCheck className="h-3.5 w-3.5" /> Connected
                        </span>
                      ) : u.connection_status === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1.5 bg-yellow-50 text-yellow-700 text-sm rounded-lg font-medium flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" /> Pending
                          </span>
                          <button onClick={() => cancelRequestFromSearch(u.id)}
                            className="px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded-lg hover:bg-red-200 transition">
                            Cancel
                          </button>
                        </div>
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
                <NetworkGraph nodes={graph.nodes} edges={graph.edges} currentUserId={user?.id} userName={user?.full_name} onNodeClick={(id) => navigate(`/profile/${id}`)} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { MessageSquare, Send, Plus, ArrowLeft, Users, Trash2, X, UserPlus, Lock, LogOut, Info } from 'lucide-react';
import { toIST } from '../utils/time';
import { encryptMessage, encryptGroupMessage, decryptMessage, isEncryptedPayload, signMessage } from '../utils/crypto';
import { getSessionE2EEKeyPair } from '../utils/e2eeKeyStore';
import useWebSocket from '../hooks/useWebSocket';

import ReportButton from '../components/ReportButton';
import KeyManagement from '../components/KeyManagement';

export default function MessagesPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [showNewConv, setShowNewConv] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [connections, setConnections] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [keysUnavailable, setKeysUnavailable] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);
  const convPollRef = useRef(null);

  // E2E encryption state
  const privateKeyRef = useRef(null);
  const myPublicKeyRef = useRef(null);
  const publicKeyCacheRef = useRef({}); // { recipientId: publicKeyPem }

  const fetchConversations = useCallback(async () => {
    try {
      const res = await api.get('/messages/conversations');
      const convList = res.data || [];
      setConversations(convList);
      // Keep activeConv in sync with refreshed data
      setActiveConv(prev => {
        if (!prev || prev.is_new) return prev;
        const updated = convList.find(c => c.id === prev.id);
        return updated || prev;
      });
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load the user's browser-managed private/public key pair for E2E encryption.
  useEffect(() => {
    const fetchKeys = async () => {
      const sessionKeyPair = getSessionE2EEKeyPair(user?.email);
      if (sessionKeyPair?.privateKeyPem) {
        privateKeyRef.current = sessionKeyPair.privateKeyPem;
        myPublicKeyRef.current = sessionKeyPair.publicKeyPem || null;
        setKeysUnavailable(false);
        return;
      }

      try {
        const pubRes = await api.get(`/messages/user/${user?.id}/public-key`);
        myPublicKeyRef.current = pubRes.data.public_key;
        privateKeyRef.current = null;
        setKeysUnavailable(true);
      } catch (err) {
        privateKeyRef.current = null;
        myPublicKeyRef.current = null;
        setKeysUnavailable(true);
        console.warn('Could not load local E2E keys:', err);
      }
    };
    if (user?.id && user?.email) fetchKeys();
  }, [user?.id, user?.email]);

  // Helper: get recipient's public key (cached)
  const getRecipientPublicKey = useCallback(async (recipientId) => {
    if (publicKeyCacheRef.current[recipientId]) {
      return publicKeyCacheRef.current[recipientId];
    }
    try {
      const res = await api.get(`/messages/user/${recipientId}/public-key`);
      publicKeyCacheRef.current[recipientId] = res.data.public_key;
      return res.data.public_key;
    } catch {
      return null;
    }
  }, []);

  const activeConvRef = useRef(null);
  useEffect(() => { activeConvRef.current = activeConv; }, [activeConv]);

  useEffect(() => {
    fetchConversations();
    // Slow fallback poll (60s) in case WebSocket drops silently
    convPollRef.current = setInterval(fetchConversations, 60000);
    return () => { if (convPollRef.current) clearInterval(convPollRef.current); };
  }, [fetchConversations]);

  // Handle ?newConv= URL parameter (e.g. from recruiter messaging an applicant)
  const pendingNewConvRef = useRef(null);

  // Capture newConv param immediately on mount
  useEffect(() => {
    const newConvUserId = searchParams.get('newConv');
    const newConvName = searchParams.get('name');
    if (newConvUserId) {
      pendingNewConvRef.current = { userId: newConvUserId, name: newConvName || 'Unknown' };
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  // Resolve pending new conversation once conversations are loaded
  useEffect(() => {
    const pending = pendingNewConvRef.current;
    if (!pending || loading) return;
    const existing = conversations.find(c => c.partner_id === pending.userId);
    if (existing) {
      setActiveConv(existing);
      pendingNewConvRef.current = null;
    } else if (conversations.length > 0 || !loading) {
      // Conversations loaded but no existing conversation found — start new
      setActiveConv({
        id: `new_${pending.userId}`,
        partner_id: pending.userId,
        partner_name: pending.name,
        is_new: true,
      });
      setMessages([]);
      pendingNewConvRef.current = null;
    }
  }, [conversations, loading]);

  const fetchMessages = useCallback(async (convId) => {
    try {
      const res = await api.get(`/messages/conversations/${convId}`);
      const msgs = res.data || [];
      // Attempt to decrypt E2E messages client-side
      const decrypted = await Promise.all(
        msgs.map(async (m) => {
          if (m.ciphertext && isEncryptedPayload(m.ciphertext) && privateKeyRef.current) {
            try {
              const isSender = m.sender_id === String(user?.id);
              const plaintext = await decryptMessage(m.ciphertext, privateKeyRef.current, isSender, String(user?.id));
              return { ...m, ciphertext: plaintext, _e2e: true };
            } catch {
              return { ...m, _e2e: true, _decryptFailed: true };
            }
          }
          return m;
        })
      );
      setMessages(decrypted);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  }, [user?.id]);

  // WebSocket: real-time message notifications
  const fetchMessagesRef = useRef(fetchMessages);
  useEffect(() => { fetchMessagesRef.current = fetchMessages; }, [fetchMessages]);

  const handleWsEvent = useCallback((event) => {
    if (event.type === 'new_message') {
      fetchConversations();
      const ac = activeConvRef.current;
      if (ac && !ac.is_new && ac.id === event.conversation_id) {
        fetchMessagesRef.current(ac.id);
      }
    }
  }, [fetchConversations]);

  useWebSocket(handleWsEvent);

  useEffect(() => {
    if (activeConv && !activeConv.is_new) {
      fetchMessages(activeConv.id);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => fetchMessages(activeConv.id), 60000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeConv, fetchMessages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeConv) return;
    setSendingMsg(true);
    try {
      if (!privateKeyRef.current || !myPublicKeyRef.current) {
        throw new Error('Your local E2EE keys are locked in this tab. Sign in again to continue messaging.');
      }

      let ciphertext;

      if (activeConv.is_group) {
        const members = groupMembers.length > 0
          ? groupMembers
          : (await api.get(`/messages/groups/${activeConv.id}/members`)).data || [];

        const publicKeysByUserId = {};
        for (const member of members) {
          if (member.user_id === String(user?.id)) {
            publicKeysByUserId[member.user_id] = myPublicKeyRef.current;
            continue;
          }

          const pubKey = await getRecipientPublicKey(member.user_id);
          if (pubKey) {
            publicKeysByUserId[member.user_id] = pubKey;
          }
        }

        if (!publicKeysByUserId[String(user?.id)] && myPublicKeyRef.current) {
          publicKeysByUserId[String(user?.id)] = myPublicKeyRef.current;
        }

        ciphertext = await encryptGroupMessage(newMessage.trim(), publicKeysByUserId);
      } else {
        const pubKey = await getRecipientPublicKey(activeConv.partner_id);
        if (!pubKey || !myPublicKeyRef.current) {
          throw new Error('Encryption keys are not available yet. Please try again.');
        }
        ciphertext = await encryptMessage(newMessage.trim(), pubKey, myPublicKeyRef.current);
      }

      const payload = { ciphertext };

      // Sign the plaintext with sender's private key for authenticity
      try {
        payload.signature = await signMessage(newMessage.trim(), privateKeyRef.current);
      } catch (sigErr) {
        console.warn('Message signing failed (non-critical):', sigErr);
      }

      if (activeConv.is_group) {
        payload.conversation_id = activeConv.id;
      } else {
        payload.recipient_id = activeConv.partner_id;
        if (!activeConv.is_new) {
          payload.conversation_id = activeConv.id;
        }
      }
      await api.post('/messages/', payload);
      setNewMessage('');

      if (activeConv.is_new) {
        await fetchConversations();
        const convRes = await api.get('/messages/conversations');
        const convList = convRes.data || [];
        const target = convList.find(c => c.partner_id === activeConv.partner_id);
        if (target) {
          setActiveConv(target);
        }
      } else {
        // Optimistic update: show sent message immediately
        const optimisticMsg = {
          id: `temp_${Date.now()}`,
          conversation_id: activeConv.id,
          sender_id: String(user?.id),
          sender_name: user?.full_name,
          ciphertext: newMessage.trim(),
          _e2e: true,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, optimisticMsg]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        // Background sync (will replace optimistic message with real data)
        fetchMessages(activeConv.id);
        fetchConversations();
      }
    } catch (err) {
      alert(err.response?.data?.detail || err.message || 'Failed to send message');
    } finally {
      setSendingMsg(false);
    }
  };

  const startNewConversation = async (partnerId) => {
    // Check if a conversation already exists (edge case)
    const existing = conversations.find(c => c.partner_id === partnerId);
    if (existing) {
      setActiveConv(existing);
      setShowNewConv(false);
      return;
    }
    // Create a virtual/temporary conversation — no auto "Hello!" sent
    const partnerConn = connections.find(c => c.id === partnerId);
    setActiveConv({
      id: `new_${partnerId}`,
      partner_id: partnerId,
      partner_name: partnerConn?.name || 'Unknown',
      is_new: true,
    });
    setMessages([]);
    setShowNewConv(false);
  };

  const [deleteMenuMsg, setDeleteMenuMsg] = useState(null);

  const deleteMessage = async (msgId, forEveryone = false) => {
    try {
      await api.delete(`/messages/${msgId}?for_everyone=${forEveryone}`);
      setDeleteMenuMsg(null);
      fetchMessages(activeConv.id);
    } catch (err) {
      alert(err.response?.data?.detail || 'Cannot delete this message');
    }
  };

  const deleteConversation = async (convId) => {
    if (!confirm('Delete this conversation for you? The other person will still see it.')) return;
    try {
      await api.delete(`/messages/conversations/${convId}`);
      setActiveConv(null);
      setMessages([]);
      fetchConversations();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete conversation');
    }
  };

  const loadConnections = async () => {
    try {
      const res = await api.get('/users/connections');
      const accepted = (res.data || []).filter(c => c.status === 'accepted');
      const partners = accepted.map(conn => {
        const isRequester = conn.requester_id === user?.id;
        return {
          id: isRequester ? conn.addressee_id : conn.requester_id,
          name: isRequester ? conn.addressee_name : conn.requester_name,
        };
      });
      // For DM: exclude those with existing conversations
      // For group: we use allConnections
      setConnections(partners);
    } catch (err) {
      console.error('Failed to load connections:', err);
    }
  };

  // Filter connections for DM (exclude those with existing conversations)
  const dmConnections = connections.filter(p => !conversations.some(c => c.partner_id === p.id));

  const handleNewConv = () => {
    setShowNewConv(true);
    loadConnections();
  };

  const handleNewGroup = () => {
    setShowNewConv(false);
    setShowNewGroup(true);
    setGroupName('');
    setSelectedMembers([]);
    loadConnections();
  };

  const toggleMember = (id) => {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const createGroup = async () => {
    if (!groupName.trim() || selectedMembers.length === 0) {
      alert('Please enter a group name and select at least one member');
      return;
    }
    try {
      const res = await api.post('/messages/groups', {
        name: groupName.trim(),
        member_ids: selectedMembers,
      });
      setShowNewGroup(false);
      await fetchConversations();
      setActiveConv(res.data);
      setMessages([]);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create group');
    }
  };

  const fetchGroupMembers = async (groupId) => {
    try {
      const res = await api.get(`/messages/groups/${groupId}/members`);
      setGroupMembers(res.data || []);
    } catch (err) {
      console.error('Failed to fetch group members:', err);
    }
  };

  useEffect(() => {
    if (activeConv?.is_group && activeConv.id) {
      fetchGroupMembers(activeConv.id);
    } else {
      setGroupMembers([]);
    }
  }, [activeConv]);

  const leaveGroup = async (groupId) => {
    if (!confirm('Leave this group? You can still view old messages but won\'t be able to send new ones.')) return;
    try {
      await api.post(`/messages/groups/${groupId}/leave`);
      setActiveConv(null);
      setMessages([]);
      setGroupMembers([]);
      fetchConversations();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to leave group');
    }
  };

  const deleteGroupForMe = async (groupId) => {
    if (!confirm('Delete this group for you? All messages will be removed and the group will disappear from your list.')) return;
    try {
      await api.post(`/messages/groups/${groupId}/delete-for-me`);
      setActiveConv(null);
      setMessages([]);
      setGroupMembers([]);
      fetchConversations();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete group');
    }
  };

  const deleteGroup = async (groupId) => {
    if (!confirm('Archive this group? Members will still see messages but nobody can send new ones.')) return;
    try {
      await api.delete(`/messages/groups/${groupId}`);
      await fetchConversations();
      setActiveConv(prev => prev ? { ...prev, is_archived: true } : null);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to archive group');
    }
  };

  const addMemberToGroup = async (groupId, userId) => {
    // Optimistic: add to local list immediately
    const conn = connections.find(c => c.id === userId);
    if (conn) {
      setGroupMembers(prev => [...prev, { user_id: userId, full_name: conn.name, is_creator: false, has_left: false }]);
    }
    try {
      await api.post(`/messages/groups/${groupId}/members/${userId}`);
      await fetchGroupMembers(groupId);
      await fetchConversations();
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to add member';
      if (detail !== 'User is already a member') {
        alert(detail);
      }
      await fetchGroupMembers(groupId);
    }
  };

  const removeMemberFromGroup = async (groupId, userId) => {
    if (!confirm('Remove this member from the group?')) return;
    // Optimistic: remove from local list immediately
    setGroupMembers(prev => prev.filter(m => m.user_id !== userId));
    try {
      await api.delete(`/messages/groups/${groupId}/members/${userId}`);
      await fetchGroupMembers(groupId);
      await fetchConversations();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to remove member');
      await fetchGroupMembers(groupId);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center space-x-3 mb-6">
        <MessageSquare className="h-8 w-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">Messages</h1>
      </div>

      {keysUnavailable && (
        <KeyManagement
          variant="banner"
          onKeysImported={(keyPair) => {
            privateKeyRef.current = keyPair.privateKeyPem;
            myPublicKeyRef.current = keyPair.publicKeyPem;
            setKeysUnavailable(false);
          }}
        />
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" style={{ height: '70vh' }}>
        <div className="flex h-full">
          {/* Sidebar */}
          <div className={`w-80 border-r border-gray-100 flex flex-col ${activeConv ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Conversations</h2>
              <button onClick={handleNewConv}
                className="p-2 hover:bg-gray-100 rounded-lg transition" title="New conversation">
                <Plus className="h-4 w-4 text-gray-600" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-gray-400">Loading...</div>
              ) : conversations.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No conversations yet</p>
                </div>
              ) : (
                conversations.map(conv => (
                  <button key={conv.id} onClick={() => { setActiveConv(conv); setShowGroupInfo(false); setShowAddMember(false); }}
                    className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition flex items-center space-x-3 ${
                      activeConv?.id === conv.id ? 'bg-primary-50 border-r-2 border-primary-600' : ''
                    }`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      conv.is_group ? 'bg-blue-100' : 'bg-primary-100'
                    }`}>
                      {conv.is_group ? (
                        <Users className="h-5 w-5 text-blue-600" />
                      ) : (
                        <span className="text-primary-600 font-bold">
                          {(conv.partner_name || conv.name || '?')[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{conv.is_group ? conv.name : (conv.partner_name || 'Unknown')}</p>
                      <p className="text-xs text-gray-400">
                        {conv.is_group
                          ? conv.is_archived
                            ? 'Archived'
                            : conv.has_left
                              ? 'Left'
                              : `${conv.member_count || 0} members`
                          : 'Click to view messages'}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Chat Area */}
          <div className={`flex-1 flex flex-col ${!activeConv ? 'hidden md:flex' : 'flex'}`}>
            {activeConv ? (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b border-gray-100 flex items-center space-x-3">
                  <button onClick={() => setActiveConv(null)} className="md:hidden p-1 hover:bg-gray-100 rounded">
                    <ArrowLeft className="h-5 w-5 text-gray-600" />
                  </button>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    activeConv.is_group ? 'bg-blue-100' : 'bg-primary-100'
                  }`}>
                    {activeConv.is_group ? (
                      <Users className="h-4 w-4 text-blue-600" />
                    ) : (
                      <span className="text-primary-600 font-bold text-sm">
                        {(activeConv.partner_name || activeConv.name || '?')[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{activeConv.is_group ? activeConv.name : (activeConv.partner_name || 'Unknown')}</h3>
                    <p className="text-xs text-gray-400">
                      {activeConv.is_group
                        ? `${groupMembers.filter(m => !m.has_left).length} members: ${groupMembers.filter(m => !m.has_left).map(m => m.full_name).join(', ')}`
                        : 'End-to-end encrypted'}
                    </p>
                  </div>
                  {!activeConv.is_group && (
                    <div className="flex items-center gap-1">
                      <ReportButton
                        reportedUserId={activeConv.partner_id}
                        resourceType="user"
                        className="p-2 hover:bg-red-50 rounded-lg transition"
                      />
                      <button onClick={() => deleteConversation(activeConv.id)}
                        className="p-2 hover:bg-red-50 rounded-lg transition text-red-400 hover:text-red-600" title="Delete conversation">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  {activeConv.is_group && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setShowGroupInfo(true); fetchGroupMembers(activeConv.id); }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg transition text-blue-500 hover:bg-blue-50 hover:text-blue-700 text-sm font-medium" title="Group Info">
                        <Info className="h-4 w-4" />
                        <span>Info</span>
                      </button>
                      {activeConv.created_by && activeConv.created_by === user?.id ? (
                        !activeConv.is_archived && (
                          <button onClick={() => deleteGroup(activeConv.id)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg transition text-red-500 hover:bg-red-50 hover:text-red-700 text-sm font-medium" title="Archive group">
                            <Trash2 className="h-4 w-4" />
                            <span>Delete Group</span>
                          </button>
                        )
                      ) : (
                        !activeConv.has_left && !activeConv.is_archived && (
                          <>
                            <button onClick={() => leaveGroup(activeConv.id)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg transition text-orange-500 hover:bg-orange-50 hover:text-orange-700 text-sm font-medium" title="Leave group">
                              <LogOut className="h-4 w-4" />
                              <span>Leave</span>
                            </button>
                            <button onClick={() => deleteGroupForMe(activeConv.id)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg transition text-red-500 hover:bg-red-50 hover:text-red-700 text-sm font-medium" title="Delete group for you">
                              <Trash2 className="h-4 w-4" />
                              <span>Delete</span>
                            </button>
                          </>
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map(msg => {
                    const isMe = msg.sender_id === user?.id;
                    const isDeleted = msg.deleted_for_everyone;
                    return (
                      <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group relative`}>
                        {/* Delete button for own messages (left side) */}
                        {isMe && !isDeleted && (
                          <button onClick={() => setDeleteMenuMsg(deleteMenuMsg === msg.id ? null : msg.id)}
                            className="self-center mr-2 p-1 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition" title="Delete message">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {isDeleted ? (
                          <div className="max-w-[70%] px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 border-dashed">
                            {activeConv.is_group && !isMe && msg.sender_name && (
                              <p className="text-xs font-semibold text-blue-500 mb-0.5">{msg.sender_name}</p>
                            )}
                            <p className="text-sm text-gray-400 italic">This message was deleted</p>
                            <p className="text-xs mt-1 text-gray-300">
                              {toIST(msg.created_at)}
                            </p>
                          </div>
                        ) : (
                          <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl ${
                            isMe
                              ? 'bg-primary-600 text-white rounded-br-md'
                              : 'bg-gray-100 text-gray-900 rounded-bl-md'
                          }`}>
                            {activeConv.is_group && !isMe && msg.sender_name && (
                              <p className={`text-xs font-semibold mb-0.5 ${isMe ? 'text-primary-200' : 'text-blue-500'}`}>{msg.sender_name}</p>
                            )}
                            <p className="text-sm whitespace-pre-wrap">
                              {msg._decryptFailed ? (
                                <span className="italic text-yellow-300">[Encrypted — unable to decrypt]</span>
                              ) : (
                                msg.ciphertext || msg.content
                              )}
                            </p>
                            <p className={`text-xs mt-1 flex items-center gap-1 ${isMe ? 'text-primary-200' : 'text-gray-400'}`}>
                              {toIST(msg.created_at)}
                              {msg._e2e && <Lock className="h-3 w-3 inline" title="End-to-end encrypted" />}
                            </p>
                          </div>
                        )}
                        {!isMe && !isDeleted && (
                          <button onClick={() => setDeleteMenuMsg(deleteMenuMsg === msg.id ? null : msg.id)}
                            className="self-center ml-2 p-1 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition" title="Delete message">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {/* Delete options menu */}
                        {deleteMenuMsg === msg.id && (
                          <div className={`absolute top-full z-10 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px] ${isMe ? 'right-0' : 'left-0'}`}>
                            <button onClick={() => deleteMessage(msg.id, false)}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                              Delete for me
                            </button>
                            {isMe && (
                              <button onClick={() => deleteMessage(msg.id, true)}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                                Delete for everyone
                              </button>
                            )}
                            <button onClick={() => setDeleteMenuMsg(null)}
                              className="w-full text-left px-4 py-2 text-sm text-gray-400 hover:bg-gray-50">
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                {activeConv.is_archived ? (
                  <div className="p-4 border-t border-gray-100 bg-yellow-50">
                    <p className="text-center text-yellow-700 text-sm font-medium">
                      This group has been archived by the creator. No new messages can be sent.
                    </p>
                  </div>
                ) : activeConv.has_left ? (
                  <div className="p-4 border-t border-gray-100 bg-gray-50">
                    <p className="text-center text-gray-500 text-sm font-medium">
                      You left this group. You can view old messages but cannot send new ones.
                    </p>
                  </div>
                ) : (
                <form onSubmit={sendMessage} className="p-4 border-t border-gray-100 flex gap-2">
                  <input
                    type="text" value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    maxLength={5000}
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  />
                  <button type="submit" disabled={sendingMsg || !newMessage.trim()}
                    className="px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50">
                    <Send className="h-4 w-4" />
                  </button>
                </form>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-20" />
                  <p className="text-lg font-medium">Select a conversation</p>
                  <p className="text-sm mt-1">Choose from existing or start a new one</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Conversation Modal */}
      {showNewConv && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">New Conversation</h3>
              <button onClick={() => setShowNewConv(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
            </div>
            <button onClick={handleNewGroup}
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg bg-blue-50 hover:bg-blue-100 transition text-left mb-4 border border-blue-200">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <span className="font-medium text-blue-700">Create Group Chat</span>
                <p className="text-xs text-blue-500">Message multiple people at once</p>
              </div>
            </button>
            <p className="text-sm text-gray-500 mb-3">Or start a direct message:</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {dmConnections.length === 0 ? (
                <p className="text-center text-gray-400 py-4 text-sm">
                  {conversations.length > 0 ? 'All connections already have conversations' : 'No connections available. Connect with people first!'}
                </p>
              ) : dmConnections.map(c => (
                <button key={c.id} onClick={() => startNewConversation(c.id)}
                  className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition text-left">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                    <span className="text-primary-600 font-bold text-sm">{(c.name || '?')[0].toUpperCase()}</span>
                  </div>
                  <span className="font-medium text-gray-900">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {showNewGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Create Group Chat</h3>
              <button onClick={() => setShowNewGroup(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Group Name</label>
              <input
                type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)}
                placeholder="Enter group name..." maxLength={100}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              Select Members ({selectedMembers.length} selected)
            </p>
            <div className="space-y-1 max-h-48 overflow-y-auto mb-4">
              {connections.length === 0 ? (
                <p className="text-center text-gray-400 py-4 text-sm">No connections available</p>
              ) : connections.map(c => (
                <button key={c.id} onClick={() => toggleMember(c.id)}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition text-left ${
                    selectedMembers.includes(c.id) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                  }`}>
                  <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                    selectedMembers.includes(c.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                  }`}>
                    {selectedMembers.includes(c.id) && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="font-medium text-gray-900 text-sm">{c.name}</span>
                </button>
              ))}
            </div>
            <button onClick={createGroup}
              disabled={!groupName.trim() || selectedMembers.length === 0}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-medium">
              Create Group
            </button>
          </div>
        </div>
      )}

      {/* Group Info Modal */}
      {showGroupInfo && activeConv?.is_group && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Group Info</h3>
              <button onClick={() => { setShowGroupInfo(false); setShowAddMember(false); }}
                className="p-1 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-500">Group Name</p>
              <p className="font-semibold text-gray-900">{activeConv.name}</p>
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-500">Created By</p>
              <p className="font-medium text-gray-900">{activeConv.created_by_name || 'Unknown'}</p>
            </div>
            {activeConv.is_archived && (
              <div className="mb-4 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-700 font-medium">This group has been archived</p>
              </div>
            )}
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Members ({groupMembers.filter(m => !m.has_left).length})
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {groupMembers.map(m => (
                  <div key={m.user_id} className={`flex items-center justify-between px-3 py-2 rounded-lg ${m.has_left ? 'bg-gray-50 opacity-60' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                        <span className="text-primary-600 font-bold text-sm">{(m.full_name || '?')[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-900 text-sm">{m.full_name}</span>
                        {m.is_creator && <span className="ml-1 text-xs text-blue-600 font-semibold">(Admin)</span>}
                        {m.has_left && <span className="ml-1 text-xs text-gray-400">(Left)</span>}
                        {m.user_id === user?.id && <span className="ml-1 text-xs text-gray-400">(You)</span>}
                      </div>
                    </div>
                    {activeConv.created_by === user?.id && m.user_id !== user?.id && !m.has_left && !activeConv.is_archived && (
                      <button onClick={() => removeMemberFromGroup(activeConv.id, m.user_id)}
                        className="text-red-400 hover:text-red-600 text-xs font-medium">Remove</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {activeConv.created_by === user?.id && !activeConv.is_archived && (
              <div>
                {!showAddMember ? (
                  <button onClick={() => { setShowAddMember(true); loadConnections(); }}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition font-medium text-sm">
                    <UserPlus className="h-4 w-4" />
                    Add Member
                  </button>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Add from Connections</p>
                    <div className="space-y-1 max-h-36 overflow-y-auto mb-2">
                      {connections.filter(c => !groupMembers.some(m => m.user_id === c.id)).length === 0 ? (
                        <p className="text-center text-gray-400 py-2 text-sm">All connections are already members</p>
                      ) : connections.filter(c => !groupMembers.some(m => m.user_id === c.id)).map(c => (
                        <button key={c.id} onClick={() => addMemberToGroup(activeConv.id, c.id)}
                          className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-green-50 transition text-left">
                          <UserPlus className="h-4 w-4 text-green-600" />
                          <span className="font-medium text-gray-900 text-sm">{c.name}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setShowAddMember(false)}
                      className="w-full py-1.5 text-gray-500 text-sm hover:text-gray-700">Cancel</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

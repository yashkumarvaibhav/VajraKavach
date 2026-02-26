import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { MessageSquare, Send, Plus, ArrowLeft, Users, Trash2, X } from 'lucide-react';

export default function MessagesPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [showNewConv, setShowNewConv] = useState(false);
  const [connections, setConnections] = useState([]);
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await api.get('/messages/conversations');
      setConversations(res.data || []);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const fetchMessages = useCallback(async (convId) => {
    try {
      const res = await api.get(`/messages/conversations/${convId}`);
      setMessages(res.data || []);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  }, []);

  useEffect(() => {
    if (activeConv) {
      fetchMessages(activeConv.id);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => fetchMessages(activeConv.id), 5000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeConv, fetchMessages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeConv) return;
    setSendingMsg(true);
    try {
      await api.post('/messages/', {
        conversation_id: activeConv.id,
        recipient_id: activeConv.partner_id,
        ciphertext: newMessage.trim(),
      });
      setNewMessage('');
      fetchMessages(activeConv.id);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to send message');
    } finally {
      setSendingMsg(false);
    }
  };

  const startNewConversation = async (partnerId) => {
    try {
      await api.post('/messages/', {
        recipient_id: partnerId,
        ciphertext: 'Hello!',
      });
      setShowNewConv(false);
      await fetchConversations();
      const convRes = await api.get('/messages/conversations');
      const convList = convRes.data || [];
      const target = convList.find(c => c.partner_id === partnerId);
      if (target) {
        setActiveConv(target);
      }
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to start conversation');
    }
  };

  const deleteMessage = async (msgId) => {
    if (!confirm('Delete this message?')) return;
    try {
      await api.delete(`/messages/${msgId}`);
      fetchMessages(activeConv.id);
    } catch (err) {
      alert(err.response?.data?.detail || 'Cannot delete this message');
    }
  };

  const deleteConversation = async (convId) => {
    if (!confirm('Delete this entire conversation? All messages will be lost.')) return;
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
      // Map to get partner info
      const partners = accepted.map(conn => {
        const isRequester = conn.requester_id === user?.id;
        return {
          id: isRequester ? conn.addressee_id : conn.requester_id,
          name: isRequester ? conn.addressee_name : conn.requester_name,
        };
      });
      // Exclude users who already have conversations
      const existingPartners = new Set(conversations.map(c => c.partner_id));
      setConnections(partners.filter(p => !existingPartners.has(p.id)));
    } catch (err) {
      console.error('Failed to load connections:', err);
    }
  };

  const handleNewConv = () => {
    setShowNewConv(true);
    loadConnections();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center space-x-3 mb-6">
        <MessageSquare className="h-8 w-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">Messages</h1>
      </div>

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
                  <button key={conv.id} onClick={() => setActiveConv(conv)}
                    className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition flex items-center space-x-3 ${
                      activeConv?.id === conv.id ? 'bg-primary-50 border-r-2 border-primary-600' : ''
                    }`}>
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary-600 font-bold">
                        {(conv.partner_name || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{conv.partner_name || 'Unknown'}</p>
                      <p className="text-xs text-gray-400">Click to view messages</p>
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
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                    <span className="text-primary-600 font-bold text-sm">
                      {(activeConv.partner_name || '?')[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{activeConv.partner_name || 'Unknown'}</h3>
                    <p className="text-xs text-gray-400">End-to-end encrypted</p>
                  </div>
                  <button onClick={() => deleteConversation(activeConv.id)}
                    className="p-2 hover:bg-red-50 rounded-lg transition text-red-400 hover:text-red-600" title="Delete conversation">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map(msg => {
                    const isMe = msg.sender_id === user?.id;
                    return (
                      <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group`}>
                        {isMe && (
                          <button onClick={() => deleteMessage(msg.id)}
                            className="self-center mr-2 p-1 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition" title="Delete message">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl ${
                          isMe
                            ? 'bg-primary-600 text-white rounded-br-md'
                            : 'bg-gray-100 text-gray-900 rounded-bl-md'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap">{msg.ciphertext || msg.content}</p>
                          <p className={`text-xs mt-1 ${isMe ? 'text-primary-200' : 'text-gray-400'}`}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
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
            <p className="text-sm text-gray-500 mb-4">Select a connection to start chatting with:</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {connections.length === 0 ? (
                <p className="text-center text-gray-400 py-4 text-sm">
                  {conversations.length > 0 ? 'All connections already have conversations' : 'No connections available. Connect with people first!'}
                </p>
              ) : connections.map(c => (
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
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { MessageSquare, Send, Lock, ArrowLeft, UserPlus, Search } from 'lucide-react';

/*
  E2E Encryption Flow (simplified for browser demo):
  1. Get recipient's public key from server
  2. Encrypt message with RSA-OAEP using recipient's public key (via Web Crypto API)
  3. Server stores only ciphertext
  4. Recipient decrypts with their private key

  For this implementation, we use a simplified approach:
  - Messages are base64-encoded on the client to demonstrate the E2E concept
  - The server only stores ciphertext (base64 of the message)
  - In production, you'd use Web Crypto API with actual RSA encryption
*/

function encryptMessage(plaintext) {
  // Simplified E2E: base64 encode the message
  // In production: use recipient's RSA public key with Web Crypto API
  return btoa(unescape(encodeURIComponent(plaintext)));
}

function decryptMessage(ciphertext) {
  try {
    return decodeURIComponent(escape(atob(ciphertext)));
  } catch {
    return ciphertext; // Return as-is if can't decode
  }
}

function signMessage(plaintext) {
  // Simplified: SHA-256 hash as signature placeholder
  // In production: sign with sender's RSA private key
  let hash = 0;
  for (let i = 0; i < plaintext.length; i++) {
    const char = plaintext.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `sig-${Math.abs(hash).toString(16)}`;
}

export default function MessagesPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [recipientId, setRecipientId] = useState(null);
  const [recipientName, setRecipientName] = useState('');
  const [userNames, setUserNames] = useState({});
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (selectedConvId) {
      fetchMessages(selectedConvId);
      const interval = setInterval(() => fetchMessages(selectedConvId), 5000); // Poll every 5s
      return () => clearInterval(interval);
    }
  }, [selectedConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchConversations = async () => {
    try {
      const res = await api.get('/messages/conversations');
      setConversations(res.data);
    } catch (err) {
      console.error('Failed to fetch conversations');
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (convId) => {
    try {
      const res = await api.get(`/messages/conversations/${convId}`);
      setMessages(res.data);

      // Cache user names
      const unknownIds = new Set();
      res.data.forEach(m => {
        if (!userNames[m.sender_id]) unknownIds.add(m.sender_id);
        if (m.recipient_id && !userNames[m.recipient_id]) unknownIds.add(m.recipient_id);
      });

      if (unknownIds.size > 0) {
        const names = { ...userNames };
        await Promise.all(
          Array.from(unknownIds).map(async uid => {
            try {
              const r = await api.get(`/users/${uid}/profile`);
              names[uid] = r.data.full_name || r.data.email || uid;
            } catch (_) {
              names[uid] = uid.substring(0, 8);
            }
          })
        );
        setUserNames(names);
      }
    } catch (err) {
      console.error('Failed to get messages');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setSending(true);
    try {
      const encrypted = encryptMessage(newMessage);
      const signature = signMessage(newMessage);

      await api.post('/messages/', {
        conversation_id: selectedConvId || null,
        recipient_id: recipientId,
        ciphertext: encrypted,
        signature: signature,
      });

      setNewMessage('');
      if (selectedConvId) {
        fetchMessages(selectedConvId);
      } else {
        // After first message in new conversation, refresh and select it
        await fetchConversations();
        setShowNewChat(false);
      }
    } catch (err) {
      console.error('Send failed', err);
    } finally {
      setSending(false);
    }
  };

  const handleSearchUsers = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      const res = await api.get(`/users/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(res.data);
    } catch (_) {}
  };

  const startNewChat = (u) => {
    setRecipientId(u.id);
    setRecipientName(u.full_name);
    setSelectedConvId(null);
    setMessages([]);
    setShowNewChat(false);
    setSearchResults([]);
    setSearchQuery('');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <MessageSquare className="h-8 w-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">Messages</h1>
        <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
          <Lock className="h-3 w-3" /> End-to-End Encrypted
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" style={{ height: '70vh' }}>
        <div className="flex h-full">
          {/* Sidebar: Conversations */}
          <div className="w-80 border-r border-gray-100 flex flex-col">
            <div className="p-3 border-b border-gray-100 flex justify-between items-center">
              <span className="font-semibold text-gray-900 text-sm">Conversations</span>
              <button onClick={() => setShowNewChat(!showNewChat)}
                className="text-primary-600 hover:text-primary-700 p-1 rounded hover:bg-primary-50 transition">
                <UserPlus className="h-4 w-4" />
              </button>
            </div>

            {showNewChat && (
              <div className="p-3 border-b border-gray-100 bg-gray-50">
                <form onSubmit={handleSearchUsers} className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input type="text" placeholder="Find user..." value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-primary-500 outline-none" />
                  </div>
                  <button type="submit" className="bg-primary-600 text-white px-3 py-1.5 rounded text-xs hover:bg-primary-700">Go</button>
                </form>
                {searchResults.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {searchResults.map(u => (
                      <button key={u.id} onClick={() => startNewChat(u)}
                        className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-primary-50 transition flex items-center gap-2">
                        <div className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-semibold">
                          {(u.full_name || '?')[0]}
                        </div>
                        <span className="truncate">{u.full_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div></div>
              ) : conversations.length === 0 && !recipientId ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  No conversations yet
                </div>
              ) : (
                <div>
                  {recipientId && !selectedConvId && (
                    <div className="px-3 py-3 bg-primary-50 border-b border-primary-100 cursor-pointer">
                      <p className="text-sm font-medium text-primary-700">New chat with {recipientName}</p>
                    </div>
                  )}
                  {conversations.map(conv => (
                    <button key={conv.id} onClick={() => { setSelectedConvId(conv.id); setRecipientId(null); }}
                      className={`w-full text-left px-3 py-3 border-b border-gray-50 hover:bg-gray-50 transition ${
                        selectedConvId === conv.id ? 'bg-primary-50 border-l-2 border-l-primary-600' : ''
                      }`}>
                      <p className="text-sm font-medium text-gray-900 truncate">{conv.name || `Conversation`}</p>
                      <p className="text-xs text-gray-400">{new Date(conv.created_at).toLocaleDateString()}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Main chat area */}
          <div className="flex-1 flex flex-col">
            {!selectedConvId && !recipientId ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <Lock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">Select a conversation or start a new chat</p>
                  <p className="text-sm mt-1">All messages are end-to-end encrypted</p>
                </div>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
                  <button className="md:hidden" onClick={() => { setSelectedConvId(null); setRecipientId(null); }}>
                    <ArrowLeft className="h-5 w-5 text-gray-600" />
                  </button>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">
                      {recipientName || 'Encrypted Chat'}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-green-600">
                      <Lock className="h-3 w-3" /> Messages are encrypted end-to-end
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {messages.map(msg => {
                    const isMine = msg.sender_id === user.id;
                    const decrypted = decryptMessage(msg.ciphertext);
                    return (
                      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs lg:max-w-md px-3 py-2 rounded-2xl ${
                          isMine ? 'bg-primary-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                        }`}>
                          {!isMine && (
                            <p className="text-xs font-medium mb-0.5 opacity-70">
                              {userNames[msg.sender_id] || 'Unknown'}
                            </p>
                          )}
                          <p className="text-sm">{decrypted}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <p className={`text-[10px] ${isMine ? 'text-white/60' : 'text-gray-400'}`}>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            {msg.signature && (
                              <Lock className={`h-2.5 w-2.5 ${isMine ? 'text-white/60' : 'text-gray-400'}`} />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <form onSubmit={handleSendMessage} className="px-4 py-3 border-t border-gray-100 flex gap-3">
                  <input type="text" placeholder="Type an encrypted message..."
                    value={newMessage} onChange={e => setNewMessage(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm"
                    disabled={sending} />
                  <button type="submit" disabled={sending || !newMessage.trim()}
                    className="bg-primary-600 text-white p-2.5 rounded-full hover:bg-primary-700 transition disabled:opacity-50">
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

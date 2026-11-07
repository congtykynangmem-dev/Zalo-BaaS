'use client';

import React, { useEffect, useState, useRef } from 'react';
import { fetchApi } from '@/lib/api';
import {
  MessageSquare,
  Send,
  User,
  Bot,
  UserCheck,
  RotateCcw,
  Clock,
  Sparkles,
} from 'lucide-react';

interface BotItem {
  id: string;
  name: string;
}

interface ConversationItem {
  id: string;
  chat_id: string;
  display_name?: string;
  state: 'ai' | 'human';
  human_until?: number | null;
  last_message_at: number;
}

interface MessageItem {
  id: string;
  direction: 'in' | 'out';
  sender: 'user' | 'ai' | 'agent' | 'system';
  text: string;
  created_at: number;
}

export default function ConversationsPage() {
  const [bots, setBots] = useState<BotItem[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string>('');
  const [filterState, setFilterState] = useState<'all' | 'human'>('all');
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConv, setActiveConv] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Load bots
  useEffect(() => {
    async function loadBots() {
      try {
        const res = await fetchApi<{ bots: BotItem[] }>('/v1/bots');
        setBots(res.bots);
        if (res.bots.length > 0) {
          setSelectedBotId(res.bots[0].id);
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadBots();
  }, []);

  // 2. Load conversations
  const loadConversations = async (botId: string, stateFilter: 'all' | 'human') => {
    if (!botId) return;
    try {
      const query = stateFilter === 'human' ? '?state=human' : '';
      const res = await fetchApi<{ conversations: ConversationItem[] }>(
        `/v1/bots/${botId}/conversations${query}`
      );
      setConversations(res.conversations);
      if (res.conversations.length > 0 && !activeConv) {
        setActiveConv(res.conversations[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (selectedBotId) {
      loadConversations(selectedBotId, filterState);
    }
  }, [selectedBotId, filterState]);

  // 3. Load messages for active conversation
  const loadMessages = async (convId: string) => {
    try {
      const res = await fetchApi<{
        conversation: ConversationItem;
        messages: MessageItem[];
      }>(`/v1/conversations/${convId}/messages`);
      setMessages(res.messages);
      setActiveConv(res.conversation);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeConv?.id) {
      loadMessages(activeConv.id);
    }
  }, [activeConv?.id]);

  // 4. Send manual reply by agent
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !replyText.trim()) return;
    setSending(true);

    try {
      await fetchApi(`/v1/conversations/${activeConv.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ text: replyText }),
      });

      setReplyText('');
      await loadMessages(activeConv.id);
      await loadConversations(selectedBotId, filterState);
    } catch (err) {
      alert('Không thể gửi tin nhắn qua Zalo');
    } finally {
      setSending(false);
    }
  };

  // 5. Return conversation to AI
  const handleReturnToAi = async () => {
    if (!activeConv) return;
    try {
      await fetchApi(`/v1/conversations/${activeConv.id}/return-to-ai`, {
        method: 'POST',
      });
      await loadMessages(activeConv.id);
      await loadConversations(selectedBotId, filterState);
    } catch (err) {
      alert('Không thể chuyển trạng thái');
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Top filter bar */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Hộp thư & Tiếp quản Handover</h1>
          <p className="text-xs text-slate-500">Tương tác trực tiếp với khách hàng Zalo khi cần nhân viên hỗ trợ</p>
        </div>

        <div className="flex items-center gap-3">
          {bots.length > 0 && (
            <select
              value={selectedBotId}
              onChange={(e) => setSelectedBotId(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm"
            >
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  Bot: {b.name}
                </option>
              ))}
            </select>
          )}

          <div className="flex rounded-xl bg-slate-200/70 p-1 text-xs font-semibold">
            <button
              onClick={() => setFilterState('all')}
              className={`rounded-lg px-3 py-1 transition ${
                filterState === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setFilterState('human')}
              className={`rounded-lg px-3 py-1 transition ${
                filterState === 'human' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              Cần nhân viên (Handover)
            </button>
          </div>
        </div>
      </div>

      {/* Two-pane layout */}
      <div className="flex flex-1 overflow-hidden mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Left pane: Conversation List */}
        <div className="w-80 border-r border-slate-100 flex flex-col overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Chưa có cuộc trò chuyện nào
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {conversations.map((conv) => {
                const isSelected = activeConv?.id === conv.id;
                const isHuman = conv.state === 'human';
                return (
                  <button
                    key={conv.id}
                    onClick={() => setActiveConv(conv)}
                    className={`w-full text-left p-4 transition flex items-start gap-3 ${
                      isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                      <User className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-xs font-bold text-slate-900">
                          {conv.display_name || 'Khách hàng Zalo'}
                        </p>
                        <span className="text-[10px] text-slate-400">
                          {new Date(conv.last_message_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400 truncate">
                          ID: {conv.chat_id.slice(0, 10)}...
                        </span>
                        {isHuman ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                            Cần nhân viên
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            AI tự động
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right pane: Chat Thread */}
        {activeConv ? (
          <div className="flex-1 flex flex-col justify-between overflow-hidden bg-slate-50/40">
            {/* Header */}
            <div className="h-14 border-b border-slate-100 px-6 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <User className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">
                    {activeConv.display_name || 'Khách hàng Zalo'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono">Chat ID: {activeConv.chat_id}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeConv.state === 'human' ? (
                  <button
                    onClick={handleReturnToAi}
                    className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Trả về cho AI
                  </button>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                    <Sparkles className="h-3.5 w-3.5" /> AI đang trả lời
                  </span>
                )}
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((msg) => {
                const isUser = msg.direction === 'in';
                const isAgent = msg.sender === 'agent';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-start' : 'items-end'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <span className="text-[10px] font-semibold text-slate-400">
                        {isUser ? activeConv.display_name || 'Khách hàng' : isAgent ? 'Nhân viên hỗ trợ' : 'Bot AI'}
                      </span>
                      <span className="text-[10px] text-slate-300">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div
                      className={`max-w-lg rounded-2xl p-3.5 text-xs leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? 'bg-white text-slate-800 shadow-sm border border-slate-100'
                          : isAgent
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-blue-600 text-white shadow-sm'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSendReply} className="p-4 bg-white border-t border-slate-100 flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Nhập tin nhắn phản hồi tới Zalo của khách hàng..."
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-xs focus:border-blue-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending || !replyText.trim()}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
              >
                <Send className="h-3.5 w-3.5" />
                Gửi
              </button>
            </form>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
            Chọn một cuộc hội thoại từ danh sách bên trái
          </div>
        )}
      </div>
    </div>
  );
}


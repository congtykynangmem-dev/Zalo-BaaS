'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import {
  Users,
  Search,
  Phone,
  Tag,
  Download,
  MessageSquare,
  Bot,
  Calendar,
  Send,
  Edit2,
  CheckCircle2,
  Clock,
  UserCheck,
  Sparkles,
  X,
  FileText,
} from 'lucide-react';

interface CustomerItem {
  id: string;
  tenant_id: string;
  bot_id: string;
  bot_name?: string;
  chat_id: string;
  display_name: string | null;
  phone: string | null;
  tags: string[];
  notes: string | null;
  total_messages: number;
  last_message_at: number;
  state: 'bot' | 'human';
}

interface CustomerStats {
  total: number;
  withPhone: number;
  vip: number;
  needsHuman: number;
}

interface MessageItem {
  id: string;
  sender: 'user' | 'bot' | 'agent';
  content: string;
  created_at: number;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [stats, setStats] = useState<CustomerStats>({ total: 0, withPhone: 0, vip: 0, needsHuman: 0 });
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedBot, setSelectedBot] = useState('all');
  const [bots, setBots] = useState<{ id: string; name: string }[]>([]);

  // Care Modal / Drawer
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);
  const [chatHistory, setChatHistory] = useState<MessageItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [sendMsgText, setSendMsgText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [modalError, setModalError] = useState('');

  // 1. Fetch bots
  const loadBots = async () => {
    try {
      const res = await fetchApi<{ bots: { id: string; name: string }[] }>('/v1/bots');
      setBots(res.bots || []);
    } catch (e) {
      console.warn('Failed to fetch bots:', e);
    }
  };

  // 2. Fetch customers
  const loadCustomers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      if (selectedTag) params.append('tag', selectedTag);
      if (selectedBot !== 'all') params.append('bot_id', selectedBot);

      const res = await fetchApi<{
        ok: boolean;
        customers: CustomerItem[];
        stats: CustomerStats;
        tags: string[];
      }>(`/v1/customers?${params.toString()}`);

      setCustomers(res.customers || []);
      setStats(res.stats || { total: 0, withPhone: 0, vip: 0, needsHuman: 0 });
      setAvailableTags(res.tags || []);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBots();
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [selectedTag, selectedBot]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadCustomers();
  };

  // 3. Open Care Drawer
  const handleOpenCareModal = async (customer: CustomerItem) => {
    setSelectedCustomer(customer);
    setEditPhone(customer.phone || '');
    setEditTags(customer.tags.join(', '));
    setEditNotes(customer.notes || '');
    setSaveSuccess(false);
    setModalError('');
    setSendMsgText('');
    setLoadingHistory(true);

    try {
      const res = await fetchApi<{
        ok: boolean;
        customer: CustomerItem;
        history: MessageItem[];
      }>(`/v1/customers/${customer.id}`);
      setChatHistory(res.history || []);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Không thể tải lịch sử tương tác');
    } finally {
      setLoadingHistory(false);
    }
  };

  // 4. Save Customer Info
  const handleSaveCustomerInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    setSavingCustomer(true);
    setModalError('');
    setSaveSuccess(false);

    try {
      const tagList = editTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetchApi<{ ok: boolean; customer: CustomerItem }>(
        `/v1/customers/${selectedCustomer.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            phone: editPhone.trim() || null,
            tags: tagList,
            notes: editNotes.trim() || null,
          }),
        }
      );

      setSelectedCustomer(res.customer);
      setSaveSuccess(true);
      await loadCustomers();
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Lỗi cập nhật khách hàng');
    } finally {
      setSavingCustomer(false);
    }
  };

  // 5. Send Direct Care Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !sendMsgText.trim()) return;

    setSendingMsg(true);
    setModalError('');

    try {
      await fetchApi(`/v1/customers/${selectedCustomer.id}/send`, {
        method: 'POST',
        body: JSON.stringify({ message: sendMsgText.trim() }),
      });

      // Add to local chat history
      setChatHistory((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}`,
          sender: 'agent',
          content: sendMsgText.trim(),
          created_at: Date.now(),
        },
      ]);
      setSendMsgText('');
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Không thể gửi tin nhắn qua Zalo Bot');
    } finally {
      setSendingMsg(false);
    }
  };

  // 6. Export CSV
  const handleExportCSV = () => {
    const token = localStorage.getItem('token');
    const apiUrl = process.env.NEXT_PUBLIC_CONTROL_API_URL || 'https://zalo-baas.n3.tinhgon.xyz';
    const params = new URLSearchParams();
    if (selectedBot !== 'all') params.append('bot_id', selectedBot);
    if (selectedTag) params.append('tag', selectedTag);

    // Direct browser download
    const downloadUrl = `${apiUrl}/v1/customers/export?${params.toString()}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    // Set authorization header via fetch blob
    fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `zalo_customers_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      })
      .catch((err) => alert('Lỗi tải file CSV: ' + err.message));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" />
            Quản lý Khách hàng (CRM)
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Lưu trữ danh bạ người dùng Zalo, phân loại nhãn, ghi chú CSKH và chăm sóc trực tiếp
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition"
          >
            <Download className="h-4 w-4 text-emerald-600" />
            Xuất Excel (CSV)
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Tổng khách hàng</span>
            <Users className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{stats.total}</div>
          <div className="mt-1 text-[11px] text-slate-400">Đã tương tác với Zalo Bot</div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Đã thu thập SĐT</span>
            <Phone className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{stats.withPhone}</div>
          <div className="mt-1 text-[11px] text-slate-400">
            Tỷ lệ: {stats.total > 0 ? Math.round((stats.withPhone / stats.total) * 100) : 0}%
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Khách hàng VIP</span>
            <Sparkles className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600">{stats.vip}</div>
          <div className="mt-1 text-[11px] text-slate-400">Được gắn nhãn VIP</div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Cần nhân viên CSKH</span>
            <UserCheck className="h-4 w-4 text-purple-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-600">{stats.needsHuman}</div>
          <div className="mt-1 text-[11px] text-slate-400">Đang ở chế độ Handover</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên hiển thị, SĐT hoặc Zalo ID..."
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2 text-xs focus:border-blue-600 focus:outline-none"
          />
        </form>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Bot filter */}
          <select
            value={selectedBot}
            onChange={(e) => setSelectedBot(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 bg-white focus:outline-none focus:border-blue-600"
          >
            <option value="all">Tất cả Bot</option>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                🤖 {b.name}
              </option>
            ))}
          </select>

          {/* Tag filter */}
          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 bg-white focus:outline-none focus:border-blue-600"
          >
            <option value="">Tất cả Nhãn</option>
            {availableTags.map((t) => (
              <option key={t} value={t}>
                🏷️ {t}
              </option>
            ))}
          </select>

          <button
            onClick={loadCustomers}
            className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition"
          >
            Lọc
          </button>
        </div>
      </div>

      {/* Customers List Table */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
        </div>
      ) : customers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-base font-bold text-slate-800">Chưa có khách hàng nào</h3>
          <p className="mt-1 text-xs text-slate-400">
            Khách hàng nhắn tin với Zalo Bot sẽ tự động được thu thập và hiển thị tại đây.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-6">Khách hàng / Zalo ID</th>
                <th className="py-3.5 px-6">Số điện thoại</th>
                <th className="py-3.5 px-6">Bot tiếp nhận</th>
                <th className="py-3.5 px-6">Nhãn phân loại</th>
                <th className="py-3.5 px-6">Ghi chú CSKH</th>
                <th className="py-3.5 px-6">Tương tác cuối</th>
                <th className="py-3.5 px-6 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-4 px-6">
                    <div className="font-bold text-slate-900">
                      {c.display_name || 'Khách hàng Zalo'}
                    </div>
                    <div className="font-mono text-[10px] text-slate-400">
                      ID: {c.chat_id}
                    </div>
                  </td>

                  <td className="py-4 px-6">
                    {c.phone ? (
                      <span className="font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        {c.phone}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Chưa có</span>
                    )}
                  </td>

                  <td className="py-4 px-6">
                    <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
                      <Bot className="h-3.5 w-3.5 text-blue-500" />
                      {c.bot_name || c.bot_id.slice(0, 8)}
                    </span>
                  </td>

                  <td className="py-4 px-6">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {c.tags && c.tags.length > 0 ? (
                        c.tags.map((tag) => (
                          <span
                            key={tag}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              tag.toLowerCase() === 'vip'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 text-[11px]">—</span>
                      )}
                    </div>
                  </td>

                  <td className="py-4 px-6">
                    <p className="max-w-xs truncate text-slate-600 text-[11px]">
                      {c.notes || '—'}
                    </p>
                  </td>

                  <td className="py-4 px-6 text-slate-400">
                    {new Date(c.last_message_at).toLocaleString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </td>

                  <td className="py-4 px-6 text-right">
                    <button
                      onClick={() => handleOpenCareModal(c)}
                      className="rounded-xl bg-blue-50 px-3 py-1.5 font-semibold text-blue-600 hover:bg-blue-100 transition inline-flex items-center gap-1.5"
                    >
                      <Edit2 className="h-3 w-3" />
                      Chăm sóc
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- CARE & PROFILE MODAL --- */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 my-8">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-blue-600" />
                  Hồ sơ Khách hàng & Chăm sóc Zalo
                </h2>
                <p className="text-xs text-slate-500">
                  {selectedCustomer.display_name || 'Khách hàng Zalo'} (ID: {selectedCustomer.chat_id})
                </p>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs text-red-600 border border-red-100">
                {modalError}
              </div>
            )}

            {saveSuccess && (
              <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700 border border-emerald-100 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Đã lưu thông tin khách hàng thành công!
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: CRM Fields */}
              <form onSubmit={handleSaveCustomerInfo} className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Thông tin Chăm sóc
                </h3>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Số điện thoại liên hệ
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="0986000797..."
                      className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-xs font-mono focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nhãn phân loại (cách nhau bằng dấu phẩy)
                  </label>
                  <div className="relative">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      placeholder="VIP, Khách quen, Quan tâm gà rán..."
                      className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div className="mt-1 flex gap-1.5 flex-wrap">
                    {['VIP', 'Khách quen', 'Cần tư vấn', 'Đã mua'].map((quickTag) => (
                      <button
                        type="button"
                        key={quickTag}
                        onClick={() => {
                          const current = editTags ? editTags.split(',').map((t) => t.trim()) : [];
                          if (!current.includes(quickTag)) {
                            setEditTags([...current, quickTag].join(', '));
                          }
                        }}
                        className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full"
                      >
                        +{quickTag}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ghi chú chi tiết của nhân viên CSKH
                  </label>
                  <textarea
                    rows={4}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Sở thích, món khoái khẩu, địa chỉ giao hàng, lưu ý đặc biệt..."
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-blue-600 focus:outline-none resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingCustomer}
                  className="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-1.5"
                >
                  {savingCustomer ? (
                    <>
                      <Clock className="h-3.5 w-3.5 animate-spin" /> Đang lưu...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Lưu hồ sơ khách hàng
                    </>
                  )}
                </button>
              </form>

              {/* Right Column: Interaction History & Send Message */}
              <div className="flex flex-col h-full border-t md:border-t-0 md:border-l md:pl-6 border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Lịch sử tương tác & Nhắn tin Zalo
                </h3>

                {/* Messages stream */}
                <div className="flex-1 bg-slate-50 p-3 rounded-xl border border-slate-100 max-h-56 overflow-y-auto space-y-2 mb-3">
                  {loadingHistory ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      <Clock className="h-4 w-4 animate-spin inline mr-1" /> Đang tải lịch sử...
                    </div>
                  ) : chatHistory.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      Chưa có tin nhắn nào được ghi nhận.
                    </div>
                  ) : (
                    chatHistory.map((m) => (
                      <div
                        key={m.id}
                        className={`p-2.5 rounded-xl text-xs max-w-[85%] ${
                          m.sender === 'user'
                            ? 'bg-white border border-slate-200 text-slate-800 self-start mr-auto'
                            : 'bg-blue-600 text-white self-end ml-auto'
                        }`}
                      >
                        <div className="text-[10px] opacity-75 mb-0.5 font-semibold">
                          {m.sender === 'user' ? 'Khách' : m.sender === 'bot' ? 'Zalo Bot' : 'CSKH'}
                        </div>
                        <div className="whitespace-pre-wrap">{m.content}</div>
                      </div>
                    ))
                  )}
                </div>

                {/* Direct Message Form */}
                <form onSubmit={handleSendMessage} className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={sendMsgText}
                      onChange={(e) => setSendMsgText(e.target.value)}
                      placeholder="Gửi tin nhắn trực tiếp qua Bot..."
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={sendingMsg || !sendMsgText.trim()}
                      className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-1"
                    >
                      {sendingMsg ? (
                        <Clock className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    💡 Tin nhắn sẽ được gửi trực tiếp đến Zalo của khách hàng thông qua Bot tương ứng.
                  </p>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


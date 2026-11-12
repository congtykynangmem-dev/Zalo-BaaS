'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  Bot,
  Plus,
  Copy,
  Check,
  Pause,
  Play,
  Trash2,
  ExternalLink,
  Smartphone,
  Sparkles,
  ShieldAlert,
  RefreshCw,
  SlidersHorizontal,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import Link from 'next/link';

const DEFAULT_BOT_PROMPT = `Trợ lý AI chăm sóc khách hàng chuyên nghiệp, thân thiện và chính xác.
- Luôn trả lời dựa trên Kho Tri thức riêng được gán cho Bot này, đúng lĩnh vực và thương hiệu của Bot.
- Khi khách hỏi bảng giá, gói cước hoặc sản phẩm: Báo đúng thông tin, mức giá và quyền lợi có trong tài liệu; không tự ý suy diễn thông tin ngoài tài liệu.
- Xưng Em, xưng hô lịch sự với khách hàng.`;

const PROMPT_TEMPLATES: Array<{ id: string; label: string; prompt: string }> = [
  {
    id: 'cskh',
    label: 'Mẫu CSKH / SaaS',
    prompt: `Trợ lý CSKH & Tư vấn dịch vụ chuyên nghiệp, chính xác.
- Giải đáp tính năng sản phẩm, hướng dẫn sử dụng và báo giá từng gói cước đúng theo tài liệu của Bot.
- Không nhầm lẫn với sản phẩm của ngành hàng khác.
- Khi cần hỗ trợ kỹ thuật chuyên sâu hoặc báo giá tùy biến, hướng dẫn khách để lại thông tin hoặc liên hệ bộ phận hỗ trợ.`,
  },
  {
    id: 'fb',
    label: 'Mẫu F&B / Nhà hàng',
    prompt: `Tư vấn bán hàng F&B chuyên nghiệp, nhiệt tình, thân thiện.
- Khi khách hỏi giá hoặc món cụ thể: Chỉ trả lời các món tương tự có trong thực đơn của quán và báo giá chính xác.
- Khi khách hỏi menu toàn quán: Cung cấp danh mục các nhóm món kèm thông tin đặt hàng có trong tài liệu.
- Xưng Em, phong cách gần gũi, lịch sự với khách hàng.`,
  },
  {
    id: 'retail',
    label: 'Mẫu Bán lẻ / Doanh nghiệp',
    prompt: `Chuyên viên tư vấn bán hàng & hỗ trợ doanh nghiệp.
- Báo giá, thông số sản phẩm, chính sách bảo hành và giao nhận đúng theo tài liệu sản phẩm của Bot.
- Trả lời ngắn gọn, rõ ràng bằng gạch đầu dòng.`,
  },
];

interface BotItem {
  id: string;
  name: string;
  zalo_bot_id?: string;
  username?: string;
  status: 'active' | 'paused' | 'error';
  system_prompt?: string;
  strict_grounding: number;
  rag_scope?: 'bot_only' | 'bot_and_global';
  dedicated_doc_count?: number;
  global_doc_count?: number;
  created_at: number;
  webhook_url?: string;
}

export default function BotsPage() {
  const { logout } = useAuth();
  const [bots, setBots] = useState<BotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingProfileId, setSyncingProfileId] = useState<string | null>(null);

  // Wizard state
  const [botToken, setBotToken] = useState('');
  const [customName, setCustomName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_BOT_PROMPT);
  const [strictGrounding, setStrictGrounding] = useState(true);
  const [ragScope, setRagScope] = useState<'bot_only' | 'bot_and_global'>('bot_only');
  const [submitting, setSubmitting] = useState(false);
  const [wizardError, setWizardError] = useState('');
  const [connectedBot, setConnectedBot] = useState<BotItem | null>(null);

  // Edit Bot Modal state
  const [editingBot, setEditingBot] = useState<BotItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [editStrict, setEditStrict] = useState(false);
  const [editRagScope, setEditRagScope] = useState<'bot_only' | 'bot_and_global'>('bot_only');
  const [savingBot, setSavingBot] = useState(false);
  const [editError, setEditError] = useState('');

  const loadBots = async () => {
    try {
      const res = await fetchApi<{ bots: BotItem[] }>('/v1/bots');
      setBots(res.bots);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBots();
  }, []);

  const handleCopyWebhook = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleConnectBot = async (e: React.FormEvent) => {
    e.preventDefault();
    setWizardError('');
    setSubmitting(true);

    try {
      const res = await fetchApi<{ ok: boolean; bot: BotItem }>('/v1/bots/connect', {
        method: 'POST',
        body: JSON.stringify({
          bot_token: botToken,
          name: customName.trim() || undefined,
          system_prompt: systemPrompt,
          strict_grounding: strictGrounding,
          rag_scope: ragScope,
        }),
      });

      setConnectedBot(res.bot);
      await loadBots();
    } catch (err: unknown) {
      setWizardError(err instanceof Error ? err.message : 'Kết nối thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (bot: BotItem) => {
    const action = bot.status === 'active' ? 'pause' : 'resume';
    try {
      await fetchApi(`/v1/bots/${bot.id}/${action}`, { method: 'POST' });
      await loadBots();
    } catch (err) {
      alert('Thao tác không thành công');
    }
  };

  const handleDeleteBot = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa Bot này không? Webhook Zalo sẽ tự động được gỡ bỏ.')) {
      return;
    }
    try {
      await fetchApi(`/v1/bots/${id}`, { method: 'DELETE' });
      await loadBots();
    } catch (err) {
      alert('Không thể xóa bot');
    }
  };

  const handleSyncWebhook = async (bot: BotItem) => {
    setSyncingId(bot.id);
    try {
      const res = await fetchApi<{ ok: boolean; webhook_url: string }>(`/v1/bots/${bot.id}/sync-webhook`, {
        method: 'POST',
      });
      alert(`Đã cập nhật Webhook lên Zalo thành công!\nURL: ${res.webhook_url}`);
      await loadBots();
    } catch (err: unknown) {
      alert(`Đồng bộ thất bại: ${err instanceof Error ? err.message : 'Lỗi không xác định'}`);
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncProfile = async (bot: BotItem) => {
    setSyncingProfileId(bot.id);
    try {
      const res = await fetchApi<{ ok: boolean; bot: { name: string; username?: string } }>(
        `/v1/bots/${bot.id}/sync-profile`,
        { method: 'POST' }
      );
      alert(`Đã cập nhật tên Bot từ Zalo thành công: "${res.bot.name}"!`);
      await loadBots();
    } catch (err: unknown) {
      alert(`Lấy tên từ Zalo thất bại: ${err instanceof Error ? err.message : 'Lỗi không xác định'}`);
    } finally {
      setSyncingProfileId(null);
    }
  };

  const handleOpenEditModal = (bot: BotItem) => {
    setEditingBot(bot);
    setEditName(bot.name);
    setEditPrompt(bot.system_prompt || DEFAULT_BOT_PROMPT);
    setEditStrict(Boolean(bot.strict_grounding));
    setEditRagScope(bot.rag_scope === 'bot_only' ? 'bot_only' : 'bot_and_global');
    setEditError('');
  };

  const handleSaveBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBot) return;
    setSavingBot(true);
    setEditError('');

    try {
      await fetchApi(`/v1/bots/${editingBot.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim() || editingBot.name,
          system_prompt: editPrompt.trim(),
          strict_grounding: editStrict,
          rag_scope: editRagScope,
        }),
      });
      await loadBots();
      setEditingBot(null);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Lưu cấu hình thất bại');
    } finally {
      setSavingBot(false);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Zalo Bot của bạn
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Quản lý và cấu hình các bot trí tuệ nhân tạo kết nối với Zalo Bot Platform
          </p>
        </div>
        <button
          onClick={() => {
            setShowWizard(true);
            setConnectedBot(null);
            setBotToken('');
            setWizardError('');
          }}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition"
        >
          <Plus className="h-4 w-4" />
          Kết nối Bot mới (10s)
        </button>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
        </div>
      ) : bots.length === 0 ? (
        /* Empty State */
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center bg-white">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 mb-4">
            <Bot className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Chưa có Bot nào được kết nối</h3>
          <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
            Bạn có thể tạo bot hoàn toàn miễn phí trên Zalo chỉ trong 1 phút mà không cần giấy phép kinh doanh.
          </p>
          <button
            onClick={() => setShowWizard(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
          >
            <Plus className="h-4 w-4" />
            Bắt đầu kết nối Bot ngay
          </button>
        </div>
      ) : (
        /* Bot Cards Grid */
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {bots.map((bot) => (
            <div
              key={bot.id}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold">
                    <Bot className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-bold text-slate-900">{bot.name}</h3>
                      <button
                        onClick={() => handleSyncProfile(bot)}
                        disabled={syncingProfileId === bot.id}
                        className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 font-medium bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded transition"
                        title="Đồng bộ tên và username mới nhất từ Zalo"
                      >
                        <RefreshCw className={`h-2.5 w-2.5 ${syncingProfileId === bot.id ? 'animate-spin' : ''}`} />
                        {syncingProfileId === bot.id ? 'Đang lấy...' : 'Lấy tên Zalo'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-400">
                      ID: {bot.zalo_bot_id || bot.id}
                      {bot.username && <span className="ml-1.5 font-medium text-blue-600">@{bot.username}</span>}
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    bot.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {bot.status === 'active' ? 'Hoạt động' : 'Tạm dừng'}
                </span>
              </div>

              {/* Bot Details */}
              <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-4 text-xs">
                <div className="flex items-center justify-between text-slate-500">
                  <span>Phạm vi Kho Tri thức:</span>
                  {bot.rag_scope === 'bot_only' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 border border-indigo-200">
                      Tách riêng Bot ({bot.dedicated_doc_count ?? 0} tài liệu)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 border border-slate-200">
                      Riêng ({bot.dedicated_doc_count ?? 0}) + Chung ({bot.global_doc_count ?? 0})
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>Chống ảo giác (Strict):</span>
                  <span className="font-semibold text-slate-700">
                    {bot.strict_grounding ? 'Bật (Chặt chẽ)' : 'Mặc định'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>Ngày kết nối:</span>
                  <span className="font-semibold text-slate-700">
                    {new Date(bot.created_at).toLocaleDateString('vi-VN')}
                  </span>
                </div>

                <div className="pt-1">
                  <Link
                    href={`/dashboard/knowledge?bot_id=${bot.id}`}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50/70 hover:bg-indigo-100/70 px-2.5 py-1 rounded-lg border border-indigo-100 transition"
                  >
                    <BookOpen className="h-3 w-3" />
                    Quản lý Kho Tri thức riêng của Bot →
                  </Link>
                </div>

                {/* Webhook Address */}
                {bot.webhook_url && (
                  <div className="pt-2 border-t border-slate-50">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                      <span className="font-semibold text-slate-600">Webhook Zalo:</span>
                      <button
                        onClick={() => handleCopyWebhook(bot.webhook_url || '', bot.id)}
                        className="text-blue-600 hover:underline flex items-center gap-1 font-medium"
                      >
                        {copiedId === bot.id ? (
                          <>
                            <Check className="h-3 w-3" /> Đã sao chép
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> Sao chép
                          </>
                        )}
                      </button>
                    </div>
                    <code className="block truncate text-[11px] font-mono bg-slate-50 p-1.5 rounded border border-slate-200 text-slate-600">
                      {bot.webhook_url}
                    </code>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                <button
                  onClick={() => handleSyncWebhook(bot)}
                  disabled={syncingId === bot.id}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
                  title="Cập nhật Webhook URL này lên hệ thống Zalo"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingId === bot.id ? 'animate-spin' : ''}`} />
                  {syncingId === bot.id ? 'Đang đồng bộ...' : 'Đồng bộ Webhook'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenEditModal(bot)}
                    className="flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-blue-600 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 transition"
                    title="Cấu hình chỉ thị Prompt và tính năng của Bot"
                  >
                    <SlidersHorizontal className="h-3 w-3 text-blue-600" /> Cấu hình & Prompt
                  </button>
                  <button
                    onClick={() => handleToggleStatus(bot)}
                    className={`flex items-center gap-1 text-xs font-semibold ${
                      bot.status === 'active'
                        ? 'text-amber-600 hover:text-amber-700'
                        : 'text-emerald-600 hover:text-emerald-700'
                    }`}
                  >
                    {bot.status === 'active' ? (
                      <>
                        <Pause className="h-3.5 w-3.5" /> Tạm dừng
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" /> Kích hoạt
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteBot(bot.id)}
                    className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Xóa
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- ONBOARDING WIZARD MODAL --- */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            {!connectedBot ? (
              <>
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-blue-600" />
                    <h2 className="text-lg font-bold text-slate-900">
                      Kết nối Zalo Bot mới (Chỉ mất 10 giây)
                    </h2>
                  </div>
                  <button
                    onClick={() => setShowWizard(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                </div>

                {/* Step 1 Guide */}
                <div className="mb-6 rounded-xl bg-blue-50/70 p-4 border border-blue-100 text-xs text-blue-900">
                  <p className="font-bold flex items-center gap-1.5 mb-2">
                    <Smartphone className="h-4 w-4 text-blue-600" />
                    Cách lấy Bot Token trên điện thoại:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-blue-800">
                    <li>Mở ứng dụng Zalo, gõ tìm OA <strong>"Zalo Bot Manager"</strong></li>
                    <li>Bấm mở mini app <strong>"Zalo Bot Creator"</strong></li>
                    <li>Chọn "Tạo bot" và copy chuỗi <strong>Bot Token</strong> được cấp</li>
                  </ol>
                </div>

                {wizardError && (
                  <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs text-red-600 border border-red-100 flex flex-col gap-2">
                    <p>{wizardError}</p>
                    {wizardError.includes('đăng xuất') && (
                      <button
                        type="button"
                        onClick={logout}
                        className="self-start px-3 py-1.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                      >
                        Đăng xuất & Đăng nhập lại
                      </button>
                    )}
                  </div>
                )}

                {/* Connect Form */}
                <form onSubmit={handleConnectBot} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Tên gợi nhớ cho Bot (Tùy chọn - Tự động lấy tên Zalo nếu bỏ trống)
                    </label>
                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Ví dụ: Gà rán Five Star - 41 Trần Phú"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Dán Zalo Bot Token <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={botToken}
                      onChange={(e) => {
                        let val = e.target.value.trim().replace(/^['"`\s]+|['"`\s]+$/g, '');
                        if (val.toLowerCase().startsWith('bot') && val.includes(':')) {
                          val = val.substring(3);
                        }
                        setBotToken(val);
                      }}
                      placeholder="Ví dụ: 123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-mono focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Chỉ thị phong cách của Bot (System Prompt)
                      </label>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {PROMPT_TEMPLATES.map((tpl) => (
                          <button
                            key={tpl.id}
                            type="button"
                            onClick={() => setSystemPrompt(tpl.prompt)}
                            className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded transition"
                          >
                            <Sparkles className="h-3 w-3 text-blue-600" />
                            {tpl.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      rows={4}
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="Hướng dẫn cách xưng hô, giọng điệu tư vấn, quy tắc báo giá..."
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono text-[11px]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Phạm vi Kho Tri thức RAG
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <label
                        className={`flex items-start gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                          ragScope === 'bot_only'
                            ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 font-semibold'
                            : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="ragScope"
                          checked={ragScope === 'bot_only'}
                          onChange={() => setRagScope('bot_only')}
                          className="mt-0.5 text-indigo-600"
                        />
                        <div>
                          <div className="font-bold">Chỉ tài liệu riêng của Bot (Khuyên dùng)</div>
                          <div className="text-[11px] text-slate-500 font-normal">
                            Tách biệt hoàn toàn dữ liệu giữa các Bot.
                          </div>
                        </div>
                      </label>
                      <label
                        className={`flex items-start gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                          ragScope === 'bot_and_global'
                            ? 'border-blue-600 bg-blue-50/70 text-blue-950 font-semibold'
                            : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="ragScope"
                          checked={ragScope === 'bot_and_global'}
                          onChange={() => setRagScope('bot_and_global')}
                          className="mt-0.5 text-blue-600"
                        />
                        <div>
                          <div className="font-bold">Tài liệu riêng + Dùng chung</div>
                          <div className="text-[11px] text-slate-500 font-normal">
                            Đọc cả kho riêng của Bot và tài liệu chung.
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="strict"
                      checked={strictGrounding}
                      onChange={(e) => setStrictGrounding(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="strict" className="text-xs font-medium text-slate-700">
                      Bật chế độ Strict Grounding (Chỉ trả lời nếu có trong tài liệu, chống bịa đặt 100%)
                    </label>
                  </div>

                  <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowWizard(false)}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                      {submitting ? 'Đang kết nối & Đăng ký Webhook...' : 'Xác minh & Kết nối'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* Success Card */
              <div className="text-center py-4">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Check className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Kết nối thành công!</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Bot <strong>{connectedBot.name}</strong> đã được liên kết và tự động cài đặt Webhook.
                </p>

                <div className="mt-6 rounded-xl bg-slate-50 p-4 border border-slate-200 text-left text-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-slate-600">Webhook URL:</span>
                    <button
                      onClick={() => handleCopyWebhook(connectedBot.webhook_url || '', connectedBot.id)}
                      className="flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      {copiedId === connectedBot.id ? (
                        <>
                          <Check className="h-3 w-3" /> Đã chép
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Sao chép
                        </>
                      )}
                    </button>
                  </div>
                  <code className="block truncate text-slate-700 bg-white p-2 rounded border border-slate-200 font-mono text-[11px]">
                    {connectedBot.webhook_url}
                  </code>
                </div>

                <div className="mt-6">
                  <button
                    onClick={() => setShowWizard(false)}
                    className="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
                  >
                    Hoàn tất & Quay về danh sách
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- EDIT BOT CONFIGURATION & PROMPT MODAL --- */}
      {editingBot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold">
                  <SlidersHorizontal className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Cấu hình & Chỉ thị Prompt ({editingBot.name})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Tinh chỉnh phong cách ứng xử, quy tắc báo giá và trả lời món ăn của Bot
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingBot(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs text-red-600 border border-red-100 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveBot} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Tên Bot hiển thị
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 font-semibold"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Chỉ thị phong cách (System Prompt)
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {PROMPT_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setEditPrompt(tpl.prompt)}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded transition"
                      >
                        <Sparkles className="h-3 w-3 text-blue-600" />
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={5}
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  placeholder="Nhập hướng dẫn cách thức trả lời, quy tắc tư vấn riêng cho Bot này..."
                  className="w-full rounded-xl border border-slate-200 p-3 text-xs focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono leading-relaxed"
                />
                <p className="mt-1 text-[11px] text-slate-400 leading-normal">
                  💡 Mẹo: Mỗi Bot nên có System Prompt và Kho Tri thức RAG riêng để không lẫn thông tin giữa các lĩnh vực/chi nhánh khác nhau.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Phạm vi Kho Tri thức RAG của Bot này
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    className={`flex items-start gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                      editRagScope === 'bot_only'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 font-semibold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="editRagScope"
                      checked={editRagScope === 'bot_only'}
                      onChange={() => setEditRagScope('bot_only')}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div>
                      <div className="font-bold">Chỉ tài liệu riêng của Bot</div>
                      <div className="text-[11px] text-slate-500 font-normal">
                        Cách ly hoàn toàn với tài liệu chung & Bot khác.
                      </div>
                    </div>
                  </label>
                  <label
                    className={`flex items-start gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                      editRagScope === 'bot_and_global'
                        ? 'border-blue-600 bg-blue-50/70 text-blue-950 font-semibold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="editRagScope"
                      checked={editRagScope === 'bot_and_global'}
                      onChange={() => setEditRagScope('bot_and_global')}
                      className="mt-0.5 text-blue-600"
                    />
                    <div>
                      <div className="font-bold">Tài liệu riêng + Dùng chung</div>
                      <div className="text-[11px] text-slate-500 font-normal">
                        Đọc cả tài liệu riêng và kho Dùng chung.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="editStrict"
                  checked={editStrict}
                  onChange={(e) => setEditStrict(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="editStrict" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Bật chế độ Strict Grounding (Chỉ trả lời nếu có trong tài liệu Kho Tri thức, chống bịa đặt 100%)
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingBot(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingBot}
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
                >
                  {savingBot ? 'Đang lưu...' : 'Lưu cấu hình'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


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
} from 'lucide-react';

interface BotItem {
  id: string;
  name: string;
  zalo_bot_id?: string;
  username?: string;
  status: 'active' | 'paused' | 'error';
  system_prompt?: string;
  strict_grounding: number;
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
  const [systemPrompt, setSystemPrompt] = useState('Tư vấn thân thiện, chuyên nghiệp.');
  const [strictGrounding, setStrictGrounding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [wizardError, setWizardError] = useState('');
  const [connectedBot, setConnectedBot] = useState<BotItem | null>(null);

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

                <div className="flex items-center gap-3">
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
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Chỉ thị phong cách của Bot (System Prompt)
                    </label>
                    <textarea
                      rows={2}
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="Hướng dẫn cách xưng hô, giọng điệu tư vấn..."
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
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
    </div>
  );
}


'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '@/lib/api';
import {
  BarChart3,
  Sparkles,
  Zap,
  Users,
  UserCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Calendar,
  Bot,
  BookOpen,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

interface BotItem {
  id: string;
  name: string;
}

interface StatsData {
  bot?: { id: string; name: string };
  plan: { id: string; name: string; monthly_limit: number };
  resources?: {
    bots: { current: number; max: number };
    documents: { current: number; max: number };
  };
  usage: {
    current_month: string;
    ai_messages: number;
    quota_percent: number;
    tokens_in: number;
    tokens_out: number;
    estimated_cost_usd: number;
    is_quota_exceeded: boolean;
    is_quota_warning: boolean;
  };
  counts: {
    total_conversations: number;
    total_handovers: number;
  };
  daily_breakdown: Array<{
    day: string;
    ai_messages: number;
    tokens_in: number;
    tokens_out: number;
  }>;
}

const DEFAULT_STATS: StatsData = {
  bot: { id: 'all', name: 'Toàn bộ Doanh nghiệp (Tổng quan)' },
  plan: { id: 'starter', name: 'Starter', monthly_limit: 3000 },
  resources: {
    bots: { current: 0, max: 1 },
    documents: { current: 0, max: 10 },
  },
  usage: {
    current_month: new Date().toISOString().slice(0, 7),
    ai_messages: 0,
    quota_percent: 0,
    tokens_in: 0,
    tokens_out: 0,
    estimated_cost_usd: 0,
    is_quota_exceeded: false,
    is_quota_warning: false,
  },
  counts: {
    total_conversations: 0,
    total_handovers: 0,
  },
  daily_breakdown: [],
};

export default function AnalyticsPage() {
  const [bots, setBots] = useState<BotItem[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string>('all');
  const [stats, setStats] = useState<StatsData>(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    async function loadBots() {
      try {
        const res = await fetchApi<{ bots: BotItem[] }>('/v1/bots');
        if (res?.bots) {
          setBots(res.bots);
        }
      } catch (err) {
        console.warn('Failed to load bots:', err);
      } finally {
        setLoading(false);
      }
    }
    loadBots();
  }, []);

  const loadStats = async (botId: string) => {
    setStatsLoading(true);
    try {
      if (botId === 'all') {
        const res = await fetchApi<StatsData>('/v1/analytics/overview');
        if (res && res.usage) {
          setStats(res);
        }
      } else {
        const res = await fetchApi<StatsData>(`/v1/analytics/bots/${botId}/stats`);
        if (res && res.usage) {
          setStats(res);
        }
      }
    } catch (err) {
      console.warn('Failed to load stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    loadStats(selectedBotId);
  }, [selectedBotId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-600" />
            Thống kê Tiêu thụ & Hạn mức Quota
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Giám sát số lượng tin nhắn AI, tiêu thụ tokens và hạn mức gói cước theo thời gian thực
          </p>
        </div>

        {/* Bot Selector Dropdown */}
        <div className="flex items-center gap-3">
          <select
            value={selectedBotId}
            onChange={(e) => setSelectedBotId(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-blue-600 focus:outline-none"
          >
            <option value="all">📊 Toàn bộ Doanh nghiệp (Tổng quan)</option>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                🤖 Bot: {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Empty State Banner if No Bots Connected */}
      {bots.length === 0 && (
        <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Doanh nghiệp chưa kết nối Zalo Bot nào</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Hãy kết nối Official Account hoặc Zalo Bot cá nhân để bắt đầu tự động hóa chăm sóc khách hàng 24/7.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/bots"
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition shadow-sm shrink-0"
          >
            Kết nối Zalo Bot ngay
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* Quota Progress Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Hạn mức tin nhắn AI tháng {stats.usage.current_month}
              </h3>
              <p className="text-xs text-slate-500">
                Gói cước: <strong className="text-blue-700">{stats.plan.name}</strong>
                {selectedBotId !== 'all' && stats.bot && (
                  <span className="ml-2 text-slate-400">| Đang lọc: <strong>{stats.bot.name}</strong></span>
                )}
              </p>
            </div>
          </div>

          <div>
            {stats.usage.is_quota_exceeded ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600 border border-red-200">
                <XCircle className="h-3.5 w-3.5" /> Đã chạm trần 100%
              </span>
            ) : stats.usage.is_quota_warning ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-600 border border-amber-200">
                <AlertTriangle className="h-3.5 w-3.5" /> Cảnh báo {stats.usage.quota_percent}%
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600 border border-emerald-200">
                <CheckCircle className="h-3.5 w-3.5" /> An toàn ({stats.usage.quota_percent}%)
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-700">
              {stats.usage.ai_messages.toLocaleString()} / {stats.plan.monthly_limit.toLocaleString()} tin nhắn AI
            </span>
            <span className="text-slate-500">{stats.usage.quota_percent}%</span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                stats.usage.is_quota_exceeded
                  ? 'bg-red-500'
                  : stats.usage.is_quota_warning
                  ? 'bg-amber-500'
                  : 'bg-blue-600'
              }`}
              style={{ width: `${Math.min(100, stats.usage.quota_percent)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
            <span>Tokens Đầu vào</span>
            <Zap className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono">
            {stats.usage.tokens_in.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Ngữ cảnh & Lịch sử gửi vào Gemini</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
            <span>Tokens Đầu ra</span>
            <Sparkles className="h-4 w-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono">
            {stats.usage.tokens_out.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Nội dung câu trả lời do AI sinh ra</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
            <span>Chi phí AI ước tính</span>
            <span className="text-xs font-mono font-bold text-slate-600">$ USD</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600 font-mono">
            ${stats.usage.estimated_cost_usd}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Giá Gemini 2.5 Flash API</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
            <span>Chuyển giao người thật</span>
            <UserCheck className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono">
            {stats.counts.total_handovers}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Lượt yêu cầu tư vấn viên hỗ trợ</p>
        </div>
      </div>

      {/* Daily Breakdown Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-600" />
            <h3 className="font-bold text-sm text-slate-900">Chi tiết tiêu thụ theo ngày (30 ngày gần nhất)</h3>
          </div>
          {statsLoading && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              Đang tải dữ liệu...
            </div>
          )}
        </div>

        {stats.daily_breakdown.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            Chưa có phát sinh tin nhắn AI hoặc dữ liệu tiêu thụ trong 30 ngày qua
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-6">Ngày</th>
                  <th className="py-3 px-6">Số tin nhắn AI</th>
                  <th className="py-3 px-6">Tokens Đầu vào</th>
                  <th className="py-3 px-6">Tokens Đầu ra</th>
                  <th className="py-3 px-6 text-right">Tổng Tokens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                {stats.daily_breakdown.map((row) => (
                  <tr key={row.day} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-6 font-semibold text-slate-900">{row.day}</td>
                    <td className="py-3.5 px-6 text-blue-600 font-bold">{row.ai_messages}</td>
                    <td className="py-3.5 px-6 text-slate-600">{row.tokens_in.toLocaleString()}</td>
                    <td className="py-3.5 px-6 text-slate-600">{row.tokens_out.toLocaleString()}</td>
                    <td className="py-3.5 px-6 text-right font-bold text-slate-900">
                      {(row.tokens_in + row.tokens_out).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

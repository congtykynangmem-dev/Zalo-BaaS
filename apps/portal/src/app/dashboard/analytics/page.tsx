'use client';

import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';

interface BotItem {
  id: string;
  name: string;
}

interface StatsData {
  bot: { id: string; name: string };
  plan: { id: string; name: string; monthly_limit: number };
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

export default function AnalyticsPage() {
  const [bots, setBots] = useState<BotItem[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string>('');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);

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
      } finally {
        setLoading(false);
      }
    }
    loadBots();
  }, []);

  const loadStats = async (botId: string) => {
    if (!botId) return;
    setStatsLoading(true);
    try {
      const res = await fetchApi<StatsData>(`/v1/analytics/bots/${botId}/stats`);
      setStats(res);
    } catch (err) {
      console.error(err);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedBotId) {
      loadStats(selectedBotId);
    }
  }, [selectedBotId]);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Thống kê Tiêu thụ & Hạn mức Quota
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Giám sát số lượng tin nhắn AI, tiêu thụ tokens và hạn mức gói cước theo thời gian thực
          </p>
        </div>

        {bots.length > 0 && (
          <select
            value={selectedBotId}
            onChange={(e) => setSelectedBotId(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-blue-600 focus:outline-none"
          >
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                Bot: {b.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading || statsLoading || !stats ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Quota Progress Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Hạn mức tin nhắn AI tháng {stats.usage.current_month}</h3>
                  <p className="text-xs text-slate-500">Gói cước: <strong className="text-slate-800">{stats.plan.name}</strong></p>
                </div>
              </div>

              <div>
                {stats.usage.is_quota_exceeded ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600 border border-red-200">
                    <XCircle className="h-3.5 w-3.5" /> Đã chạm trần 100%
                  </span>
                ) : stats.usage.is_quota_warning ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-600 border border-amber-200">
                    <AlertTriangle className="h-3.5 w-3.5" /> Cảnh báo {stats.usage.quota_percent}%
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600 border border-emerald-200">
                    <CheckCircle className="h-3.5 w-3.5" /> An toàn ({stats.usage.quota_percent}%)
                  </span>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs font-semibold mb-1.5">
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
                  style={{ width: `${stats.usage.quota_percent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
                <span>Tokens Input</span>
                <Zap className="h-4 w-4 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-slate-900 font-mono">
                {stats.usage.tokens_in.toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Ngữ cảnh & Lịch sử gửi vào Gemini</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
                <span>Tokens Output</span>
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
            <div className="p-5 border-b border-slate-100 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              <h3 className="font-bold text-sm text-slate-900">Chi tiết tiêu thụ theo ngày (30 ngày gần nhất)</h3>
            </div>

            {stats.daily_breakdown.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Chưa có dữ liệu tiêu thụ trong 30 ngày qua
              </div>
            ) : (
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}


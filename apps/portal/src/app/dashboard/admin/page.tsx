'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  Building,
  Users,
  Bot,
  BookOpen,
  DollarSign,
  Zap,
  Lock,
  Unlock,
  Plus,
  CheckCircle2,
  Clock,
  Sparkles,
  BarChart3,
  Search,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';

interface AdminStats {
  total_tenants: number;
  total_users: number;
  total_active_bots: number;
  total_documents: number;
  total_ai_messages: number;
  monthly_revenue_vnd: number;
}

interface TenantItem {
  id: string;
  name: string;
  plan_id: string;
  plan_name: string;
  price_vnd: number;
  max_bots?: number;
  max_documents?: number;
  monthly_ai_messages?: number;
  status: 'active' | 'suspended';
  contact_email: string;
  created_at: number;
  bot_count: number;
  doc_count: number;
  ai_messages_count: number;
}

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Create Tenant Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newPlanId, setNewPlanId] = useState('starter');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Edit Tenant Modal
  const [editingTenant, setEditingTenant] = useState<TenantItem | null>(null);
  const [editPlanId, setEditPlanId] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'suspended'>('active');
  const [updatingTenant, setUpdatingTenant] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'platform_owner') {
      router.push('/dashboard');
    }
  }, [user, router]);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [overviewRes, tenantsRes] = await Promise.all([
        fetchApi<{ ok: boolean; stats: AdminStats }>('/v1/admin/overview'),
        fetchApi<{ ok: boolean; tenants: TenantItem[] }>('/v1/admin/tenants'),
      ]);
      setStats(overviewRes.stats || null);
      setTenants(tenantsRes.tenants || []);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'platform_owner') {
      loadAdminData();
    }
  }, [user]);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim() || !newAdminEmail.trim() || !newAdminPassword.trim()) {
      setCreateError('Vui lòng điền đầy đủ thông tin');
      return;
    }

    setCreating(true);
    setCreateError('');

    try {
      await fetchApi('/v1/admin/tenants', {
        method: 'POST',
        body: JSON.stringify({
          name: newTenantName.trim(),
          tenant_name: newTenantName.trim(),
          email: newAdminEmail.trim(),
          admin_email: newAdminEmail.trim(),
          password: newAdminPassword.trim(),
          admin_password: newAdminPassword.trim(),
          plan_id: newPlanId,
        }),
      });

      setShowCreateModal(false);
      setNewTenantName('');
      setNewAdminEmail('');
      setNewAdminPassword('');
      await loadAdminData();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Lỗi tạo doanh nghiệp');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;

    setUpdatingTenant(true);

    try {
      await fetchApi(`/v1/admin/tenants/${editingTenant.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          plan_id: editPlanId,
          status: editStatus,
        }),
      });

      setEditingTenant(null);
      await loadAdminData();
    } catch (err) {
      alert('Lỗi cập nhật doanh nghiệp');
    } finally {
      setUpdatingTenant(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  const filteredTenants = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.contact_email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-indigo-600" />
            Quản trị Tổng thể Hệ thống
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Dành riêng cho Platform Owner: Quản lý toàn bộ Doanh nghiệp, doanh thu, gói cước và hạ tầng AI
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 transition shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Cấp Doanh nghiệp Mới
        </button>
      </div>

      {/* KPI Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Doanh nghiệp</span>
              <Building className="h-4 w-4 text-blue-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{stats.total_tenants}</div>
            <div className="mt-1 text-[11px] text-slate-400">Khách hàng DN đăng ký</div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Doanh thu / tháng</span>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-600">
              {stats.monthly_revenue_vnd.toLocaleString('vi-VN')} đ
            </div>
            <div className="mt-1 text-[11px] text-emerald-600 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Dự thu từ các gói
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Zalo Bot Active</span>
              <Bot className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-indigo-600">{stats.total_active_bots}</div>
            <div className="mt-1 text-[11px] text-slate-400">Đang phục vụ khách hàng</div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Tài liệu RAG</span>
              <BookOpen className="h-4 w-4 text-purple-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-purple-600">{stats.total_documents}</div>
            <div className="mt-1 text-[11px] text-slate-400">Trong vector store</div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Lưu lượng AI</span>
              <Zap className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-600">
              {stats.total_ai_messages.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Tin nhắn AI xử lý</div>
          </div>
        </div>
      )}

      {/* Tenants Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">Danh sách Doanh nghiệp (Tenants)</h2>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên doanh nghiệp, email..."
              className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-1.5 text-xs focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-6">Doanh nghiệp</th>
                <th className="py-3.5 px-6">Gói cước</th>
                <th className="py-3.5 px-6">Trạng thái</th>
                <th className="py-3.5 px-6">Tài nguyên (Bot / RAG)</th>
                <th className="py-3.5 px-6">Lưu lượng AI</th>
                <th className="py-3.5 px-6">Ngày tạo</th>
                <th className="py-3.5 px-6 text-right">Quản trị</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredTenants.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-4 px-6">
                    <div className="font-bold text-slate-900">{t.name}</div>
                    <div className="text-[11px] text-slate-400">{t.contact_email}</div>
                  </td>

                  <td className="py-4 px-6">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        t.plan_id === 'enterprise'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : t.plan_id === 'pro'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {t.plan_name}
                    </span>
                  </td>

                  <td className="py-4 px-6">
                    {t.status === 'active' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-emerald-200">
                        <CheckCircle2 className="h-3 w-3" /> Hoạt động
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-red-200">
                        <Lock className="h-3 w-3" /> Đã tạm khóa
                      </span>
                    )}
                  </td>

                  <td className="py-4 px-6">
                    <div className="space-y-1.5 min-w-[130px]">
                      <div>
                        <div className="flex items-center justify-between text-[11px] mb-0.5">
                          <span className="text-slate-500 font-medium">Bot:</span>
                          <span className="font-bold text-blue-700">{t.bot_count} / {t.max_bots || 1}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full"
                            style={{ width: `${Math.min(100, Math.round((t.bot_count / (t.max_bots || 1)) * 100))}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-[11px] mb-0.5">
                          <span className="text-slate-500 font-medium">RAG:</span>
                          <span className="font-bold text-indigo-700">{t.doc_count} / {t.max_documents || 5}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-600 rounded-full"
                            style={{ width: `${Math.min(100, Math.round((t.doc_count / (t.max_documents || 5)) * 100))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-4 px-6">
                    <div className="space-y-1 min-w-[130px]">
                      <div className="flex items-center justify-between text-[11px] mb-0.5">
                        <span className="text-slate-500 font-medium">AI msgs:</span>
                        <span className="font-bold text-emerald-700 font-mono">
                          {t.ai_messages_count.toLocaleString()} / {(t.monthly_ai_messages || 1000).toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full"
                          style={{ width: `${Math.min(100, Math.round((t.ai_messages_count / (t.monthly_ai_messages || 1000)) * 100))}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  <td className="py-4 px-6 text-slate-400">
                    {new Date(t.created_at).toLocaleDateString('vi-VN')}
                  </td>

                  <td className="py-4 px-6 text-right">
                    <button
                      onClick={() => {
                        setEditingTenant(t);
                        setEditPlanId(t.plan_id);
                        setEditStatus(t.status);
                      }}
                      className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                      Cấu hình
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- CREATE TENANT MODAL --- */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Building className="h-5 w-5 text-blue-600" />
                Cấp tài khoản Doanh nghiệp mới
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs text-red-600 border border-red-100">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateTenant} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên Doanh nghiệp / Thương hiệu
                </label>
                <input
                  type="text"
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                  placeholder="Công ty TNHH Kỹ Năng Mềm..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Admin quản trị
                </label>
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="admin@doanhnghiep.com"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mật khẩu khởi tạo
                </label>
                <input
                  type="password"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  placeholder="Mật khẩu ít nhất 8 ký tự..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Gói cước phân bổ
                </label>
                <select
                  value={newPlanId}
                  onChange={(e) => setNewPlanId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                >
                  <option value="starter">Starter (199.000 đ/tháng)</option>
                  <option value="pro">Pro (599.000 đ/tháng)</option>
                  <option value="enterprise">Enterprise (1.990.000 đ/tháng)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? 'Đang tạo...' : 'Tạo doanh nghiệp'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT TENANT MODAL --- */}
      {editingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                Cấu hình: {editingTenant.name}
              </h3>
              <button
                onClick={() => setEditingTenant(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 rounded-xl bg-slate-50 p-3.5 border border-slate-200/80 text-xs space-y-2">
              <div className="font-bold text-slate-700">Hạn mức tài nguyên hiện tại:</div>
              <div className="flex justify-between text-slate-600">
                <span>Số Bot kết nối:</span>
                <span className="font-bold text-blue-700">{editingTenant.bot_count} / {editingTenant.max_bots || 1}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Kho tài liệu RAG:</span>
                <span className="font-bold text-indigo-700">{editingTenant.doc_count} / {editingTenant.max_documents || 5}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tin nhắn AI tháng này:</span>
                <span className="font-bold text-emerald-700">{editingTenant.ai_messages_count.toLocaleString()} / {(editingTenant.monthly_ai_messages || 1000).toLocaleString()}</span>
              </div>
            </div>

            <form onSubmit={handleUpdateTenant} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Đổi gói cước
                </label>
                <select
                  value={editPlanId}
                  onChange={(e) => setEditPlanId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                >
                  <option value="starter">Starter (1 Bot, 5 Docs, 1.000 msgs)</option>
                  <option value="pro">Pro (3 Bots, 20 Docs, 10.000 msgs)</option>
                  <option value="enterprise">Enterprise (10 Bots, 100 Docs, 50.000 msgs)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Trạng thái hoạt động
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as 'active' | 'suspended')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                >
                  <option value="active">Hoạt động bình thường</option>
                  <option value="suspended">Tạm khóa tài khoản</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingTenant(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={updatingTenant}
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {updatingTenant ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


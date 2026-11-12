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
  Plus,
  CheckCircle2,
  Clock,
  Sparkles,
  BarChart3,
  Search,
  TrendingUp,
  Globe,
  CreditCard,
  Mail,
  Send,
  Save,
  RefreshCw,
  Eye,
  AlertCircle,
  PhoneCall,
  QrCode,
  ExternalLink,
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
  subscription_started_at?: number | null;
  subscription_expires_at?: number | null;
  payment_status?: 'paid' | 'pending' | 'trial' | 'expired';
  days_left?: number;
  is_expired?: boolean;
  bot_count: number;
  doc_count: number;
  ai_messages_count: number;
}

interface WebsiteContact {
  company_name: string;
  brand_name: string;
  hotline: string;
  contact_email: string;
  address: string;
  working_hours: string;
  website_url: string;
  zalo_oa_url?: string;
}

interface BankAccount {
  bank_id: string;
  bank_name: string;
  account_no: string;
  account_name: string;
}

interface EmailConfig {
  sender_email: string;
  sender_name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  auto_send_on_payment: boolean;
}

interface EmailLogItem {
  id: string;
  to_email: string;
  from_email: string;
  subject: string;
  status: string;
  error?: string;
  metadata?: any;
  content_html?: string;
  created_at: number;
}

const POPULAR_BANKS = [
  { id: 'MB', name: 'MBBank - Ngân hàng TMCP Quân Đội' },
  { id: 'VCB', name: 'Vietcombank - Ngân hàng TMCP Ngoại Thương Việt Nam' },
  { id: 'CTG', name: 'VietinBank - Ngân hàng TMCP Công Thương Việt Nam' },
  { id: 'BIDV', name: 'BIDV - Ngân hàng TMCP Đầu Tư và Phát Triển Việt Nam' },
  { id: 'TCB', name: 'Techcombank - Ngân hàng TMCP Kỹ Thương Việt Nam' },
  { id: 'ACB', name: 'ACB - Ngân hàng TMCP Á Châu' },
  { id: 'VPB', name: 'VPBank - Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { id: 'TPB', name: 'TPBank - Ngân hàng TMCP Tiên Phong' },
  { id: 'STB', name: 'Sacombank - Ngân hàng TMCP Sài Gòn Thương Tín' },
  { id: 'HDB', name: 'HDBank - Ngân hàng TMCP Phát Triển TP.HCM' },
  { id: 'VIB', name: 'VIB - Ngân hàng TMCP Quốc Tế Việt Nam' },
];

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Active Admin Tab
  const [activeTab, setActiveTab] = useState<'tenants' | 'website' | 'bank' | 'email'>('tenants');

  // Tenants Data
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Settings Data
  const [contactForm, setContactForm] = useState<WebsiteContact>({
    company_name: 'CÔNG TY TNHH KỸ NĂNG MỀM',
    brand_name: 'Zalo BaaS',
    hotline: '0986.000.797',
    contact_email: 'congtykynangmem@gmail.com',
    address: 'Số 41 Trần Phú, Phường Phước Hậu, TP. Vĩnh Long, Tỉnh Vĩnh Long',
    working_hours: '08:00 – 21:00 hàng ngày (Hỗ trợ 24/7)',
    website_url: 'https://bot.knm.asia',
    zalo_oa_url: 'https://zalo.me/0986000797',
  });

  const [bankForm, setBankForm] = useState<BankAccount>({
    bank_id: 'MB',
    bank_name: 'MBBank - Ngân hàng TMCP Quân Đội',
    account_no: '0986000797',
    account_name: 'CONG TY KY NANG MEM',
  });

  const [emailForm, setEmailForm] = useState<EmailConfig>({
    sender_email: 'congtykynangmem@gmail.com',
    sender_name: 'Zalo BaaS - Kỹ Năng Mềm',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 465,
    smtp_user: 'congtykynangmem@gmail.com',
    smtp_pass: '',
    auto_send_on_payment: true,
  });

  const [emailLogs, setEmailLogs] = useState<EmailLogItem[]>([]);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testMessage, setTestMessage] = useState<{ text: string; success: boolean } | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // View Email Modal
  const [viewingEmail, setViewingEmail] = useState<EmailLogItem | null>(null);

  // Create Tenant Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newPlanId, setNewPlanId] = useState('starter');
  const [newSubscriptionDays, setNewSubscriptionDays] = useState(30);
  const [newPaymentStatus, setNewPaymentStatus] = useState<'paid' | 'pending' | 'trial'>('paid');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Edit Tenant Modal
  const [editingTenant, setEditingTenant] = useState<TenantItem | null>(null);
  const [editPlanId, setEditPlanId] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'suspended'>('active');
  const [editPaymentStatus, setEditPaymentStatus] = useState<'paid' | 'pending' | 'trial' | 'expired'>('paid');
  const [editExtendDays, setEditExtendDays] = useState(0);
  const [updatingTenant, setUpdatingTenant] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'platform_owner') {
      router.push('/dashboard');
    }
  }, [user, router]);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      // 1. Overview metrics
      try {
        const overviewRes = await fetchApi<{ ok: boolean; stats: AdminStats }>('/v1/admin/overview');
        if (overviewRes?.stats) setStats(overviewRes.stats);
      } catch (e) {
        console.warn('Failed to load admin overview:', e);
      }

      // 2. Tenants list
      try {
        const tenantsRes = await fetchApi<{ ok: boolean; tenants: TenantItem[] }>('/v1/admin/tenants');
        if (tenantsRes?.tenants) setTenants(tenantsRes.tenants);
      } catch (e) {
        console.warn('Failed to load admin tenants:', e);
      }

      // 3. System settings
      try {
        const settingsRes = await fetchApi<{
          ok: boolean;
          settings: { contact: WebsiteContact; bank: BankAccount; email: EmailConfig };
        }>('/v1/admin/settings');
        if (settingsRes?.settings) {
          if (settingsRes.settings.contact) setContactForm(settingsRes.settings.contact);
          if (settingsRes.settings.bank) setBankForm(settingsRes.settings.bank);
          if (settingsRes.settings.email) setEmailForm(settingsRes.settings.email);
        }
      } catch (e) {
        console.warn('Failed to load settings:', e);
      }

      // 4. Email logs
      try {
        const logsRes = await fetchApi<{ ok: boolean; logs: EmailLogItem[] }>('/v1/admin/email-logs');
        if (logsRes?.logs) setEmailLogs(logsRes.logs);
      } catch (e) {
        console.warn('Failed to load email logs:', e);
      }
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

  // Handle Save Settings
  const handleSaveSettings = async (type: 'website' | 'bank' | 'email') => {
    setSavingSettings(true);
    setSettingsSuccess(null);

    try {
      const payload: any = {};
      if (type === 'website') payload.website_contact = contactForm;
      if (type === 'bank') payload.bank_account = bankForm;
      if (type === 'email') {
        const cleanSender = emailForm.sender_email.trim();
        payload.email_config = {
          ...emailForm,
          sender_email: cleanSender,
          smtp_user: emailForm.smtp_user?.trim() || cleanSender,
          smtp_pass: emailForm.smtp_pass.replace(/\s+/g, '').trim(),
        };
      }

      await fetchApi('/v1/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      setSettingsSuccess(
        type === 'website'
          ? 'Đã cập nhật thông tin Website & Liên hệ thành công!'
          : type === 'bank'
          ? 'Đã cập nhật tài khoản Ngân hàng nhận tiền thành công!'
          : 'Đã cập nhật cấu hình Email gửi thông báo thành công!'
      );
      setTimeout(() => setSettingsSuccess(null), 4000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Lỗi cập nhật cấu hình');
    } finally {
      setSavingSettings(false);
    }
  };

  // Handle Send Test Email
  const handleSendTestEmail = async () => {
    if (!testEmailAddress.trim()) {
      alert('Vui lòng nhập địa chỉ email nhận thư');
      return;
    }

    setSendingTest(true);
    setTestMessage(null);

    try {
      const res = await fetchApi<{ ok: boolean; message: string; error?: string; result: any }>('/v1/admin/send-test-email', {
        method: 'POST',
        body: JSON.stringify({ to_email: testEmailAddress.trim() }),
      });

      const isFailed = !res.ok || res.result?.status === 'failed';
      setTestMessage({
        text: isFailed
          ? res.error || res.result?.error || res.message || 'Gửi email thử nghiệm thất bại'
          : res.message || 'Đã gửi email thử nghiệm thành công!',
        success: !isFailed,
      });
    } catch (err: unknown) {
      setTestMessage({
        text: err instanceof Error ? err.message : 'Lỗi gửi email thử nghiệm',
        success: false,
      });
    } finally {
      setSendingTest(false);
      try {
        const logsRes = await fetchApi<{ ok: boolean; logs: EmailLogItem[] }>('/v1/admin/email-logs');
        if (logsRes?.logs) setEmailLogs(logsRes.logs);
      } catch {}
    }
  };

  // Handle Create Tenant
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
          subscription_days: newPlanId === 'trial' ? 7 : newSubscriptionDays,
          payment_status: newPlanId === 'trial' ? 'trial' : newPaymentStatus,
        }),
      });

      setShowCreateModal(false);
      setNewTenantName('');
      setNewAdminEmail('');
      setNewAdminPassword('');
      setNewSubscriptionDays(30);
      setNewPaymentStatus('paid');
      await loadAdminData();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Lỗi tạo doanh nghiệp');
    } finally {
      setCreating(false);
    }
  };

  // Handle Update Tenant
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
          payment_status: editPaymentStatus,
          extend_days: editExtendDays > 0 ? editExtendDays : undefined,
        }),
      });

      setEditingTenant(null);
      setEditExtendDays(0);
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
            Dành riêng cho Platform Owner: Quản lý Doanh nghiệp, Website, Tài khoản Ngân hàng và Cấu hình Email gửi thông báo
          </p>
        </div>

        {activeTab === 'tenants' && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 transition shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Cấp Doanh nghiệp Mới
          </button>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('tenants')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === 'tenants'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Building className="h-4 w-4" />
          <span>Doanh nghiệp & Hạn mức ({tenants.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('website')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === 'website'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Globe className="h-4 w-4" />
          <span>Website & Hỗ trợ - Liên hệ</span>
        </button>

        <button
          onClick={() => setActiveTab('bank')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === 'bank'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <CreditCard className="h-4 w-4" />
          <span>Tài khoản Ngân hàng nhận tiền</span>
        </button>

        <button
          onClick={() => setActiveTab('email')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === 'email'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Mail className="h-4 w-4" />
          <span>Cấu hình Email & Lịch sử gửi</span>
        </button>
      </div>

      {settingsSuccess && (
        <div className="rounded-2xl bg-emerald-50 p-4 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{settingsSuccess}</span>
        </div>
      )}

      {/* ================= TAB 1: DOANH NGHIỆP (TENANTS) ================= */}
      {activeTab === 'tenants' && (
        <div className="space-y-8">
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
                    <th className="py-3.5 px-5">Doanh nghiệp</th>
                    <th className="py-3.5 px-4">Gói cước</th>
                    <th className="py-3.5 px-4">Thời hạn gói</th>
                    <th className="py-3.5 px-4">Thanh toán</th>
                    <th className="py-3.5 px-4">Trạng thái</th>
                    <th className="py-3.5 px-4">Tài nguyên (Bot / RAG)</th>
                    <th className="py-3.5 px-4">Lưu lượng AI</th>
                    <th className="py-3.5 px-4">Ngày tạo</th>
                    <th className="py-3.5 px-5 text-right">Quản trị</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredTenants.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-4 px-5">
                        <div className="font-bold text-slate-900">{t.name}</div>
                        <div className="text-[11px] text-slate-400">{t.contact_email}</div>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            t.plan_id === 'enterprise'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : t.plan_id === 'pro'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : t.plan_id === 'trial'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {t.plan_name}
                        </span>
                      </td>

                      {/* Subscription Expiry & Days Left */}
                      <td className="py-4 px-4">
                        {t.days_left !== undefined ? (
                          <div>
                            {t.is_expired ? (
                              <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-2 py-0.5 rounded-full text-[11px] font-bold border border-red-200">
                                <Clock className="h-3 w-3" /> Hết hạn (0 ngày)
                              </span>
                            ) : (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                  t.days_left <= 3
                                    ? 'text-amber-700 bg-amber-50 border-amber-200'
                                    : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                }`}
                              >
                                <Clock className="h-3 w-3" /> Còn {t.days_left} ngày
                              </span>
                            )}
                            {t.subscription_expires_at && (
                              <div className="text-[10px] text-slate-400 mt-1">
                                Hạn: {new Date(t.subscription_expires_at).toLocaleDateString('vi-VN')}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                      </td>

                      {/* Payment Status */}
                      <td className="py-4 px-4">
                        {t.payment_status === 'paid' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" /> Đã thanh toán
                          </span>
                        ) : t.payment_status === 'trial' ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-amber-200">
                            <Sparkles className="h-3 w-3" /> Dùng thử
                          </span>
                        ) : t.payment_status === 'expired' ? (
                          <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-red-200">
                            Quá hạn
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-yellow-200">
                            Chờ thanh toán
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-4">
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

                      <td className="py-4 px-4">
                        <div className="space-y-1.5 min-w-[120px]">
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

                      <td className="py-4 px-4">
                        <div className="space-y-1 min-w-[120px]">
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

                      <td className="py-4 px-4 text-slate-400">
                        {new Date(t.created_at).toLocaleDateString('vi-VN')}
                      </td>

                      <td className="py-4 px-5 text-right">
                        <button
                          onClick={() => {
                            setEditingTenant(t);
                            setEditPlanId(t.plan_id);
                            setEditStatus(t.status);
                            setEditPaymentStatus((t.payment_status as any) || 'paid');
                            setEditExtendDays(0);
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
        </div>
      )}

      {/* ================= TAB 2: CẤU HÌNH WEBSITE & HỖ TRỢ LIÊN HỆ ================= */}
      {activeTab === 'website' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 rounded-3xl bg-white p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Globe className="h-5 w-5 text-blue-600" />
                Quản lý Thông tin Website & Hỗ trợ - Liên hệ
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Các thông tin cấu hình dưới đây sẽ tự động hiển thị trên Trang chủ (Landing Page), chân trang và khung tư vấn.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên Công ty / Đơn vị chủ quản *
                </label>
                <input
                  type="text"
                  value={contactForm.company_name}
                  onChange={(e) => setContactForm({ ...contactForm, company_name: e.target.value })}
                  placeholder="CÔNG TY TNHH KỸ NĂNG MỀM"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên Thương hiệu hệ thống
                </label>
                <input
                  type="text"
                  value={contactForm.brand_name}
                  onChange={(e) => setContactForm({ ...contactForm, brand_name: e.target.value })}
                  placeholder="Zalo BaaS"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Hotline Hỗ trợ khách hàng *
                </label>
                <input
                  type="text"
                  value={contactForm.hotline}
                  onChange={(e) => setContactForm({ ...contactForm, hotline: e.target.value })}
                  placeholder="0986.000.797"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold text-blue-700 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Hỗ trợ & Tiếp nhận thông tin *
                </label>
                <input
                  type="email"
                  value={contactForm.contact_email}
                  onChange={(e) => setContactForm({ ...contactForm, contact_email: e.target.value })}
                  placeholder="congtykynangmem@gmail.com"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Giờ làm việc & Hỗ trợ
                </label>
                <input
                  type="text"
                  value={contactForm.working_hours}
                  onChange={(e) => setContactForm({ ...contactForm, working_hours: e.target.value })}
                  placeholder="08:00 – 21:00 hàng ngày (Hỗ trợ 24/7)"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Địa chỉ trụ sở công ty
                </label>
                <input
                  type="text"
                  value={contactForm.address}
                  onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })}
                  placeholder="Số 41 Trần Phú, Phường Phước Hậu, TP. Vĩnh Long, Tỉnh Vĩnh Long"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Đường dẫn Website
                </label>
                <input
                  type="text"
                  value={contactForm.website_url}
                  onChange={(e) => setContactForm({ ...contactForm, website_url: e.target.value })}
                  placeholder="https://bot.knm.asia"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Đường dẫn Zalo OA / Zalo Tư vấn
                </label>
                <input
                  type="text"
                  value={contactForm.zalo_oa_url || ''}
                  onChange={(e) => setContactForm({ ...contactForm, zalo_oa_url: e.target.value })}
                  placeholder="https://zalo.me/0986000797"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                disabled={savingSettings}
                onClick={() => handleSaveSettings('website')}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/25 hover:bg-blue-700 disabled:opacity-50 transition"
              >
                <Save className="h-4 w-4" />
                <span>{savingSettings ? 'Đang lưu...' : 'Lưu cấu hình Website'}</span>
              </button>
            </div>
          </div>

          {/* Live Preview Card */}
          <div className="lg:col-span-4 space-y-4">
            <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-xl border border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/20 px-2.5 py-1 rounded-full border border-blue-500/30">
                Xem trước Chân trang Website
              </span>
              <div className="mt-4 space-y-3 text-xs text-slate-300">
                <div className="font-extrabold text-white text-base flex items-center gap-2">
                  <Bot className="h-5 w-5 text-blue-400" />
                  <span>{contactForm.brand_name}</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Đơn vị chủ quản: <strong className="text-white">{contactForm.company_name}</strong>
                </div>
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold">
                    <PhoneCall className="h-4 w-4" />
                    <span>Hotline: {contactForm.hotline}</span>
                  </div>
                  <div>✉️ Email: {contactForm.contact_email}</div>
                  <div>📍 Địa chỉ: {contactForm.address}</div>
                  <div>⏰ Giờ hỗ trợ: {contactForm.working_hours}</div>
                  <div>🌐 Website: {contactForm.website_url}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 3: TÀI KHOẢN NGÂN HÀNG (VIETQR) ================= */}
      {activeTab === 'bank' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 rounded-3xl bg-white p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-blue-600" />
                Quản lý Thông tin Tài khoản Ngân hàng nhận tiền
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Hệ thống tự động sử dụng tài khoản này để tạo mã chuyển khoản Napas VietQR khi khách hàng nâng cấp gói cước.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ngân hàng thụ hưởng *
                </label>
                <select
                  value={bankForm.bank_id}
                  onChange={(e) => {
                    const sel = POPULAR_BANKS.find((b) => b.id === e.target.value);
                    setBankForm({
                      ...bankForm,
                      bank_id: e.target.value,
                      bank_name: sel?.name || e.target.value,
                    });
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:border-blue-600 focus:outline-none"
                >
                  {POPULAR_BANKS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Số tài khoản nhận tiền *
                </label>
                <input
                  type="text"
                  value={bankForm.account_no}
                  onChange={(e) => setBankForm({ ...bankForm, account_no: e.target.value.trim() })}
                  placeholder="0986000797"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên chủ tài khoản (In hoa không dấu) *
                </label>
                <input
                  type="text"
                  value={bankForm.account_name}
                  onChange={(e) => setBankForm({ ...bankForm, account_name: e.target.value.toUpperCase() })}
                  placeholder="CONG TY KY NANG MEM"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold uppercase focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                disabled={savingSettings}
                onClick={() => handleSaveSettings('bank')}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/25 hover:bg-blue-700 disabled:opacity-50 transition"
              >
                <Save className="h-4 w-4" />
                <span>{savingSettings ? 'Đang lưu...' : 'Lưu tài khoản Ngân hàng'}</span>
              </button>
            </div>
          </div>

          {/* Live VietQR Preview */}
          <div className="lg:col-span-5 rounded-3xl bg-white p-6 border border-slate-200 shadow-sm space-y-4 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 inline-flex items-center gap-1">
              <QrCode className="h-3.5 w-3.5 text-emerald-600" />
              Mô phỏng VietQR Thanh toán
            </span>

            <div className="mx-auto max-w-[240px] rounded-2xl border-2 border-dashed border-slate-200 p-2 bg-slate-50">
              <img
                src={`https://img.vietqr.io/image/${bankForm.bank_id}-${bankForm.account_no}-compact2.png?amount=99000&addInfo=ZALOBAAS%20DEMO&accountName=${encodeURIComponent(
                  bankForm.account_name
                )}`}
                alt="VietQR Demo"
                className="w-full rounded-xl"
              />
            </div>

            <div className="text-xs space-y-1 text-slate-600">
              <div>Ngân hàng: <strong className="text-slate-900">{bankForm.bank_name || bankForm.bank_id}</strong></div>
              <div>Số tài khoản: <strong className="font-mono text-blue-600">{bankForm.account_no}</strong></div>
              <div>Chủ tài khoản: <strong className="text-slate-900">{bankForm.account_name}</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 4: CẤU HÌNH EMAIL & LỊCH SỬ GỬI ================= */}
      {activeTab === 'email' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Email Config Form */}
            <div className="lg:col-span-7 rounded-3xl bg-white p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Mail className="h-5 w-5 text-blue-600" />
                  Cấu hình Email phản hồi kết quả thanh toán
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Hệ thống tự động gửi email thông báo kết quả thanh toán, thông tin gói cước và thời hạn sử dụng tới khách hàng.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Địa chỉ email gửi (From) *
                  </label>
                  <input
                    type="email"
                    value={emailForm.sender_email}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      setEmailForm({ ...emailForm, sender_email: val, smtp_user: val });
                    }}
                    placeholder="congtykynangmem@gmail.com"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-blue-700 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tên hiển thị người gửi
                  </label>
                  <input
                    type="text"
                    value={emailForm.sender_name}
                    onChange={(e) => setEmailForm({ ...emailForm, sender_name: e.target.value })}
                    placeholder="Zalo BaaS - Kỹ Năng Mềm"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Máy chủ SMTP (Gmail: smtp.gmail.com)
                  </label>
                  <input
                    type="text"
                    value={emailForm.smtp_host}
                    onChange={(e) => setEmailForm({ ...emailForm, smtp_host: e.target.value })}
                    placeholder="smtp.gmail.com"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cổng SMTP (SSL: 465 / STARTTLS: 587)
                  </label>
                  <select
                    value={emailForm.smtp_port}
                    onChange={(e) => setEmailForm({ ...emailForm, smtp_port: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-blue-600 focus:outline-none bg-white"
                  >
                    <option value={465}>465 (SSL / TLS trực tiếp - Khuyên dùng)</option>
                    <option value={587}>587 (STARTTLS)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mật khẩu ứng dụng Gmail (Gmail App Password - 16 ký tự)
                  </label>
                  <input
                    type="password"
                    value={emailForm.smtp_pass}
                    onChange={(e) => setEmailForm({ ...emailForm, smtp_pass: e.target.value.replace(/\s+/g, '').trim() })}
                    placeholder="xxxxxxxxxxxxxxxx (Tự động xóa khoảng trắng khi dán 16 ký tự App Password)"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-mono focus:border-blue-600 focus:outline-none"
                  />
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    💡 Hướng dẫn: Đăng nhập Gmail <strong>{emailForm.sender_email}</strong> → Quản lý tài khoản Google → Bảo mật → Xác minh 2 bước → Mật khẩu ứng dụng (tạo mật khẩu 16 ký tự và dán vào ô trên, sau đó bấm <strong>Lưu cấu hình Email</strong> trước khi gửi thử).
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  disabled={savingSettings}
                  onClick={() => handleSaveSettings('email')}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/25 hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  <Save className="h-4 w-4" />
                  <span>{savingSettings ? 'Đang lưu...' : 'Lưu cấu hình Email'}</span>
                </button>
              </div>
            </div>

            {/* Test Email Card */}
            <div className="lg:col-span-5 rounded-3xl bg-white p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Send className="h-4 w-4 text-emerald-600" />
                Gửi Thử Nghiệm Email Xác Nhận Thanh Toán
              </h3>
              <p className="text-xs text-slate-500">
                Thử nghiệm gửi email xác nhận thanh toán mẫu từ <strong>{emailForm.sender_email}</strong> tới email của bạn.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email nhận thử nghiệm
                </label>
                <input
                  type="email"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  placeholder="nhapemailcuaban@gmail.com"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-blue-600 focus:outline-none"
                />
              </div>

              {testMessage && (
                <div
                  className={`rounded-xl p-3 text-xs font-medium border ${
                    testMessage.success
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-red-50 text-red-800 border-red-200'
                  }`}
                >
                  {testMessage.text}
                </div>
              )}

              <button
                type="button"
                disabled={sendingTest}
                onClick={handleSendTestEmail}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition shadow-sm"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{sendingTest ? 'Đang gửi...' : 'Gửi email xác nhận thử nghiệm'}</span>
              </button>
            </div>
          </div>

          {/* Email Logs Table */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                Lịch sử Email thông báo đã gửi
              </h3>
              <span className="text-xs text-slate-400">
                Tổng cộng: {emailLogs.length} email
              </span>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-5">Thời gian</th>
                    <th className="py-3 px-4">Gửi từ</th>
                    <th className="py-3 px-4">Người nhận</th>
                    <th className="py-3 px-4">Tiêu đề email</th>
                    <th className="py-3 px-4">Trạng thái</th>
                    <th className="py-3 px-5 text-right">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {emailLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        Chưa có lịch sử email nào được gửi.
                      </td>
                    </tr>
                  ) : (
                    emailLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3.5 px-5 text-slate-400">
                          {new Date(log.created_at).toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                          {log.from_email}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          {log.to_email}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-800 max-w-[280px] truncate">
                          {log.subject}
                        </td>
                        <td className="py-3.5 px-4">
                          {log.status === 'sent' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3" /> Đã gửi (SMTP)
                            </span>
                          ) : log.status === 'simulated' ? (
                            <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full text-[10px] font-bold border border-blue-200">
                              <Eye className="h-3 w-3" /> Đã ghi nhận
                            </span>
                          ) : (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-2 py-0.5 rounded-full text-[10px] font-bold border border-red-200">
                                Lỗi gửi
                              </span>
                              {log.error && (
                                <p className="text-[10px] text-red-600 max-w-[240px] break-words" title={log.error}>
                                  {log.error}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <button
                            onClick={() => setViewingEmail(log)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                          >
                            Xem nội dung
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

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
                  onChange={(e) => {
                    const pid = e.target.value;
                    setNewPlanId(pid);
                    if (pid === 'trial') {
                      setNewSubscriptionDays(7);
                      setNewPaymentStatus('trial');
                    } else {
                      setNewSubscriptionDays(30);
                      setNewPaymentStatus('paid');
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                >
                  <option value="trial">Dùng thử (7 ngày - Miễn phí 0 đ - 1 Bot)</option>
                  <option value="starter">Starter (99.000 đ/tháng - 1 Bot)</option>
                  <option value="pro">Pro (299.000 đ/tháng - 3 Bots)</option>
                  <option value="enterprise">Enterprise (499.000 đ/tháng - 5 Bots)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Thời hạn khởi tạo
                  </label>
                  <select
                    value={newSubscriptionDays}
                    onChange={(e) => setNewSubscriptionDays(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                  >
                    <option value={7}>7 ngày (Dùng thử)</option>
                    <option value={30}>30 ngày (1 tháng)</option>
                    <option value={90}>90 ngày (3 tháng)</option>
                    <option value={180}>180 ngày (6 tháng)</option>
                    <option value={365}>365 ngày (1 năm)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Trạng thái thanh toán
                  </label>
                  <select
                    value={newPaymentStatus}
                    onChange={(e) => setNewPaymentStatus(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                  >
                    <option value="paid">Đã thanh toán (Paid)</option>
                    <option value="pending">Chờ thanh toán (Pending)</option>
                    <option value="trial">Dùng thử (Trial)</option>
                  </select>
                </div>
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
                  <option value="trial">Dùng thử (7 ngày - 1 Bot, 3 Docs, 1.000 msgs)</option>
                  <option value="starter">Starter (99.000 đ/tháng - 1 Bot, 10 Docs, 3.000 msgs)</option>
                  <option value="pro">Pro (299.000 đ/tháng - 3 Bots, 30 Docs, 15.000 msgs)</option>
                  <option value="enterprise">Enterprise (499.000 đ/tháng - 5 Bots, 100 Docs, 50.000 msgs)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
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

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Trạng thái thanh toán
                  </label>
                  <select
                    value={editPaymentStatus}
                    onChange={(e) => setEditPaymentStatus(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
                  >
                    <option value="paid">Đã thanh toán (Paid)</option>
                    <option value="pending">Chờ thanh toán (Pending)</option>
                    <option value="trial">Dùng thử (Trial)</option>
                    <option value="expired">Hết hạn (Expired)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Gia hạn thời hạn sử dụng gói
                </label>
                <div className="text-[11px] text-slate-500 mb-2">
                  Hạn hiện tại:{' '}
                  <strong className="text-slate-800">
                    {editingTenant.subscription_expires_at
                      ? new Date(editingTenant.subscription_expires_at).toLocaleDateString('vi-VN')
                      : 'Chưa thiết lập'}
                  </strong>{' '}
                  {editingTenant.days_left !== undefined && (
                    <span className={editingTenant.is_expired ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}>
                      ({editingTenant.is_expired ? 'Đã hết hạn' : `Còn ${editingTenant.days_left} ngày`})
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[7, 30, 90, 180, 365].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setEditExtendDays(editExtendDays === d ? 0 : d)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                        editExtendDays === d
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      +{d} ngày
                    </button>
                  ))}
                </div>
                {editExtendDays > 0 && (
                  <div className="rounded-lg bg-emerald-50 p-2 text-[11px] text-emerald-700 border border-emerald-200 font-medium">
                    ✓ Sẽ cộng thêm {editExtendDays} ngày vào thời hạn của doanh nghiệp này khi nhấn &quot;Lưu thay đổi&quot;.
                  </div>
                )}
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

      {/* --- VIEW EMAIL CONTENT MODAL --- */}
      {viewingEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Chi tiết Email Thông Báo</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Mã thư: {viewingEmail.id}</p>
              </div>
              <button
                onClick={() => setViewingEmail(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 mb-4 text-xs bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-400">Từ:</span>
                <span className="font-bold text-slate-800">{viewingEmail.from_email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tới:</span>
                <span className="font-bold text-blue-700">{viewingEmail.to_email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tiêu đề:</span>
                <span className="font-semibold text-slate-900">{viewingEmail.subject}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Thời gian:</span>
                <span>{new Date(viewingEmail.created_at).toLocaleString('vi-VN')}</span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[380px] overflow-y-auto p-4 bg-slate-50/50">
              {viewingEmail.content_html ? (
                <div dangerouslySetInnerHTML={{ __html: viewingEmail.content_html }} />
              ) : (
                <p className="text-xs text-slate-400">Không có bản lưu nội dung HTML.</p>
              )}
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingEmail(null)}
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

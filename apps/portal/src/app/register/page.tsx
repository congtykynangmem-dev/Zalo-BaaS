'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, UserProfile } from '@/lib/auth-context';
import { fetchApi } from '@/lib/api';
import {
  Bot,
  Lock,
  Mail,
  Building,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Zap,
  ShieldCheck,
  Crown,
  ChevronLeft,
} from 'lucide-react';

interface PlanOption {
  id: string;
  name: string;
  price: string;
  period: string;
  badge?: string;
  badgeColor?: string;
  features: string[];
  recommended?: boolean;
}

const PLAN_OPTIONS: PlanOption[] = [
  {
    id: 'trial',
    name: 'Dùng thử 7 ngày',
    price: '0 đ',
    period: '/ 7 ngày',
    badge: 'Trải nghiệm miễn phí',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    features: ['Tối đa 1 Zalo Bot kết nối', 'Tối đa 3 tài liệu RAG', '1.000 tin nhắn AI', 'Live chat & Chuyển giao CSKH'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '99.000 đ',
    period: '/ tháng',
    badge: 'Tiết kiệm',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    features: ['Tối đa 1 Zalo Bot kết nối', 'Tối đa 10 tài liệu RAG', '3.000 tin nhắn AI / tháng', 'Live chat & CSKH'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '299.000 đ',
    period: '/ tháng',
    badge: 'Được ưa chuộng nhất',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    recommended: true,
    features: ['Tối đa 3 Zalo Bot kết nối', 'Tối đa 30 tài liệu RAG', '15.000 tin nhắn AI / tháng', 'CRM Khách hàng & Xuất Excel'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '499.000 đ',
    period: '/ tháng',
    badge: 'Doanh nghiệp lớn',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    features: ['Tối đa 5 Zalo Bot kết nối', 'Tối đa 100 tài liệu RAG', '50.000 tin nhắn AI / tháng', 'Hỗ trợ kỹ thuật 24/7 & Custom prompt'],
  },
];

function RegisterForm() {
  const searchParams = useSearchParams();
  const initialPlan = searchParams.get('plan') || 'trial';

  const [selectedPlanId, setSelectedPlanId] = useState(
    PLAN_OPTIONS.some((p) => p.id === initialPlan.toLowerCase()) ? initialPlan.toLowerCase() : 'trial'
  );
  const [tenantName, setTenantName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const planParam = searchParams.get('plan');
    if (planParam && PLAN_OPTIONS.some((p) => p.id === planParam.toLowerCase())) {
      setSelectedPlanId(planParam.toLowerCase());
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetchApi<{ token: string; user: UserProfile; message?: string }>('/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          tenant_name: tenantName.trim(),
          email: email.trim(),
          password,
          plan_id: selectedPlanId,
        }),
      });

      login(res.token, res.user);

      // If user selected a paid plan, direct them to billing to view payment QR
      if (selectedPlanId !== 'trial') {
        router.push('/dashboard/billing');
      } else {
        router.push('/dashboard/bots');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Đăng ký không thành công');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl rounded-3xl bg-white p-6 sm:p-10 shadow-2xl border border-slate-100 my-8">
      {/* Back to Home */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 transition"
        >
          <ChevronLeft className="h-4 w-4" /> Về trang chủ
        </Link>
        <div className="text-xs text-slate-400">
          Đã có tài khoản?{' '}
          <Link href="/login" className="font-semibold text-blue-600 hover:underline">
            Đăng nhập
          </Link>
        </div>
      </div>

      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20">
          <Bot className="h-8 w-8" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          Đăng ký Zalo BaaS Portal
        </h1>
        <p className="mt-2 text-sm text-slate-500 max-w-lg mx-auto">
          Chọn gói dịch vụ phù hợp và tạo tài khoản doanh nghiệp để bắt đầu vận hành Zalo Bot AI thông minh ngay hôm nay.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl bg-red-50 p-4 text-sm text-red-600 border border-red-100 flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Step 1: Choose Plan */}
        <div>
          <label className="block text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
              1
            </span>
            Chọn gói dịch vụ của bạn:
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {PLAN_OPTIONS.map((plan) => {
              const isSelected = selectedPlanId === plan.id;
              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`relative cursor-pointer rounded-2xl p-4 transition-all duration-200 border-2 ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/50 shadow-md ring-2 ring-blue-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50'
                  }`}
                >
                  {plan.badge && (
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mb-2 border ${plan.badgeColor}`}
                    >
                      {plan.badge}
                    </span>
                  )}
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 text-sm">{plan.name}</h3>
                    <div
                      className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                      }`}
                    >
                      {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </div>
                  </div>

                  <div className="mt-2">
                    <span className="text-lg font-extrabold text-slate-900">{plan.price}</span>
                    <span className="text-[11px] text-slate-500 ml-1">{plan.period}</span>
                  </div>

                  <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-600">
                    {plan.features.slice(0, 3).map((feat, idx) => (
                      <li key={idx} className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 2: Tenant Info */}
        <div className="space-y-4">
          <label className="block text-sm font-bold text-slate-900 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
              2
            </span>
            Thông tin Doanh nghiệp & Quản trị:
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên Doanh nghiệp / Cửa hàng / Thương hiệu *
              </label>
              <div className="relative">
                <Building className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  placeholder="Ví dụ: Gà Rán Five Star Kim Kỳ, Shop Thời Trang..."
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Quản trị tài khoản *
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@doanhnghiep.com"
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mật khẩu (Tối thiểu 6 ký tự) *
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Selected Plan Summary & Submit */}
        <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-600">
            <div>
              Gói đã chọn: <strong className="text-slate-900">{PLAN_OPTIONS.find((p) => p.id === selectedPlanId)?.name}</strong>
              {' '}- <strong className="text-blue-600">{PLAN_OPTIONS.find((p) => p.id === selectedPlanId)?.price}</strong>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {selectedPlanId === 'trial'
                ? 'Kích hoạt ngay 7 ngày miễn phí không cần thanh toán.'
                : 'Bạn có thể kích hoạt và quét mã Napas VietQR tự động ngay sau khi đăng ký.'}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/25 hover:bg-blue-700 focus:outline-none disabled:opacity-50 transition"
          >
            {loading ? 'Đang tạo tài khoản...' : selectedPlanId === 'trial' ? 'Kích hoạt Dùng thử (0 đ)' : 'Đăng ký & Tiếp tục'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-b from-slate-50 via-blue-50/20 to-slate-100">
      <Suspense
        fallback={
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          </div>
        }
      >
        <RegisterForm />
      </Suspense>
    </div>
  );
}

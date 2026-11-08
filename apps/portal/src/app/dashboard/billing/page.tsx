'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  CreditCard,
  CheckCircle2,
  Zap,
  ShieldCheck,
  Sparkles,
  Bot,
  BookOpen,
  MessageSquare,
  Clock,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  price_vnd: number;
  max_bots: number;
  monthly_ai_messages: number;
  max_documents: number;
  max_doc_mb: number;
  features: Record<string, boolean>;
}

interface Subscription {
  plan_id: string;
  plan_name: string;
  status: string;
  bots: { current: number; max: number };
  documents: { current: number; max: number };
  ai_messages: { current: number; max: number };
}

interface PaymentInvoice {
  invoice_id: string;
  amount_vnd: number;
  transfer_content: string;
  bank: {
    bank_id: string;
    account_no: string;
    account_name: string;
  };
  vietqr_url: string;
}

const DEFAULT_PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price_vnd: 199000,
    max_bots: 1,
    monthly_ai_messages: 1000,
    max_documents: 5,
    max_doc_mb: 10,
    features: { rag: true, markdown: true, handover: true },
  },
  {
    id: 'pro',
    name: 'Pro',
    price_vnd: 599000,
    max_bots: 3,
    monthly_ai_messages: 10000,
    max_documents: 20,
    max_doc_mb: 50,
    features: { rag: true, markdown: true, handover: true, crm: true },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price_vnd: 1990000,
    max_bots: 10,
    monthly_ai_messages: 50000,
    max_documents: 100,
    max_doc_mb: 200,
    features: { rag: true, markdown: true, handover: true, crm: true, priority_support: true },
  },
];

export default function BillingPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>(DEFAULT_PLANS);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  // Payment Modal
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [billingCycle, setBillingCycle] = useState<number>(1); // 1, 6, 12 months
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [invoice, setInvoice] = useState<PaymentInvoice | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  const loadBillingData = async () => {
    setLoading(true);
    // 1. Fetch plans
    try {
      const plansRes = await fetchApi<{ ok: boolean; plans: Plan[] }>('/v1/billing/plans');
      if (plansRes?.plans && plansRes.plans.length > 0) {
        setPlans(plansRes.plans);
      }
    } catch (e) {
      console.warn('Failed to load plans from API, using default:', e);
    }

    // 2. Fetch subscription & quota usage
    try {
      const subRes = await fetchApi<{ ok: boolean; subscription: any }>('/v1/billing/subscription');
      if (subRes?.subscription) {
        const s = subRes.subscription;
        setSub({
          plan_id: (s.plan_id || 'starter').toLowerCase(),
          plan_name: s.plan_name || 'Starter',
          status: s.status || 'active',
          bots: s.bots || s.usage?.bots || { current: 0, max: 1 },
          documents: s.documents || s.usage?.documents || { current: 0, max: 5 },
          ai_messages: s.ai_messages || s.usage?.ai_messages || { current: 0, max: 1000 },
        });
      }
    } catch (e) {
      console.warn('Failed to load subscription:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBillingData();
  }, []);

  const handleStartPayment = async (plan: Plan) => {
    setSelectedPlan(plan);
    setCreatingPayment(true);
    setPaymentError('');
    setPaymentSuccess(false);

    try {
      const res = await fetchApi<{ ok: boolean; invoice: PaymentInvoice }>(
        '/v1/billing/create-payment',
        {
          method: 'POST',
          body: JSON.stringify({
            plan_id: plan.id,
            cycle_months: billingCycle,
          }),
        }
      );
      setInvoice(res.invoice);
    } catch (err: unknown) {
      setPaymentError(err instanceof Error ? err.message : 'Không thể tạo đơn thanh toán');
    } finally {
      setCreatingPayment(false);
    }
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleConfirmPayment = async () => {
    if (!invoice) return;
    setConfirming(true);
    setPaymentError('');

    try {
      await fetchApi('/v1/billing/confirm-payment', {
        method: 'POST',
        body: JSON.stringify({ invoice_id: invoice.invoice_id }),
      });

      setPaymentSuccess(true);
      await loadBillingData();
      setTimeout(() => {
        setInvoice(null);
        setSelectedPlan(null);
        setPaymentSuccess(false);
      }, 3000);
    } catch (err: unknown) {
      setPaymentError(err instanceof Error ? err.message : 'Lỗi xác nhận thanh toán');
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  const effectiveSub: Subscription = sub || {
    plan_id: (user?.tenant?.plan_id || 'starter').toLowerCase(),
    plan_name: user?.tenant?.plan_id ? user.tenant.plan_id.toUpperCase() : 'Starter',
    status: 'active',
    bots: { current: 0, max: 1 },
    documents: { current: 0, max: 5 },
    ai_messages: { current: 0, max: 1000 },
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-blue-600" />
          Gói cước & Hạn mức Sử dụng
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Quản lý gói dịch vụ Zalo BaaS, theo dõi hạn mức tài nguyên và nâng cấp tự động qua Napas VietQR
        </p>
      </div>

      {/* Subscription Quota Usage Card */}
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/50 via-white to-indigo-50/30 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-blue-100 pb-5">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
              Gói hiện tại
            </span>
            <div className="flex items-center gap-3 mt-1">
              <h2 className="text-xl font-bold text-slate-900">{effectiveSub.plan_name}</h2>
              <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-bold text-emerald-800">
                {effectiveSub.status === 'active' ? 'Đang hoạt động' : effectiveSub.status}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <Clock className="h-4 w-4 text-blue-500" />
            <span>Chu kỳ gia hạn tự động hàng tháng</span>
          </div>
        </div>

        {/* Quota Progress Bars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6">
          {/* Bots Quota */}
          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Bot className="h-4 w-4 text-blue-600" /> Số lượng Bot
              </span>
              <span>
                {effectiveSub.bots.current} / {effectiveSub.bots.max} bot
              </span>
            </div>
            <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.round((effectiveSub.bots.current / (effectiveSub.bots.max || 1)) * 100))}%`,
                }}
              />
            </div>
          </div>

          {/* Docs Quota */}
          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1.5">
              <span className="flex items-center gap-1.5">
                <BookOpen className="h-4 w-4 text-indigo-600" /> Tài liệu RAG
              </span>
              <span>
                {effectiveSub.documents.current} / {effectiveSub.documents.max} tài liệu
              </span>
            </div>
            <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((effectiveSub.documents.current / (effectiveSub.documents.max || 1)) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* AI Messages Quota */}
          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1.5">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4 text-emerald-600" /> Tin nhắn AI tháng này
              </span>
              <span>
                {effectiveSub.ai_messages.current.toLocaleString()} / {effectiveSub.ai_messages.max.toLocaleString()}
              </span>
            </div>
            <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((effectiveSub.ai_messages.current / (effectiveSub.ai_messages.max || 1)) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Tier Plans */}
      <div>
        <div className="text-center max-w-xl mx-auto mb-8">
          <h2 className="text-xl font-bold text-slate-900">Bảng giá Thương mại hóa Dịch vụ</h2>
          <p className="mt-1 text-xs text-slate-500">
            Nâng cấp gói bất kỳ lúc nào để mở rộng giới hạn Bot, kho tri thức và hạn mức phản hồi AI
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = effectiveSub.plan_id.toLowerCase() === plan.id.toLowerCase();
            const isPro = plan.id === 'pro';

            return (
              <div
                key={plan.id}
                className={`relative rounded-3xl p-6 transition-all duration-200 ${
                  isPro
                    ? 'border-2 border-blue-600 bg-white shadow-xl shadow-blue-500/10'
                    : 'border border-slate-200 bg-white shadow-sm hover:border-slate-300'
                }`}
              >
                {isPro && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3.5 py-1 text-[11px] font-bold text-white shadow-sm flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Được ưa chuộng nhất
                  </div>
                )}

                <div className="mb-4">
                  <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-slate-900">
                      {plan.price_vnd.toLocaleString('vi-VN')}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">đ / tháng</span>
                  </div>
                </div>

                <ul className="space-y-3 border-t border-slate-100 py-5 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>
                      Tối đa <strong>{plan.max_bots}</strong> Zalo Bot kết nối
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>
                      Tối đa <strong>{plan.max_documents}</strong> tài liệu RAG
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>
                      <strong>{plan.monthly_ai_messages.toLocaleString()}</strong> tin nhắn AI / tháng
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Hộp thư Chat Live & Chuyển giao CSKH</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Quản lý Khách hàng CRM & Xuất Excel</span>
                  </li>
                  {plan.id === 'enterprise' && (
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>Hỗ trợ kỹ thuật 24/7 & Tùy biến tính năng</span>
                    </li>
                  )}
                </ul>

                <button
                  onClick={() => handleStartPayment(plan)}
                  disabled={isCurrent}
                  className={`w-full rounded-2xl py-3 text-xs font-bold transition flex items-center justify-center gap-2 ${
                    isCurrent
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : isPro
                      ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/20'
                      : 'border border-blue-600 text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  {isCurrent ? (
                    'Gói đang sử dụng'
                  ) : (
                    <>
                      <Zap className="h-4 w-4" /> Nâng cấp ngay
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- VIETQR NAPAS PAYMENT MODAL --- */}
      {invoice && selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-blue-600" />
                  Thanh toán Napas VietQR 24/7
                </h3>
                <p className="text-xs text-slate-500">
                  Nâng cấp lên gói <strong>{selectedPlan.name}</strong>
                </p>
              </div>
              <button
                onClick={() => setInvoice(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {paymentError && (
              <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs text-red-600 border border-red-100">
                {paymentError}
              </div>
            )}

            {paymentSuccess ? (
              <div className="py-8 text-center space-y-3">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h4 className="text-lg font-bold text-slate-900">
                  Nâng cấp gói cước thành công!
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Tài khoản của bạn đã được nâng cấp lên gói {selectedPlan.name}. Hạn mức mới đã sẵn sàng sử dụng.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* QR Code Container */}
                <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <img
                    src={invoice.vietqr_url}
                    alt="Mã QR Napas VietQR"
                    className="w-56 h-auto rounded-xl shadow-sm border border-slate-200"
                  />
                  <span className="mt-2 text-[11px] font-semibold text-slate-600">
                    Quét bằng ứng dụng Ngân hàng bất kỳ
                  </span>
                </div>

                {/* Bank Transfer Details with 1-Click Copy */}
                <div className="space-y-2 text-xs bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Ngân hàng:</span>
                    <span className="font-bold text-slate-800">MBBank (Quân Đội)</span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Chủ tài khoản:</span>
                    <span className="font-bold text-slate-800">{invoice.bank.account_name}</span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Số tài khoản:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-blue-600">
                        {invoice.bank.account_no}
                      </span>
                      <button
                        onClick={() => handleCopy(invoice.bank.account_no, 'account_no')}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        {copiedField === 'account_no' ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Số tiền:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-emerald-600 text-sm">
                        {invoice.amount_vnd.toLocaleString('vi-VN')} đ
                      </span>
                      <button
                        onClick={() => handleCopy(String(invoice.amount_vnd), 'amount')}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        {copiedField === 'amount' ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <span className="text-slate-500">Nội dung CK:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        {invoice.transfer_content}
                      </span>
                      <button
                        onClick={() => handleCopy(invoice.transfer_content, 'content')}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        {copiedField === 'content' ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Confirm Button */}
                <div className="pt-2">
                  <button
                    onClick={handleConfirmPayment}
                    disabled={confirming}
                    className="w-full rounded-2xl bg-blue-600 py-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-md shadow-blue-500/20"
                  >
                    {confirming ? (
                      <>
                        <Clock className="h-4 w-4 animate-spin" /> Đang kiểm tra giao dịch...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" /> Tôi đã chuyển khoản thành công
                      </>
                    )}
                  </button>
                  <p className="mt-2 text-center text-[10px] text-slate-400">
                    💡 Sau khi chuyển khoản đúng số tiền và nội dung, gói cước sẽ tự động kích hoạt tức thì.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


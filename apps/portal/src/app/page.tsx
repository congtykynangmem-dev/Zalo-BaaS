'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { fetchApi } from '@/lib/api';
import {
  Bot,
  Sparkles,
  Zap,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  MessageSquare,
  BookOpen,
  Users,
  BarChart3,
  ExternalLink,
  PhoneCall,
  Clock,
  Layers,
  Check,
  ChevronRight,
  TrendingUp,
  Cpu,
  Send,
  Star,
} from 'lucide-react';

interface PricingPlan {
  id: string;
  name: string;
  badge?: string;
  badgeColor?: string;
  price: string;
  period: string;
  description: string;
  popular?: boolean;
  features: string[];
  ctaText: string;
  ctaVariant: 'primary' | 'secondary' | 'outline';
}

const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'trial',
    name: 'Dùng thử 7 ngày',
    badge: 'Trải nghiệm 7 ngày',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    price: '0 đ',
    period: '/ 7 ngày',
    description: 'Dành cho khách hàng mới kiểm tra hiệu quả trước khi chuyển gói chính thức.',
    features: [
      'Tối đa 1 Zalo Bot kết nối',
      'Tối đa 3 tài liệu Kho tri thức RAG',
      '1.000 tin nhắn AI trả lời tự động',
      'Hộp thư Chat Live & Chuyển giao CSKH',
      'Tra cứu giá & sản phẩm thông minh',
      'Hỗ trợ kỹ thuật ban đầu',
    ],
    ctaText: 'Kích hoạt Dùng thử (0 đ)',
    ctaVariant: 'outline',
  },
  {
    id: 'starter',
    name: 'Starter',
    badge: 'Cửa hàng nhỏ',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    price: '99.000 đ',
    period: '/ tháng',
    description: 'Phù hợp quán ăn, tiệm tạp hóa, cửa hàng bán lẻ bắt đầu tự động hóa chăm sóc khách hàng.',
    features: [
      'Tối đa 1 Zalo Bot kết nối',
      'Tối đa 10 tài liệu Kho tri thức RAG',
      '3.000 tin nhắn AI / tháng',
      'Hộp thư Chat Live & Chuyển giao CSKH',
      'Tra cứu giá, menu & giờ mở cửa 24/7',
      'Gia hạn tự động qua Napas VietQR',
    ],
    ctaText: 'Đăng ký gói Starter',
    ctaVariant: 'outline',
  },
  {
    id: 'pro',
    name: 'Pro',
    badge: 'Được ưa chuộng nhất',
    badgeColor: 'bg-blue-600 text-white border-blue-600',
    price: '299.000 đ',
    period: '/ tháng',
    description: 'Lựa chọn tối ưu cho doanh nghiệp vừa và nhỏ có lượng tin nhắn lớn và nhiều chi nhánh.',
    popular: true,
    features: [
      'Tối đa 3 Zalo Bot kết nối',
      'Tối đa 30 tài liệu Kho tri thức RAG',
      '15.000 tin nhắn AI / tháng',
      'Hộp thư Chat Live & Chuyển giao CSKH',
      'Quản lý Khách hàng CRM & Xuất file Excel',
      'Gắn thẻ Tag phân loại khách hàng VIP',
      'Ưu tiên xử lý tốc độ cao trên Edge',
    ],
    ctaText: 'Đăng ký gói Pro',
    ctaVariant: 'primary',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    badge: 'Doanh nghiệp lớn',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    price: '499.000 đ',
    period: '/ tháng',
    description: 'Giải pháp chuyên sâu cho chuỗi cửa hàng, công ty đào tạo, dịch vụ cần tích hợp quy mô lớn.',
    features: [
      'Tối đa 5 Zalo Bot kết nối',
      'Tối đa 100 tài liệu Kho tri thức RAG',
      '50.000 tin nhắn AI / tháng',
      'Toàn bộ tính năng CRM & Quản lý hội thoại',
      'Tùy biến Prompt & Tone of Voice riêng',
      'Giám sát hạn mức Quota chi tiết',
      'Hỗ trợ kỹ thuật 24/7 từ chuyên gia',
    ],
    ctaText: 'Đăng ký Enterprise',
    ctaVariant: 'secondary',
  },
];

export default function HomePage() {
  const { user } = useAuth();
  const [contactSettings, setContactSettings] = useState({
    company_name: 'CÔNG TY TNHH KỸ NĂNG MỀM',
    brand_name: 'Zalo BaaS',
    hotline: '0986.000.797',
    contact_email: 'congtykynangmem@gmail.com',
    address: 'Số 41 Trần Phú, Phường Phước Hậu, TP. Vĩnh Long, Tỉnh Vĩnh Long',
    working_hours: '08:00 – 21:00 hàng ngày (Hỗ trợ 24/7)',
    website_url: 'https://bot.knm.asia',
    zalo_oa_url: 'https://zalo.me/0986000797',
  });

  useEffect(() => {
    fetchApi<{ ok: boolean; contact?: typeof contactSettings }>('/v1/public/settings')
      .then((res) => {
        if (res?.contact) {
          setContactSettings((prev) => ({ ...prev, ...res.contact }));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 selection:bg-blue-600 selection:text-white">
      {/* 1. Header / Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-slate-900">Zalo BaaS</span>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 border border-blue-200">
                  AI Edge
                </span>
              </div>
              <span className="block text-[11px] text-slate-400 font-medium -mt-0.5">bot.knm.asia</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-blue-600 transition">
              Tính năng
            </a>
            <a href="#rag" className="hover:text-blue-600 transition">
              Kho tri thức RAG
            </a>
            <a href="#how-it-works" className="hover:text-blue-600 transition">
              Quy trình
            </a>
            <a href="#pricing" className="hover:text-blue-600 transition">
              Bảng giá
            </a>
            <a href="#contact" className="hover:text-blue-600 transition">
              Liên hệ
            </a>
          </nav>

          {/* CTA Buttons */}
          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/dashboard/bots"
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-blue-700 transition"
              >
                <span>Vào Bảng điều khiển</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-700 hover:text-blue-600 transition"
                >
                  Đăng nhập
                </Link>
                <Link
                  href="/register?plan=trial"
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-blue-700 transition"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Dùng thử miễn phí</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-100/50 via-white to-transparent" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Content */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/80 px-4 py-1.5 text-xs font-semibold text-blue-700">
                <Sparkles className="h-4 w-4 text-blue-600" />
                <span>Nền tảng Tự động hóa Zalo Bot AI thế hệ mới</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-5xl font-black tracking-tight text-slate-900 leading-[1.15]">
                Tự Động Hóa Chăm Sóc & Bán Hàng Trên Zalo{' '}
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Với Trí Tuệ Nhân Tạo AI
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto lg:mx-0">
                Kết nối Zalo OA và Zalo cá nhân chỉ trong 2 phút. Tích hợp Kho tri thức RAG thông minh,
                tự động tra cứu giá sản phẩm, thực đơn và chính sách cửa hàng chính xác 100%, trả lời khách hàng
                24/7 không cần người trực.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                <Link
                  href="/register?plan=trial"
                  className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl bg-blue-600 px-7 py-3.5 text-sm font-bold text-white shadow-xl shadow-blue-500/25 hover:bg-blue-700 transition"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Dùng thử 7 ngày miễn phí</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <a
                  href="#pricing"
                  className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-7 py-3.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm"
                >
                  <span>Xem các gói cước</span>
                </a>
              </div>

              {/* Trust badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-slate-200/80 text-left">
                <div>
                  <div className="text-xl font-black text-slate-900">24/7</div>
                  <div className="text-xs text-slate-500">Phản hồi tức thì &lt; 2s</div>
                </div>
                <div>
                  <div className="text-xl font-black text-blue-600">99.8%</div>
                  <div className="text-xs text-slate-500">Hiểu ngữ nghĩa tiếng Việt</div>
                </div>
                <div>
                  <div className="text-xl font-black text-emerald-600">4x</div>
                  <div className="text-xs text-slate-500">Tăng tỷ lệ chốt đơn hàng</div>
                </div>
                <div>
                  <div className="text-xl font-black text-indigo-600">0 đ</div>
                  <div className="text-xs text-slate-500">Bắt đầu dùng thử ngay</div>
                </div>
              </div>
            </div>

            {/* Right Interactive Chat Preview */}
            <div className="lg:col-span-5">
              <div className="relative mx-auto max-w-md rounded-3xl border border-slate-200/80 bg-white shadow-2xl shadow-blue-500/10 overflow-hidden">
                {/* Chat Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white font-bold">
                      <Bot className="h-5 w-5" />
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-blue-600" />
                    </div>
                    <div>
                      <div className="font-bold text-sm flex items-center gap-1.5">
                        Bot Gà rán Five Star - 41 Trần Phú
                      </div>
                      <div className="text-[11px] text-blue-100 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Trực tuyến 24/7 • AI RAG Bot
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                    Zalo OA
                  </span>
                </div>

                {/* Chat Messages */}
                <div className="p-4 space-y-3.5 bg-slate-50/70 text-xs min-h-[360px] flex flex-col justify-end">
                  <div className="text-center">
                    <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-[10px] text-slate-500">
                      Hôm nay
                    </span>
                  </div>

                  {/* Customer Question */}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-blue-600 p-3 text-white shadow-sm">
                      <p className="font-medium">quán ơi giá gà giòn giòn bao nhiêu vậy bạn? có ship ko?</p>
                      <span className="mt-1 block text-right text-[10px] text-blue-200">18:44</span>
                    </div>
                  </div>

                  {/* AI Bot Answer */}
                  <div className="flex gap-2.5 items-start">
                    <div className="h-7 w-7 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-sm">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-white p-3.5 text-slate-800 shadow-sm border border-slate-200/70 space-y-2">
                      <p className="font-semibold text-slate-900">
                        Dạ em xin chào anh/chị! Em là Bot Gà rán Five Star - 41 Trần Phú ạ 🍗
                      </p>
                      <p className="text-slate-600">
                        Dạ quán có <strong>Gà giòn giòn</strong> niêm yết: <strong>35.000 đ / miếng</strong> ạ!
                      </p>
                      <div className="rounded-xl bg-blue-50/80 p-2 text-[11px] text-blue-900 border border-blue-100">
                        📍 <strong>Địa chỉ:</strong> Số 41 Trần Phú, P. Phước Hậu, TP. Vĩnh Long<br />
                        ⏰ <strong>Giờ mở cửa:</strong> 08:00 – 21:00 xuyên suốt cả tuần<br />
                        📞 <strong>Hotline:</strong> 0986.000.797
                      </div>
                      <p className="text-slate-600">
                        Quán có giao hàng tận nơi qua <strong>GrabFood, ShopeeFood, VillFood</strong> ạ:
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className="inline-block rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                          🛵 Link VillFood
                        </span>
                        <span className="inline-block rounded-lg bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-700 border border-green-200">
                          🍔 Link GrabFood
                        </span>
                      </div>
                      <span className="block text-right text-[10px] text-slate-400">18:44 • AI RAG Engine</span>
                    </div>
                  </div>
                </div>

                {/* Input Simulation */}
                <div className="border-t border-slate-200 p-3 bg-white flex items-center gap-2">
                  <div className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-400">
                    Nhập tin nhắn Zalo...
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                    <Send className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Core Features Section */}
      <section id="features" className="py-20 bg-white border-t border-slate-200/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              Tính năng toàn diện
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Mọi Thứ Doanh Nghiệp Cần Để Vận Hành Bot AI Trên Zalo
            </h2>
            <p className="mt-3 text-base text-slate-500">
              Không chỉ là chatbot tự động thông thường, Zalo BaaS kết hợp mô hình AI ngôn ngữ lớn và Kho tri thức RAG chính xác.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="rounded-3xl border border-slate-200/80 bg-slate-50/50 p-7 hover:bg-white hover:shadow-xl hover:border-blue-200 transition-all duration-300">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 mb-5">
                <Bot className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Kết Nối Zalo Bot Linh Hoạt</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Hỗ trợ kết nối cả Zalo Official Account (OA) có tích xanh và Zalo cá nhân qua Webhook an toàn,
                phản hồi tức thì mọi tin nhắn của khách hàng.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-3xl border border-slate-200/80 bg-slate-50/50 p-7 hover:bg-white hover:shadow-xl hover:border-blue-200 transition-all duration-300">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 mb-5">
                <BookOpen className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Kho Tri Thức RAG Thông Minh</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Nạp bảng giá, menu, chính sách Markdown / văn bản. AI tự động cắt nhỏ đoạn (chunking), tính toán vector
                và tra cứu từ khóa gần đúng tiếng Việt chuẩn xác 100%.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-3xl border border-slate-200/80 bg-slate-50/50 p-7 hover:bg-white hover:shadow-xl hover:border-blue-200 transition-all duration-300">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 mb-5">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Tư Vấn & Dẫn Link Chốt Đơn</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Hiểu câu hỏi tìm giá hoặc món ăn, tự động trích dẫn bảng giá niêm yết và gửi link đặt hàng nhanh qua
                ShopeeFood, GrabFood, VillFood giúp tăng doanh số.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="rounded-3xl border border-slate-200/80 bg-slate-50/50 p-7 hover:bg-white hover:shadow-xl hover:border-blue-200 transition-all duration-300">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-purple-600 mb-5">
                <MessageSquare className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Live Chat & Tiếp Quản CSKH</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Theo dõi thời gian thực mọi hội thoại giữa bot và khách hàng. Nhân viên chăm sóc có thể nhấn nút tiếp quản
                và trò chuyện trực tiếp khi có yêu cầu đặc biệt.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="rounded-3xl border border-slate-200/80 bg-slate-50/50 p-7 hover:bg-white hover:shadow-xl hover:border-blue-200 transition-all duration-300">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 mb-5">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Quản Lý Khách Hàng CRM</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Tự động lưu trữ danh bạ khách hàng, số điện thoại, ngày liên hệ cuối cùng, phân loại khách hàng VIP / Tiềm năng
                và hỗ trợ xuất dữ liệu ra file Excel.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="rounded-3xl border border-slate-200/80 bg-slate-50/50 p-7 hover:bg-white hover:shadow-xl hover:border-blue-200 transition-all duration-300">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 mb-5">
                <BarChart3 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Giám Sát Hạn Mức & Quota</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Thống kê số lượng tin nhắn AI tiêu thụ, số lượng bot đang hoạt động, hạn mức tài liệu RAG và quản lý
                thời hạn gói cước minh bạch theo thời gian thực.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. RAG Highlight Section */}
      <section id="rag" className="py-20 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-8 sm:p-14 text-white shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 right-0 -mt-10 -mr-10 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              <div className="lg:col-span-7 space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-300 border border-blue-500/30">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Công nghệ Tìm kiếm RAG Thế Hệ Mới</span>
                </div>

                <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
                  Tra Cứu Thông Minh & Tìm Kiếm Gần Đúng Tiếng Việt
                </h2>

                <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                  Hệ thống RAG của Zalo BaaS giải quyết triệt để vấn đề AI bịa đặt (hallucination). Khi người dùng hỏi
                  &quot;giá gà giòn?&quot; hoặc &quot;gà cay giá sao&quot;, thuật toán tìm kiếm kết hợp Vector Embeddings
                  và Full-text Keyword Matcher tự động nhận diện đúng sản phẩm <strong>Gà giòn giòn</strong> và trả về
                  mức giá niêm yết 35.000 đ chính xác trong kho tri thức của bạn.
                </p>

                <div className="space-y-3 pt-2 text-xs sm:text-sm text-slate-300">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    <span>Không bao giờ trả lời sai lệch thông tin cửa hàng cung cấp</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    <span>Hỗ trợ từ khóa tiếng Việt không dấu, viết tắt, có dấu hỏi chấm</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    <span>Tự động cập nhật kiến thức ngay khi bạn chỉnh sửa và nhấn Lưu RAG</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 bg-white/10 rounded-2xl p-6 border border-white/10 backdrop-blur-sm">
                <div className="text-xs font-bold uppercase tracking-wider text-blue-300 mb-3 flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  Mô phỏng truy xuất RAG
                </div>
                <div className="space-y-3 text-xs">
                  <div className="rounded-xl bg-slate-900/80 p-3 border border-slate-700/60">
                    <span className="text-slate-400 font-mono">Câu hỏi khách hàng:</span>
                    <p className="font-semibold text-amber-300 mt-1">&quot;quán có bán giá gà giòn ko shop?&quot;</p>
                  </div>
                  <div className="flex items-center justify-center text-slate-400 text-[11px] gap-1">
                    <span>↓</span>
                    <span>Vector Search + Fuzzy Keyword Matcher</span>
                    <span>↓</span>
                  </div>
                  <div className="rounded-xl bg-slate-900/80 p-3 border border-emerald-500/40">
                    <span className="text-emerald-400 font-mono">Đoạn tri thức khớp 100%:</span>
                    <p className="text-slate-200 mt-1 font-mono text-[11px]">
                      &quot;Gà giòn giòn: 35.000 đ / miếng. Combo 3 miếng: 99.000 đ...&quot;
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. How It Works Section */}
      <section id="how-it-works" className="py-20 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              Triển khai nhanh chóng
            </span>
            <h2 className="mt-4 text-3xl font-extrabold text-slate-900 tracking-tight">
              3 Bước Đơn Giản Để Sở Hữu Bot AI 24/7
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Không cần kỹ năng lập trình, giao diện tiếng Việt thân thiện và trực quan.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="rounded-3xl border border-slate-200 p-8 text-center bg-slate-50/50">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-xl font-black text-white shadow-lg shadow-blue-500/25">
                1
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">Đăng Ký & Chọn Gói</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Tạo tài khoản doanh nghiệp trong 30 giây. Chọn gói Dùng thử 7 ngày hoàn toàn miễn phí không cần thanh toán.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 p-8 text-center bg-slate-50/50">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-black text-white shadow-lg shadow-indigo-500/25">
                2
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">Nạp Kho Tri Thức RAG</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Dán bảng giá, thực đơn, giờ mở cửa và địa chỉ của cửa hàng vào hệ thống. AI sẽ tự động phân tích và ghi nhớ.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 p-8 text-center bg-slate-50/50">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-black text-white shadow-lg shadow-emerald-500/25">
                3
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">Kết Nối Zalo & Vận Hành</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Quét mã QR hoặc kết nối Zalo OA qua Webhook. Bot lập tức trực chiến trả lời khách hàng suốt ngày đêm.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Pricing Section */}
      <section id="pricing" className="py-20 bg-slate-50 border-t border-slate-200/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              Bảng giá dịch vụ
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Bảng Giá Cạnh Tranh & Linh Hoạt Cho Mọi Doanh Nghiệp
            </h2>
            <p className="mt-3 text-base text-slate-500">
              Nâng cấp hoặc gia hạn bất kỳ lúc nào với phương thức thanh toán chuyển khoản tự động qua Napas VietQR.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
            {PRICING_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative flex flex-col justify-between rounded-3xl p-6 bg-white transition-all duration-300 ${
                  plan.popular
                    ? 'border-2 border-blue-600 shadow-xl shadow-blue-500/10 ring-4 ring-blue-500/10'
                    : 'border border-slate-200 shadow-sm hover:shadow-md'
                }`}
              >
                {plan.badge && (
                  <div className="mb-3">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${plan.badgeColor}`}
                    >
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div>
                  <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-slate-900">{plan.price}</span>
                    <span className="text-xs text-slate-500 font-medium">{plan.period}</span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 min-h-[36px]">{plan.description}</p>

                  <div className="my-6 border-t border-slate-100" />

                  <ul className="space-y-2.5 text-xs text-slate-600">
                    {plan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-8">
                  <Link
                    href={`/register?plan=${plan.id}`}
                    className={`flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-bold transition shadow-sm ${
                      plan.ctaVariant === 'primary'
                        ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/25 shadow-md'
                        : plan.ctaVariant === 'secondary'
                        ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-purple-500/25 shadow-md'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{plan.ctaText}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Call To Action Banner */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            Sẵn Sàng Nâng Tầm Dịch Vụ Khách Hàng Ngay Hôm Nay?
          </h2>
          <p className="text-sm sm:text-base text-blue-100 max-w-2xl mx-auto">
            Hàng trăm cửa hàng và doanh nghiệp đã tự động hóa 80% câu hỏi thường gặp trên Zalo.
            Bắt đầu trải nghiệm ngay mà không tốn bất kỳ chi phí nào.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register?plan=trial"
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl bg-white px-8 py-3.5 text-sm font-bold text-blue-600 shadow-xl hover:bg-blue-50 transition"
            >
              <Sparkles className="h-4 w-4" />
              <span>Đăng ký Dùng thử 7 ngày</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-8 py-3.5 text-sm font-bold text-white hover:bg-white/20 transition"
            >
              <span>Đăng nhập hệ thống</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 8. Footer */}
      <footer id="contact" className="bg-slate-900 text-slate-400 py-12 border-t border-slate-800 text-xs">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="space-y-3 md:col-span-2">
              <div className="flex items-center gap-2 text-white font-extrabold text-base">
                <Bot className="h-5 w-5 text-blue-400" />
                <span>Zalo BaaS (bot.knm.asia)</span>
              </div>
              <p className="text-slate-400 max-w-sm leading-relaxed">
                Nền tảng vận hành Zalo Bot thông minh với Agentic RAG trên Cloudflare Edge.
                Giúp doanh nghiệp tối ưu chăm sóc khách hàng và gia tăng doanh số 24/7.
              </p>
              <div className="text-[11px] text-slate-500">
                Đơn vị chủ quản: <strong>{contactSettings.company_name}</strong>
              </div>
            </div>

            <div>
              <div className="font-bold text-white mb-3 uppercase tracking-wider text-[11px]">
                Hệ thống & Dịch vụ
              </div>
              <ul className="space-y-2">
                <li>
                  <a href="#features" className="hover:text-white transition">
                    Tính năng Zalo Bot
                  </a>
                </li>
                <li>
                  <a href="#rag" className="hover:text-white transition">
                    Kho tri thức RAG
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-white transition">
                    Bảng giá & Gói cước
                  </a>
                </li>
                <li>
                  <Link href="/login" className="hover:text-white transition">
                    Đăng nhập tài khoản
                  </Link>
                </li>
                <li>
                  <Link href="/register?plan=trial" className="hover:text-white transition">
                    Đăng ký dùng thử
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <div className="font-bold text-white mb-3 uppercase tracking-wider text-[11px]">
                Hỗ trợ & Liên hệ
              </div>
              <ul className="space-y-2.5">
                <li className="flex items-center gap-2 text-slate-300">
                  <PhoneCall className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Hotline: <strong className="text-white">{contactSettings.hotline}</strong></span>
                </li>
                <li>Email: {contactSettings.contact_email}</li>
                <li>Địa chỉ: {contactSettings.address}</li>
                <li>Giờ hỗ trợ: {contactSettings.working_hours}</li>
                <li>Website: {contactSettings.website_url}</li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
            <div>
              © {new Date().getFullYear()} {contactSettings.brand_name} • {contactSettings.company_name}. Bảo lưu mọi quyền.
            </div>
            <div className="flex gap-4">
              <span>Chính sách bảo mật</span>
              <span>•</span>
              <span>Điều khoản sử dụng</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

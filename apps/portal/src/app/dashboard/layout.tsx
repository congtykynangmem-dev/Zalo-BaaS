'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  Bot,
  BookOpen,
  MessageSquare,
  BarChart3,
  LogOut,
  Building,
  User,
  ShieldCheck,
  Users,
  CreditCard,
} from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  const navItems = [
    {
      name: 'Bot của tôi',
      href: '/dashboard/bots',
      icon: Bot,
    },
    {
      name: 'Kho Tri thức & RAG',
      href: '/dashboard/knowledge',
      icon: BookOpen,
    },
    {
      name: 'Khách hàng CRM',
      href: '/dashboard/customers',
      icon: Users,
    },
    {
      name: 'Hộp thư Hội thoại',
      href: '/dashboard/conversations',
      icon: MessageSquare,
    },
    {
      name: 'Gói cước & Nâng cấp',
      href: '/dashboard/billing',
      icon: CreditCard,
    },
    {
      name: 'Thống kê & Quota',
      href: '/dashboard/analytics',
      icon: BarChart3,
    },
    ...(user.role === 'platform_owner'
      ? [
          {
            name: 'Quản trị Hệ thống',
            href: '/dashboard/admin',
            icon: ShieldCheck,
          },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white shadow-sm">
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-6">
          <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <span className="font-bold text-slate-900 tracking-tight">Zalo BaaS</span>
              <span className="block text-xs text-blue-600 font-medium">bot.knm.asia</span>
            </div>
          </Link>
        </div>

        {/* Tenant Info Card */}
        <div className="p-4 mx-3 my-3 rounded-xl bg-slate-50 border border-slate-100">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Building className="h-4 w-4 text-slate-400" />
            <span className="truncate">{user.tenant?.name || 'Doanh nghiệp'}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>Gói cước:</span>
            <span className="rounded-md bg-blue-100 px-2 py-0.5 font-semibold text-blue-700 uppercase text-[10px]">
              {user.tenant?.plan_id || 'Starter'}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User profile & Logout */}
        <div className="border-t border-slate-100 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
              <User className="h-5 w-5" />
            </div>
            <div className="overflow-hidden">
              <p className="truncate text-xs font-semibold text-slate-800">{user.email}</p>
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <ShieldCheck className="h-3 w-3 text-emerald-500" />
                <span className="capitalize">{user.role.replace('_', ' ')}</span>
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-red-600 transition"
          >
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 pl-64">
        <div className="p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}


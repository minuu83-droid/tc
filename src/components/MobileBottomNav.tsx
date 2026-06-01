'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { clearSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Role } from '@/lib/types';

type NavItem = { href: string; label: string; icon: string; badge?: number };

interface Props {
  role: Role;
  isApprover?: boolean;
  profileName?: string;
}

function buildNav(role: Role, isApprover: boolean, pending: number): { tabs: NavItem[]; more: NavItem[] } {
  const approval: NavItem = { href: '/approval', label: '결재', icon: '✅', badge: pending };

  if (role === '마스터관리자' || role === '부관리자') return {
    tabs: [
      { href: '/dashboard', label: '대시보드', icon: '📊' },
      { href: '/requests',  label: '구매등록',  icon: '📋' },
      { href: '/bids',      label: '입찰관리',  icon: '🏷️' },
      { href: '/orders',    label: '발주현황',  icon: '📦' },
    ],
    more: [
      { href: '/contracts',        label: '계약이력',       icon: '📄' },
      { href: '/items',            label: '품목관리',       icon: '🔧' },
      { href: '/partners',         label: '협력사관리',     icon: '🏢' },
      { href: '/admin/users',      label: '사용자관리',     icon: '👤' },
      { href: '/admin/suppliers',  label: '납품협력사관리', icon: '🏭' },
    ],
  };

  if (role === '직영관리자') return {
    tabs: [
      { href: '/dashboard', label: '대시보드', icon: '📊' },
      { href: '/requests',  label: '구매등록',  icon: '📋' },
      approval,
      { href: '/orders',    label: '발주현황',  icon: '📦' },
    ],
    more: [
      { href: '/bids',      label: '입찰관리', icon: '🏷️' },
      { href: '/contracts', label: '계약이력', icon: '📄' },
      { href: '/items',     label: '품목관리', icon: '🔧' },
    ],
  };

  if (role === '직영' && isApprover) return {
    tabs: [
      { href: '/dashboard', label: '대시보드', icon: '📊' },
      { href: '/requests',  label: '구매등록',  icon: '📋' },
      { href: '/orders',    label: '발주현황',  icon: '📦' },
      approval,
    ],
    more: [{ href: '/bids', label: '입찰관리', icon: '🏷️' }],
  };

  if (role === '직영') return {
    tabs: [
      { href: '/dashboard', label: '대시보드', icon: '📊' },
      { href: '/requests',  label: '구매등록',  icon: '📋' },
      { href: '/orders',    label: '발주현황',  icon: '📦' },
    ],
    more: [{ href: '/bids', label: '입찰관리', icon: '🏷️' }],
  };

  if (role === '사용협력사') return {
    tabs: [
      { href: '/dashboard', label: '대시보드', icon: '📊' },
      { href: '/requests',  label: '구매등록',  icon: '📋' },
      { href: '/items',     label: '품목관리',  icon: '🔧' },
      { href: '/orders',    label: '발주현황',  icon: '📦' },
    ],
    more: [],
  };

  // 납품협력사
  return {
    tabs: [
      { href: '/dashboard', label: '대시보드', icon: '📊' },
      { href: '/bids',      label: '입찰참여',  icon: '🏷️' },
      { href: '/orders',    label: '발주현황',  icon: '📦' },
      { href: '/contracts', label: '계약이력',  icon: '📄' },
    ],
    more: [],
  };
}

export default function MobileBottomNav({ role, isApprover = false, profileName }: Props) {
  const pathname = usePathname();
  const router   = useRouter();
  const [showMore, setShowMore] = useState(false);
  const [pending, setPending]   = useState(0);

  const showApproval = role === '직영관리자' || (role === '직영' && isApprover);

  useEffect(() => {
    if (!showApproval) return;
    const fetch = async () => {
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('approval_status', '결재대기');
      setPending(count ?? 0);
    };
    fetch();
    const ch = supabase
      .channel('mobile-nav-approval')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetch)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [showApproval]);

  const { tabs, more } = buildNav(role, isApprover, pending);

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'));

  const handleLogout = () => {
    clearSession();
    router.push('/login');
  };

  return (
    <>
      {/* Bottom navigation bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex h-16">
          {tabs.map(tab => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive(tab.href) ? 'text-blue-600' : 'text-gray-500'
              }`}
            >
              <span className="relative inline-block">
                <span className="text-[22px] leading-none">{tab.icon}</span>
                {tab.badge != null && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-2 inline-flex items-center justify-center min-w-[16px] h-4 px-1 bg-orange-500 text-white text-[9px] font-bold rounded-full">
                    {tab.badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          ))}

          {/* More button */}
          <button
            onClick={() => setShowMore(v => !v)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              showMore ? 'text-blue-600' : 'text-gray-500'
            }`}
          >
            <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span className="text-[10px] font-medium">더보기</span>
          </button>
        </div>
      </nav>

      {/* More drawer */}
      {showMore && (
        <div className="lg:hidden">
          <div
            className="fixed inset-0 bg-black/40 z-50"
            onClick={() => setShowMore(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 shadow-xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Extra menu items */}
            {more.length > 0 && (
              <div className="px-4 pb-3">
                <div className="grid grid-cols-3 gap-3">
                  {more.map(item => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setShowMore(false)}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-xl transition-colors ${
                        isActive(item.href)
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-gray-50 text-gray-600 active:bg-gray-100'
                      }`}
                    >
                      <span className="text-2xl">{item.icon}</span>
                      <span className="text-[11px] font-medium text-center leading-tight">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* User info + logout */}
            <div className="px-4 pb-4 pt-3 border-t border-gray-100">
              {profileName && (
                <p className="text-xs text-gray-400 mb-3 text-center">{profileName} · {role}</p>
              )}
              <button
                onClick={handleLogout}
                className="w-full py-3 text-sm font-semibold text-red-600 bg-red-50 rounded-xl active:bg-red-100 transition-colors"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

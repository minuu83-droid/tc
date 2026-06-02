'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Role } from '@/lib/types';

type MenuItem = {
  href: string;
  label: string;
  icon: string;
  roles: Role[];
};

const menuItems: MenuItem[] = [
  { href: '/dashboard', label: '대시보드',        icon: '📊', roles: ['마스터관리자', '부관리자', '직영관리자', '직영', '사용협력사', '납품협력사'] },
  { href: '/requests',  label: '신규 구매품 등록', icon: '📋', roles: ['마스터관리자', '부관리자', '직영관리자', '직영', '사용협력사'] },
  { href: '/bids',      label: '입찰 관리',        icon: '🏷️', roles: ['마스터관리자', '부관리자', '직영관리자', '직영', '납품협력사'] },
  { href: '/orders',    label: '발주 현황',        icon: '📦', roles: ['마스터관리자', '부관리자', '직영관리자', '직영', '사용협력사', '납품협력사'] },
  { href: '/contracts', label: '계약 이력',        icon: '📄', roles: ['마스터관리자', '부관리자', '직영관리자', '납품협력사'] },
  { href: '/items',     label: '품목 관리',        icon: '🔧', roles: ['마스터관리자', '부관리자', '직영관리자', '직영', '사용협력사'] },
  { href: '/partners',  label: '협력사 관리',      icon: '🏢', roles: ['마스터관리자', '부관리자', '직영관리자', '직영'] },
];

interface SidebarProps {
  role: Role;
  isApprover?: boolean;
  companyName?: string | null;
  username?: string | null;
}

export default function Sidebar({ role, isApprover = false, companyName, username }: SidebarProps) {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);

  const showApproval = role === '직영관리자' || (role === '직영' && isApprover);

  /* 결재 섹션이 있는 경우 결재대기 건수 실시간 조회 */
  useEffect(() => {
    if (!showApproval) return;

    const fetch = async () => {
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('approval_status', '결재대기');
      setPendingCount(count ?? 0);
    };

    fetch();

    const channel = supabase
      .channel('approval-pending-sidebar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetch)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [showApproval]);

  const roleColors: Record<Role, string> = {
    '마스터관리자': 'bg-red-700',
    '부관리자':     'bg-orange-600',
    '직영관리자':   'bg-amber-600',
    '직영':         'bg-blue-700',
    '사용협력사':   'bg-green-700',
    '납품협력사':   'bg-purple-700',
  };

  const isMasterAdmin = role === '마스터관리자';
  const isSubAdmin    = role === '부관리자';
  const isDirectMgr   = role === '직영관리자';

  return (
    <aside className="w-60 min-h-screen bg-gray-900 text-white flex flex-col">
      {/* 로고 영역 */}
      <div className="p-5 border-b border-gray-700">
        <h1 className="text-lg font-bold text-white">소모품 구매시스템</h1>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className={`inline-block px-2 py-0.5 text-xs rounded ${roleColors[role]}`}>
            {role}
          </span>
          {isMasterAdmin && (
            <span className="inline-block px-2 py-0.5 text-xs rounded bg-red-900 text-red-200 border border-red-600">
              MASTER
            </span>
          )}
          {isSubAdmin && (
            <span className="inline-block px-2 py-0.5 text-xs rounded bg-orange-900 text-orange-200 border border-orange-600">
              SUB
            </span>
          )}
          {isDirectMgr && (
            <span className="inline-block px-2 py-0.5 text-xs rounded bg-amber-900 text-amber-200 border border-amber-600">
              MGR
            </span>
          )}
          {!isDirectMgr && isApprover && (
            <span className="inline-block px-2 py-0.5 text-xs rounded bg-blue-900 text-blue-200 border border-blue-600">
              결재자
            </span>
          )}
        </div>
        {username && (
          <p className="mt-1 text-xs text-gray-500">@{username}</p>
        )}
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
        {/* 일반 메뉴 */}
        <div>
          <ul className="space-y-1">
            {menuItems
              .filter(item => item.roles.includes(role))
              .map(item => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        isActive
                          ? 'bg-blue-600 text-white font-medium'
                          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>

        {/* 결재 관리 (직영관리자 또는 직영+결재자) */}
        {showApproval && (
          <div>
            <p className="px-3 mb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
              결재
            </p>
            <ul className="space-y-1">
              <li>
                <Link
                  href="/approval"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    pathname === '/approval' || pathname.startsWith('/approval/')
                      ? 'bg-orange-600 text-white font-medium'
                      : 'text-orange-400 hover:bg-gray-800 hover:text-orange-300'
                  }`}
                >
                  <span>✅</span>
                  <span className="flex-1">결재 관리</span>
                  {pendingCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-orange-500 text-white text-[10px] font-bold rounded-full">
                      {pendingCount}
                    </span>
                  )}
                </Link>
              </li>
            </ul>
          </div>
        )}

        {/* 마스터관리자 / 부관리자 시스템 관리 메뉴 */}
        {(isMasterAdmin || isSubAdmin) && (
          <div>
            <p className="px-3 mb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-widest flex items-center gap-1">
              시스템 관리
              {isSubAdmin && (
                <span className="text-[9px] text-orange-400 normal-case font-normal">(보기 전용)</span>
              )}
            </p>
            <ul className="space-y-1">
              <li>
                <Link
                  href="/admin/users"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    pathname === '/admin/users' || pathname.startsWith('/admin/users/')
                      ? 'bg-red-700 text-white font-medium'
                      : 'text-red-400 hover:bg-gray-800 hover:text-red-300'
                  }`}
                >
                  <span>👤</span>
                  <span>사용자 관리</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/admin/suppliers"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    pathname === '/admin/suppliers' || pathname.startsWith('/admin/suppliers/')
                      ? 'bg-red-700 text-white font-medium'
                      : 'text-red-400 hover:bg-gray-800 hover:text-red-300'
                  }`}
                >
                  <span>🏭</span>
                  <span>납품협력사 관리</span>
                </Link>
              </li>
            </ul>
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-gray-700 text-xs text-gray-500 text-center">
        Field Procurement v1.0
      </div>
    </aside>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@/lib/types';

type MenuItem = {
  href: string;
  label: string;
  icon: string;
  roles: Role[];
};

const menuItems: MenuItem[] = [
  { href: '/dashboard', label: '대시보드',    icon: '📊', roles: ['직영', '사용협력사', '납품협력사'] },
  { href: '/requests',  label: '신규 구매품 등록', icon: '📋', roles: ['직영', '사용협력사'] },
  { href: '/bids',      label: '입찰 관리',   icon: '🏷️', roles: ['직영', '납품협력사'] },
  { href: '/orders',    label: '발주 현황',   icon: '📦', roles: ['직영', '사용협력사', '납품협력사'] },
  { href: '/contracts', label: '계약 이력',   icon: '📄', roles: ['직영', '납품협력사'] },
  { href: '/items',     label: '품목 관리',   icon: '🔧', roles: ['직영', '사용협력사'] },
  { href: '/partners',  label: '협력사 관리', icon: '🏢', roles: ['직영'] },
];

interface SidebarProps {
  role: Role;
  companyName?: string | null;
  username?: string | null;
}

export default function Sidebar({ role, companyName, username }: SidebarProps) {
  const pathname = usePathname();

  const roleColors: Record<Role, string> = {
    '직영':       'bg-blue-700',
    '사용협력사': 'bg-green-700',
    '납품협력사': 'bg-purple-700',
  };

  const isAdmin = role === '직영';
  const isAdminActive = pathname.startsWith('/admin');

  return (
    <aside className="w-60 min-h-screen bg-gray-900 text-white flex flex-col">
      {/* 로고 영역 */}
      <div className="p-5 border-b border-gray-700">
        <h1 className="text-lg font-bold text-white">소모품 구매시스템</h1>
        <div className="flex items-center gap-2 mt-2">
          <span className={`inline-block px-2 py-0.5 text-xs rounded ${roleColors[role]}`}>
            {role}
          </span>
          {isAdmin && (
            <span className="inline-block px-2 py-0.5 text-xs rounded bg-yellow-600 text-white">
              관리자
            </span>
          )}
        </div>
        {companyName && (
          <p className="mt-1 text-xs text-gray-400 truncate">{companyName}</p>
        )}
        {username && (
          <p className="mt-0.5 text-xs text-gray-500">@{username}</p>
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
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + '/');
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

        {/* 관리자 전용 메뉴 */}
        {isAdmin && (
          <div>
            <p className="px-3 mb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
              관리자 메뉴
            </p>
            <ul className="space-y-1">
              <li>
                <Link
                  href="/admin/users"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isAdminActive
                      ? 'bg-yellow-600 text-white font-medium'
                      : 'text-yellow-400 hover:bg-gray-800 hover:text-yellow-300'
                  }`}
                >
                  <span>👤</span>
                  <span>사용자 관리</span>
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

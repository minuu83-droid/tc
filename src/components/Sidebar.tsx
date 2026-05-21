'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Role = '직영' | '사용협력사' | '납품협력사';

type MenuItem = {
  href: string;
  label: string;
  icon: string;
  roles: Role[];
};

const menuItems: MenuItem[] = [
  { href: '/dashboard', label: '대시보드', icon: '📊', roles: ['직영', '사용협력사', '납품협력사'] },
  { href: '/requests', label: '구매 요청', icon: '📋', roles: ['직영', '사용협력사'] },
  { href: '/bids', label: '입찰 관리', icon: '🏷️', roles: ['직영', '납품협력사'] },
  { href: '/orders', label: '발주 현황', icon: '📦', roles: ['직영', '사용협력사', '납품협력사'] },
  { href: '/contracts', label: '계약 이력', icon: '📄', roles: ['직영', '납품협력사'] },
  { href: '/items', label: '품목 관리', icon: '🔧', roles: ['직영', '사용협력사'] },
  { href: '/partners', label: '협력사 관리', icon: '🏢', roles: ['직영'] },
];

interface SidebarProps {
  role: Role;
  companyName?: string | null;
}

export default function Sidebar({ role, companyName }: SidebarProps) {
  const pathname = usePathname();

  const roleColors: Record<Role, string> = {
    '직영': 'bg-blue-700',
    '사용협력사': 'bg-green-700',
    '납품협력사': 'bg-purple-700',
  };

  return (
    <aside className="w-60 min-h-screen bg-gray-900 text-white flex flex-col">
      <div className="p-5 border-b border-gray-700">
        <h1 className="text-lg font-bold text-white">소모품 구매시스템</h1>
        <div className={`mt-2 inline-block px-2 py-0.5 text-xs rounded ${roleColors[role]}`}>
          {role}
        </div>
        {companyName && (
          <p className="mt-1 text-xs text-gray-400 truncate">{companyName}</p>
        )}
      </div>
      <nav className="flex-1 p-4">
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
      </nav>
      <div className="p-4 border-t border-gray-700 text-xs text-gray-500 text-center">
        Field Procurement v1.0
      </div>
    </aside>
  );
}

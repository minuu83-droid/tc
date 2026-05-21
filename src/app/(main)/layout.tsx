'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/lib/types';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':     '대시보드',
  '/requests':      '구매 요청',
  '/requests/new':  '구매 요청 등록',
  '/bids':          '입찰 관리',
  '/orders':        '발주 현황',
  '/contracts':     '계약 이력',
  '/items':         '품목 관리',
  '/partners':      '협력사 관리',
};

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return; }
      const { data } = await supabase
        .from('profiles')
        .select('*, company:companies(name)')
        .eq('id', session.user.id)
        .single();
      setProfile(data as Profile);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session) { router.push('/login'); return; }
      if (event === 'SIGNED_OUT') { router.push('/login'); return; }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400">로딩 중...</div>
      </div>
    );
  }

  const title = PAGE_TITLES[pathname] ?? '현장 소모품 구매 시스템';

  return (
    <div className="flex min-h-screen">
      <Sidebar role={profile.role} companyName={(profile.company as { name: string } | null)?.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header profile={profile} title={title} />
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { clearSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/lib/types';

const SEEN_KEY = (userId: string) => `approval_seen_at_${userId}`;

export default function Header({ profile, title }: { profile: Profile; title: string }) {
  const router = useRouter();
  const [notifCount, setNotifCount] = useState(0);
  const [showBanner, setShowBanner] = useState(false);
  const [bannerMsg, setBannerMsg]   = useState('');
  const prevCount = useRef(0);

  const isApprover     = profile.role === '직영관리자' || (profile.role === '직영' && profile.is_approver);
  const isDirectWorker = profile.role === '직영' && !profile.is_approver;

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel>;

    const fetchCount = async () => {
      if (isApprover) {
        /* tc101: 결재대기 건수 */
        const { count } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('approval_status', '결재대기');
        const n = count ?? 0;

        if (n > prevCount.current && prevCount.current !== -1) {
          setBannerMsg(`결재 대기 ${n}건이 있습니다.`);
          setShowBanner(true);
        }
        prevCount.current = n;
        setNotifCount(n);

      } else if (isDirectWorker) {
        /* tc102~tc105: 내 발주 중 승인/반려된 미확인 건수 */
        const seenAt = localStorage.getItem(SEEN_KEY(profile.id)) ?? '1970-01-01T00:00:00Z';
        const { count } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('ordered_by', profile.id)
          .in('approval_status', ['승인', '반려'])
          .gt('approval_date', seenAt);
        const n = count ?? 0;

        if (n > prevCount.current && prevCount.current !== -1) {
          setBannerMsg(`발주 결재 결과 ${n}건을 확인하세요.`);
          setShowBanner(true);
        }
        prevCount.current = n;
        setNotifCount(n);
      }
    };

    /* 초기 로드 */
    prevCount.current = -1;
    fetchCount().then(() => { prevCount.current = notifCount; });

    /* 실시간 구독 */
    channel = supabase
      .channel(`header-notif-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchCount)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, isApprover, isDirectWorker]);

  /* 알림 클릭 시 */
  const handleBellClick = () => {
    if (isDirectWorker) {
      localStorage.setItem(SEEN_KEY(profile.id), new Date().toISOString());
      setNotifCount(0);
    }
    setShowBanner(false);
    router.push(isApprover ? '/approval' : '/orders');

  };

  const handleLogout = () => {
    clearSession();
    router.push('/login');
  };

  return (
    <>
      {/* 상단 알림 배너 */}
      {showBanner && (
        <div className="bg-orange-500 text-white px-6 py-2 flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <span>🔔</span>
            {bannerMsg}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={handleBellClick}
              className="underline font-medium hover:text-orange-100 transition-colors"
            >
              {isApprover ? '결재하러 가기' : '발주 현황 보기'}
            </button>
            <button
              onClick={() => setShowBanner(false)}
              className="text-orange-200 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <header className="h-14 lg:h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
        <h2 className="text-base lg:text-xl font-semibold text-gray-800 truncate">{title}</h2>
        <div className="flex items-center gap-2 lg:gap-4">

          {/* 알림 벨 */}
          {(isApprover || isDirectWorker) && (
            <button
              onClick={handleBellClick}
              className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              title={isApprover ? '결재 대기' : '결재 결과 알림'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {notifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-orange-500 text-white text-[10px] font-bold rounded-full">
                  {notifCount}
                </span>
              )}
            </button>
          )}

          {/* Desktop: user info + logout */}
          <div className="hidden lg:block text-right">
            <p className="text-sm font-medium text-gray-800">{profile.name}</p>
            <p className="text-xs text-gray-500">
              {(profile.company as { name: string } | null)?.name ?? profile.role}
              {(profile.role === '직영관리자' || profile.is_approver) && (
                <span className="ml-1 text-orange-600 font-medium">
                  {profile.role === '직영관리자' ? '· 관리자' : '· 결재자'}
                </span>
              )}
            </p>
          </div>
          <button onClick={handleLogout}
            className="hidden lg:block px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            로그아웃
          </button>

          {/* Mobile: user name only */}
          <span className="lg:hidden text-sm font-medium text-gray-700">{profile.name}</span>
        </div>
      </header>
    </>
  );
}

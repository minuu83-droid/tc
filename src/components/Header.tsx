'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/lib/types';

export default function Header({ profile, title }: { profile: Profile; title: string }) {
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-gray-800">{profile.name}</p>
          <p className="text-xs text-gray-500">
            {(profile.company as { name: string } | null)?.name ?? '직영'}
          </p>
        </div>
        <button onClick={handleLogout}
          className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
          로그아웃
        </button>
      </div>
    </header>
  );
}

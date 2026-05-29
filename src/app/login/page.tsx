'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { setSession } from '@/lib/auth';
import type { Profile } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data, error: rpcErr } = await supabase.rpc('login', {
      p_username: username.trim(),
      p_password: password,
    });

    setLoading(false);

    if (rpcErr) {
      setError(`오류: ${rpcErr.message}`);
      return;
    }

    const result = data as { error?: string } | null;
    if (!result || result.error) {
      setError(result?.error ?? '로그인에 실패했습니다. 다시 시도해주세요.');
      return;
    }

    setSession(data as Profile);
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#FAFAF8' }}>

      {/* ── 왼쪽: 건물 배경 이미지 (데스크탑 전용) ── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* 배경 이미지 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/tc/tc바탕.png"
          alt="TC 태창 현장"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* 밝은 오버레이 */}
        <div className="absolute inset-0 bg-white/10" />

        {/* 저작권 텍스트 */}
        <div className="absolute bottom-6 left-0 right-0 text-center">
          <p className="text-white/80 text-xs tracking-widest font-light">
            COPYRIGHT &copy; TC. ALL RIGHTS RESERVED.
          </p>
        </div>
      </div>

      {/* ── 오른쪽: 로그인 폼 ── */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center px-8 py-12 lg:px-16">

        {/* 로고 */}
        <div className="mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/tc/tc로고.png"
            alt="TC TAECHANG"
            style={{ width: '180px' }}
            className="object-contain"
          />
        </div>

        {/* 제목 */}
        <div className="w-full max-w-sm mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Login</h1>
          <p className="text-sm text-gray-500">TC넷에 오신것을 환영합니다.</p>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="아이디를 입력하세요"
              required
              autoFocus
              autoComplete="username"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:border-transparent transition-all"
              style={{ '--tw-ring-color': '#2D6A4F' } as React.CSSProperties}
              onFocus={e => (e.target.style.borderColor = '#2D6A4F')}
              onBlur={e => (e.target.style.borderColor = '#d1d5db')}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              required
              autoComplete="current-password"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:border-transparent transition-all"
              onFocus={e => (e.target.style.borderColor = '#2D6A4F')}
              onBlur={e => (e.target.style.borderColor = '#d1d5db')}
            />
          </div>

          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 text-sm font-bold text-white rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed tracking-widest"
            style={{ backgroundColor: loading ? '#4a9070' : '#2D6A4F' }}
            onMouseEnter={e => { if (!loading) (e.currentTarget.style.backgroundColor = '#245a42'); }}
            onMouseLeave={e => { if (!loading) (e.currentTarget.style.backgroundColor = '#2D6A4F'); }}
          >
            {loading ? '로그인 중...' : 'LOGIN'}
          </button>
        </form>

      </div>
    </div>
  );
}

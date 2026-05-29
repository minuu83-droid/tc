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
    /* 전체 페이지 배경 */
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: '#F0F0EA' }}
    >
      {/* ── 데스크탑: 중앙 카드 ── */}
      <div
        className="hidden lg:flex w-full overflow-hidden"
        style={{
          maxWidth: '900px',
          height: '70vh',
          minHeight: '520px',
          borderRadius: '20px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        {/* 왼쪽: 건물 배경 이미지 */}
        <div
          className="w-1/2 relative overflow-hidden flex-shrink-0"
          style={{ borderRadius: '20px 0 0 20px' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/tc/tc바탕.png"
            alt="TC 태창 현장"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-white/10" />
          <div className="absolute bottom-5 left-0 right-0 text-center">
            <p className="text-white/80 text-[10px] tracking-widest font-light">
              COPYRIGHT &copy; TC. ALL RIGHTS RESERVED.
            </p>
          </div>
        </div>

        {/* 오른쪽: 로그인 폼 */}
        <div
          className="w-1/2 flex flex-col items-center justify-center px-10"
          style={{ backgroundColor: '#FAFAF8', borderRadius: '0 20px 20px 0' }}
        >
          <LoginForm
            username={username}
            password={password}
            error={error}
            loading={loading}
            onUsername={setUsername}
            onPassword={setPassword}
            onSubmit={handleSubmit}
          />
        </div>
      </div>

      {/* ── 모바일: 전체화면 폼 ── */}
      <div
        className="lg:hidden w-full min-h-screen fixed inset-0 flex flex-col items-center justify-center px-8 py-12"
        style={{ backgroundColor: '#FAFAF8' }}
      >
        <LoginForm
          username={username}
          password={password}
          error={error}
          loading={loading}
          onUsername={setUsername}
          onPassword={setPassword}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}

/* ── 로그인 폼 공통 컴포넌트 ── */
function LoginForm({
  username, password, error, loading,
  onUsername, onPassword, onSubmit,
}: {
  username: string; password: string; error: string; loading: boolean;
  onUsername: (v: string) => void; onPassword: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="w-full max-w-xs">
      {/* 로고 */}
      <div className="mb-7 flex justify-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tc/tc로고.png" alt="TC TAECHANG" style={{ width: '160px' }} className="object-contain" />
      </div>

      {/* 제목 */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Login</h1>
        <p className="text-xs text-gray-500">TC넷에 오신것을 환영합니다.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            ID <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={username}
            onChange={e => onUsername(e.target.value)}
            placeholder="아이디 입력"
            required
            autoFocus
            autoComplete="username"
            className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none transition-all"
            onFocus={e => (e.target.style.borderColor = '#607D74')}
            onBlur={e => (e.target.style.borderColor = '#d1d5db')}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            Password <span className="text-red-400">*</span>
          </label>
          <input
            type="password"
            value={password}
            onChange={e => onPassword(e.target.value)}
            placeholder="비밀번호 입력"
            required
            autoComplete="current-password"
            className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none transition-all"
            onFocus={e => (e.target.style.borderColor = '#607D74')}
            onBlur={e => (e.target.style.borderColor = '#d1d5db')}
          />
        </div>

        {error && (
          <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
            {error}
          </div>
        )}

        <div className="pt-1">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 text-sm font-bold text-white rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed tracking-widest"
            style={{ backgroundColor: '#607D74' }}
            onMouseEnter={e => { if (!loading) (e.currentTarget.style.backgroundColor = '#4f6860'); }}
            onMouseLeave={e => { if (!loading) (e.currentTarget.style.backgroundColor = '#607D74'); }}
          >
            {loading ? '로그인 중...' : 'LOGIN'}
          </button>
        </div>
      </form>
    </div>
  );
}

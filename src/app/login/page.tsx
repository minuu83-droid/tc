'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { setSession } from '@/lib/auth';
import type { Profile } from '@/lib/types';

const DEMO_ACCOUNTS = [
  { username: 'admin',     password: 'admin123', role: '직영',       name: '홍길동' },
  { username: 'user1',     password: 'user123',  role: '사용협력사', name: '김철수' },
  { username: 'supplier1', password: 'sup123',   role: '납품협력사', name: '박민준' },
];

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
      console.error('[LOGIN] rpcErr:', rpcErr);
      return;
    }

    const result = data as { error?: string } | null;
    if (!result || result.error) {
      setError(result?.error ?? '로그인에 실패했습니다. 다시 시도해주세요.');
      console.warn('[LOGIN] 인증 실패:', result);
      return;
    }

    setSession(data as Profile);
    router.push('/dashboard');
  };

  const fillDemo = (username: string, password: string) => {
    setUsername(username);
    setPassword(password);
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl flex gap-6">

        {/* 로그인 폼 */}
        <div className="flex-1 bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">🏭</div>
            <h1 className="text-2xl font-bold text-gray-900">현장 소모품 구매 시스템</h1>
            <p className="text-gray-500 mt-1 text-sm">Field Procurement Management System</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">아이디</label>
              <input
                className="input"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="아이디 입력"
                required
                autoFocus
                autoComplete="username"
              />
            </div>
            <div>
              <label className="label">비밀번호</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="비밀번호 입력"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full py-2.5 text-base"
              disabled={loading}
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        </div>

        {/* 테스트 계정 */}
        <div className="w-72 bg-white/10 backdrop-blur rounded-2xl p-6 text-white">
          <h3 className="font-semibold mb-4 text-lg">테스트 계정</h3>
          <div className="space-y-3">
            {DEMO_ACCOUNTS.map(acc => (
              <button
                key={acc.username}
                type="button"
                onClick={() => fillDemo(acc.username, acc.password)}
                className="w-full text-left bg-white/10 hover:bg-white/20 rounded-xl p-3 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{acc.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    acc.role === '직영'       ? 'bg-blue-500'   :
                    acc.role === '사용협력사' ? 'bg-green-500'  : 'bg-purple-500'
                  }`}>
                    {acc.role}
                  </span>
                </div>
                <div className="text-xs text-white/70">ID: {acc.username}</div>
              </button>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-white/20 text-xs text-white/60 space-y-1">
            <p>• 직영: 전체 관리 권한</p>
            <p>• 사용협력사: 구매 요청/발주 조회</p>
            <p>• 납품협력사: 입찰 참여/납품 관리</p>
          </div>
        </div>

      </div>
    </div>
  );
}

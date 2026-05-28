'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import type { Role, Profile } from '@/lib/types';

const ROLES: Role[] = ['마스터관리자', '직영', '사용협력사', '납품협력사'];

const ROLE_META: Record<Role, { color: string; bg: string; desc: string }> = {
  '마스터관리자': { color: 'text-red-700',    bg: 'bg-red-100',    desc: '전체 메뉴 + 사용자 관리 + 시스템 전체 설정' },
  '직영':         { color: 'text-blue-700',   bg: 'bg-blue-100',   desc: '구매 등록 + 낙찰 확정 + 계약·발주 관리' },
  '사용협력사':   { color: 'text-green-700',  bg: 'bg-green-100',  desc: '신규 구매품 등록 + 품목 관리 + 발주 현황' },
  '납품협력사':   { color: 'text-purple-700', bg: 'bg-purple-100', desc: '입찰 참여 + 발주 현황 + 계약 이력 (파트별 매칭)' },
};

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  role: Role;
  parts: string[] | null;
  created_at: string;
};

type SaveState = 'idle' | 'saving' | 'done' | 'error';

export default function AdminUsersPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [users, setUsers]     = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleMap, setRoleMap] = useState<Record<string, Role>>({});
  const [stateMap, setStateMap] = useState<Record<string, SaveState>>({});
  const [error, setError]     = useState('');

  /* ── 세션 체크: 마스터관리자만 접근 ── */
  useEffect(() => {
    const session = getSession();
    if (!session) { router.push('/login'); return; }
    if (session.role !== '마스터관리자') { router.push('/dashboard'); return; }
    setProfile(session);
  }, [router]);

  /* ── 유저 목록 조회 ── */
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, name, email, username, role, parts, created_at')
      .order('created_at');

    if (err) {
      setError(`데이터 조회 실패: ${err.message}`);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as UserRow[];
    setUsers(rows);
    setRoleMap(Object.fromEntries(rows.map(u => [u.id, u.role])));
    setLoading(false);
  }, []);

  useEffect(() => { if (profile) fetchUsers(); }, [profile, fetchUsers]);

  /* ── 역할 저장 ── */
  const saveUser = async (targetId: string) => {
    if (!profile) return;
    const user    = users.find(u => u.id === targetId)!;
    const newRole = roleMap[targetId] ?? user.role;

    if (newRole === user.role) return;

    setStateMap(m => ({ ...m, [targetId]: 'saving' }));

    const { data, error: rpcErr } = await supabase.rpc('update_user_role', {
      p_requester_id: profile.id,
      p_target_id:   targetId,
      p_new_role:    newRole,
    });

    if (rpcErr || (data as { error?: string })?.error) {
      setStateMap(m => ({ ...m, [targetId]: 'error' }));
      setError(rpcErr?.message ?? (data as { error?: string }).error ?? '역할 변경 실패');
      setRoleMap(m => ({ ...m, [targetId]: user.role }));
      setTimeout(() => setStateMap(m => ({ ...m, [targetId]: 'idle' })), 2000);
      return;
    }

    setStateMap(m => ({ ...m, [targetId]: 'done' }));
    setUsers(prev => prev.map(u => u.id === targetId ? { ...u, role: newRole } : u));
    setTimeout(() => setStateMap(m => ({ ...m, [targetId]: 'idle' })), 1500);
  };

  if (!profile || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 animate-pulse">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      {/* 헤더 */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">사용자 관리</h2>
        <p className="text-sm text-gray-500 mt-1">
          전체 사용자의 역할을 관리합니다. 납품협력사 파트 설정은 <strong>납품협력사 관리</strong> 메뉴에서 합니다.
        </p>
      </div>

      {/* 역할 권한 안내 */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {ROLES.map(r => (
          <div key={r} className={`rounded-xl p-4 border ${ROLE_META[r].bg} border-transparent`}>
            <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_META[r].bg} ${ROLE_META[r].color} border border-current/20 mb-2`}>
              {r}
            </span>
            <p className={`text-xs ${ROLE_META[r].color} leading-relaxed`}>{ROLE_META[r].desc}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <span>⚠️</span>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="underline text-xs shrink-0">닫기</button>
        </div>
      )}

      {/* 유저 테이블 */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-600">이름</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">아이디</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">이메일</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">현재 역할</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">역할 변경</th>
              <th className="px-4 py-3 w-28"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(user => {
              const selected    = roleMap[user.id] ?? user.role;
              const s           = stateMap[user.id] ?? 'idle';
              const isMe        = user.id === profile.id;
              const roleChanged = selected !== user.role;

              return (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  {/* 이름 */}
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {user.name}
                    {isMe && <span className="ml-1.5 text-xs text-blue-500 font-normal">(나)</span>}
                  </td>
                  {/* 아이디 */}
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                    {user.username ?? <span className="text-gray-300">—</span>}
                  </td>
                  {/* 이메일 */}
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {user.email ?? <span className="text-gray-300">—</span>}
                  </td>
                  {/* 현재 역할 뱃지 */}
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_META[user.role].bg} ${ROLE_META[user.role].color}`}>
                      {user.role}
                    </span>
                  </td>
                  {/* 역할 드롭다운 */}
                  <td className="px-4 py-3">
                    <select
                      value={selected}
                      onChange={e => {
                        setRoleMap(m => ({ ...m, [user.id]: e.target.value as Role }));
                        setStateMap(m => ({ ...m, [user.id]: 'idle' }));
                        setError('');
                      }}
                      disabled={s === 'saving'}
                      className={[
                        'text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 transition-colors',
                        roleChanged ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white',
                        s === 'saving' ? 'opacity-50 cursor-not-allowed' : '',
                      ].join(' ')}
                    >
                      {ROLES.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  {/* 저장 버튼 */}
                  <td className="px-4 py-3 text-right">
                    {s === 'saving' && <span className="text-xs text-gray-400 animate-pulse">저장 중...</span>}
                    {s === 'done'   && <span className="text-xs text-green-600 font-medium">✓ 저장됨</span>}
                    {s === 'error'  && <span className="text-xs text-red-500 font-medium">✗ 실패</span>}
                    {s === 'idle' && roleChanged && (
                      <button
                        onClick={() => saveUser(user.id)}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                      >
                        저장
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {users.length === 0 && !loading && (
          <div className="text-center py-12 text-sm text-gray-400">
            {error ? '데이터를 불러오지 못했습니다.' : '등록된 사용자가 없습니다.'}
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-gray-400">
        총 {users.length}명 · 역할 변경 후 <strong>저장</strong> 버튼을 클릭해야 반영됩니다.
      </p>
    </div>
  );
}

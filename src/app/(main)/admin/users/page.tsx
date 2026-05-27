'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import type { Role, Profile } from '@/lib/types';
import { PARTS_LIST } from '@/lib/constants';

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
  company_id: number | null;
  parts: string[] | null;
  created_at: string;
};

type SaveState = 'idle' | 'saving' | 'done' | 'error';

const sortedArr = (a: string[]) => [...a].sort().join(',');

export default function AdminUsersPage() {
  const router = useRouter();
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [users, setUsers]       = useState<UserRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [roleMap, setRoleMap]   = useState<Record<string, Role>>({});
  const [partsMap, setPartsMap] = useState<Record<string, string[]>>({});
  const [stateMap, setStateMap] = useState<Record<string, SaveState>>({});
  const [error, setError]       = useState('');

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
      .select('id, name, email, username, role, company_id, parts, created_at')
      .order('created_at');

    if (err) {
      setError(`데이터 조회 실패: ${err.message}`);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as UserRow[];
    setUsers(rows);
    setRoleMap(Object.fromEntries(rows.map(u => [u.id, u.role])));
    setPartsMap(Object.fromEntries(rows.map(u => [u.id, u.parts ?? []])));
    setLoading(false);
  }, []);

  useEffect(() => { if (profile) fetchUsers(); }, [profile, fetchUsers]);

  /* ── 파트 토글 ── */
  const togglePart = (userId: string, part: string) => {
    setPartsMap(m => {
      const cur = m[userId] ?? [];
      const next = cur.includes(part) ? cur.filter(p => p !== part) : [...cur, part];
      return { ...m, [userId]: next };
    });
    setStateMap(m => ({ ...m, [userId]: 'idle' }));
    setError('');
  };

  /* ── 저장 (역할 + 파트) ── */
  const saveUser = async (targetId: string) => {
    if (!profile) return;
    const user      = users.find(u => u.id === targetId)!;
    const newRole   = roleMap[targetId]  ?? user.role;
    const newParts  = partsMap[targetId] ?? user.parts ?? [];

    const roleChanged  = newRole !== user.role;
    const partsChanged = newRole === '납품협력사' &&
      sortedArr(newParts) !== sortedArr(user.parts ?? []);

    if (!roleChanged && !partsChanged) return;

    setStateMap(m => ({ ...m, [targetId]: 'saving' }));

    /* 1. 역할 변경 — RPC */
    if (roleChanged) {
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
    }

    /* 2. 파트 저장 — profiles 직접 업데이트 */
    if (newRole === '납품협력사') {
      const { error: partsErr } = await supabase
        .from('profiles')
        .update({ parts: newParts.length > 0 ? newParts : null })
        .eq('id', targetId);

      if (partsErr) {
        setStateMap(m => ({ ...m, [targetId]: 'error' }));
        setError(`파트 저장 실패: ${partsErr.message}`);
        setTimeout(() => setStateMap(m => ({ ...m, [targetId]: 'idle' })), 2000);
        return;
      }

      /* 3. companies.parts 도 동기화 */
      if (user.company_id) {
        await supabase
          .from('companies')
          .update({ parts: newParts.length > 0 ? newParts : null })
          .eq('id', user.company_id);
      }
    }

    setStateMap(m => ({ ...m, [targetId]: 'done' }));
    setUsers(prev => prev.map(u =>
      u.id === targetId
        ? { ...u, role: newRole, parts: newRole === '납품협력사' ? newParts : null }
        : u
    ));
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
          전체 사용자의 역할 및 납품협력사 담당 파트를 관리합니다.
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

      {/* 파트 목록 안내 */}
      <div className="mb-4 px-4 py-3 bg-purple-50 border border-purple-200 rounded-xl text-sm text-purple-800 flex items-start gap-2">
        <span>🔧</span>
        <div>
          <strong>납품협력사 파트:</strong>{' '}
          {PARTS_LIST.map((p, i) => (
            <span key={p}>
              <span className="font-medium">{p}</span>
              {i < PARTS_LIST.length - 1 && <span className="text-purple-400"> · </span>}
            </span>
          ))}
          <p className="text-xs text-purple-600 mt-0.5">역할을 납품협력사로 설정하면 담당 파트를 지정할 수 있습니다.</p>
        </div>
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
              const selected     = roleMap[user.id]  ?? user.role;
              const selectedParts = partsMap[user.id] ?? user.parts ?? [];
              const s            = stateMap[user.id] ?? 'idle';
              const isMe         = user.id === profile.id;

              const roleChanged  = selected !== user.role;
              const partsChanged = selected === '납품협력사' &&
                sortedArr(selectedParts) !== sortedArr(user.parts ?? []);
              const hasChanges   = roleChanged || partsChanged;
              const showParts    = selected === '납품협력사';

              return (
                <Fragment key={user.id}>
                  {/* ── 메인 행 ── */}
                  <tr className="hover:bg-gray-50 transition-colors">
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
                      <div className="flex flex-col gap-1">
                        <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full w-fit ${ROLE_META[user.role].bg} ${ROLE_META[user.role].color}`}>
                          {user.role}
                        </span>
                        {/* 현재 파트 태그 */}
                        {user.role === '납품협력사' && user.parts && user.parts.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {user.parts.map(p => (
                              <span key={p} className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
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
                      {s === 'idle' && hasChanges && (
                        <button
                          onClick={() => saveUser(user.id)}
                          className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                        >
                          저장
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* ── 납품협력사 파트 선택 서브행 ── */}
                  {showParts && (
                    <tr className="bg-purple-50/60 border-t-0">
                      <td colSpan={6} className="px-6 pb-3 pt-1">
                        <p className="text-[10px] font-semibold text-purple-600 uppercase tracking-wider mb-2">
                          담당 파트 선택 (다중 선택 가능)
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                          {PARTS_LIST.map(part => (
                            <label key={part} className="flex items-center gap-1.5 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={selectedParts.includes(part)}
                                onChange={() => togglePart(user.id, part)}
                                disabled={s === 'saving'}
                                className="w-3.5 h-3.5 rounded border-purple-300 text-purple-600 focus:ring-purple-400"
                              />
                              <span className={`text-xs font-medium transition-colors ${
                                selectedParts.includes(part) ? 'text-purple-800' : 'text-gray-500 group-hover:text-purple-700'
                              }`}>
                                {part}
                              </span>
                            </label>
                          ))}
                        </div>
                        {selectedParts.length === 0 && (
                          <p className="text-[10px] text-orange-500 mt-1.5">⚠️ 파트를 선택하지 않으면 해당 사용자는 어떤 입찰도 볼 수 없습니다.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
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
        총 {users.length}명 · 역할 또는 파트 변경 후 <strong>저장</strong> 버튼을 클릭해야 반영됩니다.
      </p>
    </div>
  );
}

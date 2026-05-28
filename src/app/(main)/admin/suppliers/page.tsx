'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import type { Profile } from '@/lib/types';
import { PARTS_LIST } from '@/lib/constants';

type SupplierRow = {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  company_id: number | null;
  parts: string[] | null;
  created_at: string;
};

type SaveState = 'idle' | 'saving' | 'done' | 'error';

const sortedArr = (a: string[]) => [...a].sort().join(',');

export default function AdminSuppliersPage() {
  const router = useRouter();
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading]   = useState(true);
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

  /* ── 납품협력사 목록 조회 ── */
  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, name, email, username, company_id, parts, created_at')
      .eq('role', '납품협력사')
      .order('created_at');

    if (err) {
      setError(`데이터 조회 실패: ${err.message}`);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as SupplierRow[];
    setSuppliers(rows);
    setPartsMap(Object.fromEntries(rows.map(u => [u.id, u.parts ?? []])));
    setLoading(false);
  }, []);

  useEffect(() => { if (profile) fetchSuppliers(); }, [profile, fetchSuppliers]);

  /* ── 파트 토글 ── */
  const togglePart = (userId: string, part: string) => {
    setPartsMap(m => {
      const cur  = m[userId] ?? [];
      const next = cur.includes(part) ? cur.filter(p => p !== part) : [...cur, part];
      return { ...m, [userId]: next };
    });
    setStateMap(m => ({ ...m, [userId]: 'idle' }));
    setError('');
  };

  /* ── 저장 ── */
  const saveSupplier = async (targetId: string) => {
    if (!profile) return;
    const supplier  = suppliers.find(u => u.id === targetId)!;
    const newParts  = partsMap[targetId] ?? supplier.parts ?? [];

    if (sortedArr(newParts) === sortedArr(supplier.parts ?? [])) return;

    setStateMap(m => ({ ...m, [targetId]: 'saving' }));

    /* profiles.parts 업데이트 */
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

    /* companies.parts 동기화 */
    if (supplier.company_id) {
      await supabase
        .from('companies')
        .update({ parts: newParts.length > 0 ? newParts : null })
        .eq('id', supplier.company_id);
    }

    setStateMap(m => ({ ...m, [targetId]: 'done' }));
    setSuppliers(prev => prev.map(u =>
      u.id === targetId ? { ...u, parts: newParts.length > 0 ? newParts : null } : u
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
    <div className="max-w-4xl">
      {/* 헤더 */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">납품협력사 관리</h2>
        <p className="text-sm text-gray-500 mt-1">
          납품협력사별 담당 파트를 지정합니다. 파트에 따라 입찰 가능한 구매 요청이 필터링됩니다.
        </p>
      </div>

      {/* 파트 안내 */}
      <div className="mb-5 px-4 py-3 bg-purple-50 border border-purple-200 rounded-xl text-sm text-purple-800 flex items-start gap-2">
        <span>🔧</span>
        <div>
          <strong>담당 파트:</strong>{' '}
          {PARTS_LIST.map((p, i) => (
            <span key={p}>
              <span className="font-medium">{p}</span>
              {i < PARTS_LIST.length - 1 && <span className="text-purple-400"> · </span>}
            </span>
          ))}
          <p className="text-xs text-purple-600 mt-0.5">파트를 선택하지 않으면 해당 업체는 어떤 입찰도 볼 수 없습니다.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <span>⚠️</span>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="underline text-xs shrink-0">닫기</button>
        </div>
      )}

      {/* 납품협력사 카드 목록 */}
      {suppliers.length === 0 ? (
        <div className="card text-center py-12 text-sm text-gray-400">
          납품협력사 역할의 사용자가 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map(supplier => {
            const selectedParts = partsMap[supplier.id] ?? supplier.parts ?? [];
            const s             = stateMap[supplier.id] ?? 'idle';
            const hasChanges    = sortedArr(selectedParts) !== sortedArr(supplier.parts ?? []);

            return (
              <div key={supplier.id} className="card p-5">
                {/* 업체 정보 헤더 */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{supplier.name}</span>
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                        납품협력사
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {supplier.username && (
                        <span className="text-xs text-gray-500 font-mono">@{supplier.username}</span>
                      )}
                      {supplier.email && (
                        <span className="text-xs text-gray-400">{supplier.email}</span>
                      )}
                    </div>
                  </div>

                  {/* 저장 버튼 영역 */}
                  <div className="flex items-center gap-2 shrink-0">
                    {s === 'saving' && <span className="text-xs text-gray-400 animate-pulse">저장 중...</span>}
                    {s === 'done'   && <span className="text-xs text-green-600 font-medium">✓ 저장됨</span>}
                    {s === 'error'  && <span className="text-xs text-red-500 font-medium">✗ 저장 실패</span>}
                    {s === 'idle' && hasChanges && (
                      <button
                        onClick={() => saveSupplier(supplier.id)}
                        className="text-sm bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg transition-colors font-medium"
                      >
                        저장
                      </button>
                    )}
                  </div>
                </div>

                {/* 파트 체크박스 */}
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                    담당 파트 선택 (다중 선택 가능)
                  </p>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {PARTS_LIST.map(part => {
                      const checked = selectedParts.includes(part);
                      return (
                        <label key={part} className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePart(supplier.id, part)}
                            disabled={s === 'saving'}
                            className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-400"
                          />
                          <span className={`text-sm font-medium transition-colors ${
                            checked ? 'text-purple-800' : 'text-gray-500 group-hover:text-purple-700'
                          }`}>
                            {part}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {selectedParts.length === 0 && (
                    <p className="text-xs text-orange-500 mt-2 flex items-center gap-1">
                      <span>⚠️</span>
                      <span>파트 미선택 — 이 업체는 어떤 입찰도 볼 수 없습니다.</span>
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400">
        총 {suppliers.length}개 업체 · 파트 변경 후 <strong>저장</strong> 버튼을 클릭해야 반영됩니다.
      </p>
    </div>
  );
}

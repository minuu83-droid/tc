'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import Modal from '@/components/Modal';
import { Profile } from '@/lib/types';

type PartnerProfile = Pick<Profile,
  'id' | 'name' | 'username' | 'role' | 'email' | 'parts' |
  'contact_name' | 'phone' | 'address' | 'memo'
>;

type Tab = '전체' | '사용협력사' | '납품협력사';

const ROLE_BADGE: Record<string, string> = {
  '납품협력사': 'bg-blue-100 text-blue-700',
  '사용협력사': 'bg-green-100 text-green-700',
};

const emptyForm = { contact_name: '', phone: '', address: '', email: '', memo: '' };

export default function PartnersPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [partners, setPartners] = useState<PartnerProfile[]>([]);
  const [tab, setTab] = useState<Tab>('전체');
  const [editTarget, setEditTarget] = useState<PartnerProfile | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    setProfile(session);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, name, username, role, email, parts, contact_name, phone, address, memo')
      .in('role', ['납품협력사', '사용협력사'])
      .order('role')
      .order('name');
    setPartners((data ?? []) as PartnerProfile[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (p: PartnerProfile) => {
    setEditTarget(p);
    setForm({
      contact_name: p.contact_name ?? '',
      phone: p.phone ?? '',
      address: p.address ?? '',
      email: p.email ?? '',
      memo: p.memo ?? '',
    });
    setError('');
  };

  const closeEdit = () => { setEditTarget(null); setError(''); };

  const save = async () => {
    if (!editTarget) return;
    setSaving(true); setError('');
    const { error: err } = await supabase
      .from('profiles')
      .update({
        contact_name: form.contact_name || null,
        phone: form.phone || null,
        address: form.address || null,
        email: form.email || null,
        memo: form.memo || null,
      })
      .eq('id', editTarget.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    closeEdit();
    load();
  };

  const set = (k: keyof typeof emptyForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  /* 권한: 마스터관리자/직영관리자/직영 수정 가능 */
  const canEdit = ['마스터관리자', '직영관리자', '직영'].includes(profile?.role ?? '');
  const isNapumTab = tab === '납품협력사';

  const filtered = tab === '전체' ? partners : partners.filter(p => p.role === tab);
  const countOf = (r: string) => partners.filter(p => p.role === r).length;

  if (!profile) return null;

  /* 납품협력사/사용협력사는 접근 불가 */
  if (profile.role === '납품협력사' || profile.role === '사용협력사') {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-gray-400">접근 권한이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 탭 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['전체', '사용협력사', '납품협력사'] as Tab[]).map(t => {
            const count = t === '전체' ? partners.length : countOf(t);
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  tab === t
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {t} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* 테이블 */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 animate-pulse">로딩 중...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="table-th">업체명</th>
                <th className="table-th">아이디</th>
                <th className="table-th">역할</th>
                <th className="table-th">담당자</th>
                <th className="table-th">연락처</th>
                <th className="table-th">이메일</th>
                <th className="table-th">주소</th>
                {isNapumTab && <th className="table-th">담당 파트</th>}
                <th className="table-th">비고</th>
                {canEdit && <th className="table-th text-center">관리</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? (isNapumTab ? 10 : 9) : (isNapumTab ? 9 : 8)}
                    className="table-td text-center text-gray-400 py-8">
                    등록된 협력사가 없습니다.
                  </td>
                </tr>
              )}
              {filtered.map(p => (
                <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="table-td font-semibold text-gray-900">{p.name}</td>
                  <td className="table-td text-gray-500 font-mono text-xs">{p.username}</td>
                  <td className="table-td">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE[p.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {p.role}
                    </span>
                  </td>
                  <td className="table-td">{p.contact_name ?? <span className="text-gray-300">-</span>}</td>
                  <td className="table-td">{p.phone ?? <span className="text-gray-300">-</span>}</td>
                  <td className="table-td text-xs">{p.email ?? <span className="text-gray-300">-</span>}</td>
                  <td className="table-td text-xs text-gray-500">{p.address ?? <span className="text-gray-300">-</span>}</td>
                  {isNapumTab && (
                    <td className="table-td">
                      {p.parts && p.parts.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {p.parts.map(pt => (
                            <span key={pt} className="text-[10px] bg-purple-100 text-purple-700 font-medium px-1.5 py-0.5 rounded-full">
                              {pt}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">-</span>
                      )}
                    </td>
                  )}
                  <td className="table-td text-xs text-gray-500">{p.memo ?? <span className="text-gray-300">-</span>}</td>
                  {canEdit && (
                    <td className="table-td text-center">
                      <button
                        onClick={() => openEdit(p)}
                        className="text-xs text-blue-600 hover:underline font-medium"
                      >
                        수정
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 수정 모달 */}
      <Modal
        isOpen={!!editTarget}
        onClose={closeEdit}
        title={`협력사 정보 수정 — ${editTarget?.name ?? ''}`}
        size="sm"
      >
        {editTarget && (
          <div className="space-y-4">
            {/* 읽기 전용 정보 */}
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm flex gap-6">
              <div>
                <span className="text-gray-400 text-xs">업체명</span>
                <p className="font-semibold text-gray-900">{editTarget.name}</p>
              </div>
              <div>
                <span className="text-gray-400 text-xs">아이디</span>
                <p className="font-mono text-gray-700">{editTarget.username}</p>
              </div>
              <div>
                <span className="text-gray-400 text-xs">역할</span>
                <p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE[editTarget.role] ?? ''}`}>
                    {editTarget.role}
                  </span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">담당자명</label>
                <input className="input" value={form.contact_name}
                  onChange={e => set('contact_name', e.target.value)} placeholder="홍길동" />
              </div>
              <div>
                <label className="label">연락처</label>
                <input className="input" value={form.phone}
                  onChange={e => set('phone', e.target.value)} placeholder="010-0000-0000" />
              </div>
              <div className="col-span-2">
                <label className="label">이메일</label>
                <input className="input" type="email" value={form.email}
                  onChange={e => set('email', e.target.value)} placeholder="example@company.com" />
              </div>
              <div className="col-span-2">
                <label className="label">주소</label>
                <input className="input" value={form.address}
                  onChange={e => set('address', e.target.value)} placeholder="주소 입력" />
              </div>
              <div className="col-span-2">
                <label className="label">비고</label>
                <textarea className="input resize-none h-16" value={form.memo}
                  onChange={e => set('memo', e.target.value)} placeholder="메모 입력" />
              </div>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={closeEdit} disabled={saving}>취소</button>
              <button className="btn-primary flex-1" onClick={save} disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

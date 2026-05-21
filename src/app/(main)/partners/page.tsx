'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import Modal from '@/components/Modal';
import StatusBadge from '@/components/StatusBadge';
import { Company, Profile } from '@/lib/types';

const emptyForm = { name: '', type: '사용협력사', business_no: '', contact_name: '', phone: '', email: '', address: '' };

export default function PartnersPage() {
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [tab, setTab]           = useState<'사용협력사' | '납품협력사'>('사용협력사');
  const [modal, setModal]       = useState(false);
  const [editTarget, setEditTarget] = useState<Company | null>(null);
  const [form, setForm]         = useState(emptyForm);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    setProfile(session);
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase.from('companies').select('*').order('name');
    setCompanies((data ?? []) as Company[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ ...emptyForm, type: tab });
    setError('');
    setModal(true);
  };

  const openEdit = (c: Company) => {
    setEditTarget(c);
    setForm({
      name: c.name, type: c.type, business_no: c.business_no ?? '',
      contact_name: c.contact_name ?? '', phone: c.phone ?? '',
      email: c.email ?? '', address: c.address ?? '',
    });
    setError('');
    setModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) { setError('회사명을 입력하세요.'); return; }
    setLoading(true); setError('');
    let err;
    if (editTarget) {
      ({ error: err } = await supabase.from('companies').update({
        name: form.name,
        business_no: form.business_no || null,
        contact_name: form.contact_name || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
      }).eq('id', editTarget.id));
    } else {
      ({ error: err } = await supabase.from('companies').insert({
        name: form.name,
        type: form.type,
        business_no: form.business_no || null,
        contact_name: form.contact_name || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
      }));
    }
    setLoading(false);
    if (err) { setError(err.message); return; }
    setModal(false); load();
  };

  const toggleStatus = async (c: Company) => {
    await supabase.from('companies').update({ status: c.status === 'active' ? 'inactive' : 'active' }).eq('id', c.id);
    load();
  };

  const filtered = companies.filter(c => c.type === tab);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const canManage = profile?.role === '직영';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['사용협력사', '납품협력사'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}>
              {t} ({companies.filter(c => c.type === t).length})
            </button>
          ))}
        </div>
        {canManage && (
          <button className="btn-primary" onClick={openCreate}>+ 협력사 등록</button>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="table-th">회사명</th>
              <th className="table-th">사업자번호</th>
              <th className="table-th">담당자</th>
              <th className="table-th">연락처</th>
              <th className="table-th">이메일</th>
              <th className="table-th">상태</th>
              {canManage && <th className="table-th">관리</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={canManage ? 7 : 6} className="table-td text-center text-gray-400 py-8">등록된 협력사가 없습니다.</td></tr>
            )}
            {filtered.map(c => (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="table-td font-medium">{c.name}</td>
                <td className="table-td text-gray-500">{c.business_no ?? '-'}</td>
                <td className="table-td">{c.contact_name ?? '-'}</td>
                <td className="table-td">{c.phone ?? '-'}</td>
                <td className="table-td text-sm">{c.email ?? '-'}</td>
                <td className="table-td">
                  <StatusBadge status={c.status === 'active' ? 'active_co' : 'inactive'} />
                </td>
                {canManage && (
                  <td className="table-td">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(c)} className="text-sm text-blue-600 hover:underline">수정</button>
                      <button onClick={() => toggleStatus(c)}
                        className={`text-sm ${c.status === 'active' ? 'text-gray-400 hover:text-red-500' : 'text-gray-400 hover:text-green-600'}`}>
                        {c.status === 'active' ? '비활성' : '활성화'}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editTarget ? '협력사 수정' : '협력사 등록'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">회사명 *</label>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="회사명" />
            </div>
            {!editTarget && (
              <div className="col-span-2">
                <label className="label">구분 *</label>
                <select className="input" value={form.type} onChange={e => set('type', e.target.value)}>
                  <option>사용협력사</option>
                  <option>납품협력사</option>
                </select>
              </div>
            )}
            <div>
              <label className="label">사업자번호</label>
              <input className="input" value={form.business_no} onChange={e => set('business_no', e.target.value)} placeholder="000-00-00000" />
            </div>
            <div>
              <label className="label">담당자명</label>
              <input className="input" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
            </div>
            <div>
              <label className="label">전화번호</label>
              <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="02-0000-0000" />
            </div>
            <div>
              <label className="label">이메일</label>
              <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">주소</label>
              <input className="input" value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => setModal(false)}>취소</button>
            <button className="btn-primary flex-1" onClick={save} disabled={loading}>
              {loading ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/Modal';
import { Item, Profile } from '@/lib/types';

const emptyForm = { code: '', name: '', category: '', maker: '', spec: '', unit: 'EA' };

export default function ItemsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems]     = useState<Item[]>([]);
  const [modal, setModal]     = useState(false);
  const [editTarget, setEditTarget] = useState<Item | null>(null);
  const [form, setForm]       = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: prof } = await supabase.from('profiles').select('*, company:companies(name)').eq('id', user.id).single();
      setProfile(prof as Profile);
    });
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('items')
      .select('*, creator:profiles!created_by(name)')
      .order('code');
    setItems((data ?? []) as Item[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditTarget(null); setForm(emptyForm); setError(''); setModal(true);
  };

  const openEdit = (item: Item) => {
    setEditTarget(item);
    setForm({
      code: item.code, name: item.name, category: item.category ?? '',
      maker: item.maker ?? '', spec: item.spec ?? '', unit: item.unit,
    });
    setError(''); setModal(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) { setError('품목코드와 품목명은 필수입니다.'); return; }
    setLoading(true); setError('');
    let err;
    if (editTarget) {
      ({ error: err } = await supabase.from('items').update({
        name: form.name,
        category: form.category || null,
        maker: form.maker || null,
        spec: form.spec || null,
        unit: form.unit,
      }).eq('id', editTarget.id));
    } else {
      ({ error: err } = await supabase.from('items').insert({
        code: form.code,
        name: form.name,
        category: form.category || null,
        maker: form.maker || null,
        spec: form.spec || null,
        unit: form.unit,
        created_by: profile?.id ?? null,
      }));
    }
    setLoading(false);
    if (err) { setError(err.message); return; }
    setModal(false); load();
  };

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const filtered = items.filter(i =>
    !search || i.name.includes(search) || i.code.includes(search) || (i.maker ?? '').includes(search)
  );
  const categories = [...new Set(items.map(i => i.category).filter(Boolean))];

  const canManage = profile?.role === '직영';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <input className="input max-w-xs" placeholder="품목명, 코드, 메이커 검색..."
          value={search} onChange={e => setSearch(e.target.value)} />
        {canManage && (
          <button className="btn-primary" onClick={openCreate}>+ 품목 등록</button>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="table-th">품목코드</th>
              <th className="table-th">품목명</th>
              <th className="table-th">카테고리</th>
              <th className="table-th">메이커</th>
              <th className="table-th">규격</th>
              <th className="table-th">단위</th>
              <th className="table-th">계약</th>
              <th className="table-th">등록자</th>
              {canManage && <th className="table-th">관리</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={canManage ? 9 : 8} className="table-td text-center text-gray-400 py-8">등록된 품목이 없습니다.</td></tr>
            )}
            {filtered.map(item => (
              <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="table-td font-mono text-xs text-gray-600">{item.code}</td>
                <td className="table-td font-medium">{item.name}</td>
                <td className="table-td text-gray-500">{item.category ?? '-'}</td>
                <td className="table-td">{item.maker ?? '-'}</td>
                <td className="table-td text-gray-500">{item.spec ?? '-'}</td>
                <td className="table-td">{item.unit}</td>
                <td className="table-td">
                  {item.has_contract ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                      ⭐ 계약중
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">-</span>
                  )}
                </td>
                <td className="table-td text-gray-500 text-sm">
                  {(item.creator as { name: string } | null)?.name ?? '-'}
                </td>
                {canManage && (
                  <td className="table-td">
                    <button onClick={() => openEdit(item)} className="text-sm text-blue-600 hover:underline">수정</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editTarget ? '품목 수정' : '품목 등록'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">품목코드 *</label>
              <input className="input" value={form.code}
                onChange={e => set('code', e.target.value)}
                placeholder="예: ITM-009"
                disabled={!!editTarget} />
            </div>
            <div>
              <label className="label">카테고리</label>
              <input className="input" list="categories" value={form.category}
                onChange={e => set('category', e.target.value)} placeholder="카테고리" />
              <datalist id="categories">
                {categories.map(c => <option key={c as string} value={c as string} />)}
              </datalist>
            </div>
            <div className="col-span-2">
              <label className="label">품목명 *</label>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="품목명" />
            </div>
            <div>
              <label className="label">메이커</label>
              <input className="input" value={form.maker} onChange={e => set('maker', e.target.value)} placeholder="제조사" />
            </div>
            <div>
              <label className="label">단위</label>
              <select className="input" value={form.unit} onChange={e => set('unit', e.target.value)}>
                {['EA', 'SET', 'Box', 'kg', 'L', 'm', 'pair', 'Roll'].map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">규격/사양</label>
              <input className="input" value={form.spec} onChange={e => set('spec', e.target.value)} placeholder="규격 및 상세 사양" />
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

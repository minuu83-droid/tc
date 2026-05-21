'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Item, Profile } from '@/lib/types';

export default function NewRequestPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems]     = useState<Item[]>([]);
  const [form, setForm]       = useState({
    item_id: '', item_name: '', maker: '', spec: '',
    quantity: '', unit: 'EA', required_date: '', notes: '',
  });
  const [autoOrder, setAutoOrder] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: prof } = await supabase.from('profiles').select('*, company:companies(name)').eq('id', user.id).single();
      setProfile(prof as Profile);
    });
    supabase.from('items').select('*').order('code').then(({ data }) => setItems((data ?? []) as Item[]));
  }, []);

  const handleItemSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!id) { setForm(f => ({...f, item_id:'', item_name:'', maker:'', spec:'', unit:'EA'})); setAutoOrder(false); return; }
    const item = items.find(i => String(i.id) === id);
    if (item) {
      setForm(f => ({...f, item_id:id, item_name:item.name, maker:item.maker??'', spec:item.spec??'', unit:item.unit}));
      setAutoOrder(item.has_contract);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setLoading(true); setError('');
    try {
      if (form.item_id) {
        const { data } = await supabase.rpc('create_auto_order', {
          p_item_id: Number(form.item_id),
          p_item_name: form.item_name,
          p_quantity: Number(form.quantity),
          p_required_date: form.required_date || null,
          p_notes: form.notes || null,
        });
        if (data) { alert(data.message ?? '자동 발주 처리되었습니다.'); router.push('/orders'); return; }
      }
      // 일반 구매 요청
      const { error: err } = await supabase.from('purchase_requests').insert({
        item_id: form.item_id ? Number(form.item_id) : null,
        item_name: form.item_name,
        maker: form.maker || null,
        spec: form.spec || null,
        quantity: Number(form.quantity),
        unit: form.unit,
        required_date: form.required_date || null,
        requester_id: profile.id,
        company_id: profile.company_id,
        status: 'bidding',
        notes: form.notes || null,
      });
      if (err) { setError(err.message); return; }
      router.push('/requests');
    } finally {
      setLoading(false);
    }
  };

  const set = (k: string, v: string) => setForm(f => ({...f, [k]:v}));

  return (
    <div className="max-w-2xl">
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">구매 요청 등록</h2>
        {autoOrder && (
          <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800">
            ✅ 이 품목은 유효한 계약이 있습니다. 등록 시 <strong>자동 발주</strong>로 처리됩니다.
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">등록 품목에서 선택 (선택사항)</label>
            <select className="input" value={form.item_id} onChange={handleItemSelect}>
              <option value="">직접 입력</option>
              {items.map(i => (
                <option key={i.id} value={i.id}>[{i.code}] {i.name}{i.has_contract ? ' ⭐계약중' : ''}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">품목명 *</label>
              <input className="input" value={form.item_name} onChange={e => set('item_name', e.target.value)} required placeholder="품목명 입력" />
            </div>
            <div>
              <label className="label">메이커</label>
              <input className="input" value={form.maker} onChange={e => set('maker', e.target.value)} placeholder="제조사" />
            </div>
            <div>
              <label className="label">규격/사양</label>
              <input className="input" value={form.spec} onChange={e => set('spec', e.target.value)} placeholder="규격" />
            </div>
            <div>
              <label className="label">수량 *</label>
              <input className="input" type="number" min="1" value={form.quantity} onChange={e => set('quantity', e.target.value)} required />
            </div>
            <div>
              <label className="label">단위</label>
              <select className="input" value={form.unit} onChange={e => set('unit', e.target.value)}>
                {['EA','SET','Box','kg','L','m','pair','Roll'].map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="label">필요일자</label>
              <input className="input" type="date" value={form.required_date} onChange={e => set('required_date', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">비고</label>
            <textarea className="input resize-none h-20" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => router.back()}>취소</button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? '처리 중...' : autoOrder ? '자동 발주 처리' : '구매 요청 등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

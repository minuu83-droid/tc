'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { Item, Profile } from '@/lib/types';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGES = 3;

export default function NewRequestPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems]     = useState<Item[]>([]);
  const [form, setForm]       = useState({
    item_id: '', item_name: '', maker: '', spec: '',
    quantity: '', unit: 'EA', required_date: '', notes: '',
  });
  const [autoOrder, setAutoOrder] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [imageFiles, setImageFiles]     = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  useEffect(() => {
    const session = getSession();
    if (session) setProfile(session);
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

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const valid = files.filter(f => ALLOWED_TYPES.includes(f.type));
    if (valid.length !== files.length) {
      setError('JPG, PNG, GIF, WEBP 형식의 이미지만 첨부할 수 있습니다.');
      e.target.value = '';
      return;
    }
    const next = [...imageFiles, ...valid].slice(0, MAX_IMAGES);
    setImageFiles(next);
    setImagePreviews(next.map(f => URL.createObjectURL(f)));
    e.target.value = '';
    setError('');
  };

  const removeImage = (idx: number) => {
    const next = imageFiles.filter((_, i) => i !== idx);
    setImageFiles(next);
    setImagePreviews(prev => {
      URL.revokeObjectURL(prev[idx]);
      return next.map(f => URL.createObjectURL(f));
    });
  };

  const uploadImages = async (): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of imageFiles) {
      const ext = file.name.split('.').pop();
      const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('procurement-images')
        .upload(path, file, { contentType: file.type });
      if (upErr) throw new Error(`이미지 업로드 실패: ${upErr.message}`);
      const { data } = supabase.storage.from('procurement-images').getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setLoading(true); setError('');
    try {
      const image_urls = imageFiles.length > 0 ? await uploadImages() : null;

      if (form.item_id) {
        const { data } = await supabase.rpc('create_auto_order', {
          p_item_id: Number(form.item_id),
          p_item_name: form.item_name,
          p_quantity: Number(form.quantity),
          p_requester_id: profile!.id,
          p_required_date: form.required_date || null,
          p_notes: form.notes || null,
        });
        if (data) { alert(data.message ?? '자동 발주 처리되었습니다.'); router.push('/orders'); return; }
      }
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
        image_urls,
      });
      if (err) { setError(err.message); return; }
      router.push('/requests');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
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

          {/* 이미지 첨부 */}
          <div>
            <label className="label">사진 첨부 (최대 3장 · JPG, PNG, GIF, WEBP)</label>
            <div className="flex flex-wrap gap-3 mt-1">
              {imagePreviews.map((src, idx) => (
                <div key={idx} className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`첨부 이미지 ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center leading-none hover:bg-red-600"
                    aria-label="이미지 삭제"
                  >
                    ×
                  </button>
                </div>
              ))}
              {imageFiles.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-400 transition-colors"
                >
                  <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-xs">사진 추가</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.gif,.webp,image/jpeg,image/png,image/gif,image/webp"
              multiple
              className="hidden"
              onChange={handleImageChange}
            />
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

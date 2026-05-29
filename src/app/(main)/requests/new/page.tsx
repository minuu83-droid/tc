'use client';

import { useState, useEffect, useRef, DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { Item, Profile } from '@/lib/types';
import { PARTS_LIST } from '@/lib/constants';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGES    = 3;

export default function NewRequestPage() {
  const router = useRouter();
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems]     = useState<Item[]>([]);
  const [form, setForm]       = useState({
    item_id: '', item_name: '', maker: '', spec: '',
    quantity: '', unit: 'EA', required_date: '', notes: '',
  });
  const [requiredParts, setRequiredParts] = useState<string[]>([]);
  const [autoOrder, setAutoOrder] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [imageFiles, setImageFiles]       = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging]       = useState(false);

  const togglePart = (part: string) =>
    setRequiredParts(prev => prev.includes(part) ? prev.filter(p => p !== part) : [...prev, part]);

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

  /* ── 파일 추가 공통 로직 ── */
  const addFiles = (files: File[]) => {
    const valid = files.filter(f => ALLOWED_TYPES.includes(f.type));
    if (valid.length !== files.length) {
      setError('JPG, PNG, GIF, WEBP 형식의 이미지만 첨부할 수 있습니다.');
      if (valid.length === 0) return;
    } else {
      setError('');
    }
    setImageFiles(prev => {
      const next = [...prev, ...valid].slice(0, MAX_IMAGES);
      setImagePreviews(next.map(f => URL.createObjectURL(f)));
      return next;
    });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    addFiles(files);
    e.target.value = '';
  };

  /* ── 드래그 앤 드롭 이벤트 ── */
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (imageFiles.length < MAX_IMAGES) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    if (imageFiles.length >= MAX_IMAGES) return;
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  };

  /* ── 모바일 터치: 드롭존 탭 시 파일 선택 ── */
  const handleDropZoneClick = () => {
    if (imageFiles.length < MAX_IMAGES) fileInputRef.current?.click();
  };

  const removeImage = (idx: number) => {
    setImageFiles(prev => {
      const next = prev.filter((_, i) => i !== idx);
      setImagePreviews(prev2 => {
        URL.revokeObjectURL(prev2[idx]);
        return next.map(f => URL.createObjectURL(f));
      });
      return next;
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
        notes:          form.notes || null,
        image_urls,
        required_parts: requiredParts.length > 0 ? requiredParts : null,
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

  const isFull = imageFiles.length >= MAX_IMAGES;

  return (
    <div className="max-w-2xl">
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">신규 구매품 등록</h2>
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

          {/* ── 대상 파트 선택 ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">대상 파트 (납품협력사 지정)</label>
              {requiredParts.length > 0 && (
                <span className="text-xs text-purple-600 font-medium">{requiredParts.length}개 선택됨</span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 p-3 bg-purple-50 rounded-xl border border-purple-100">
              {PARTS_LIST.map(part => (
                <label key={part} className="flex items-center gap-1.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={requiredParts.includes(part)}
                    onChange={() => togglePart(part)}
                    className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-400"
                  />
                  <span className={`text-sm font-medium transition-colors ${
                    requiredParts.includes(part) ? 'text-purple-800' : 'text-gray-500 group-hover:text-purple-700'
                  }`}>
                    {part}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              선택하지 않으면 모든 납품협력사에게 공개됩니다. 선택 시 해당 파트 납품협력사만 입찰할 수 있습니다.
            </p>
          </div>

          {/* ── 사진 첨부 (드래그 앤 드롭 + 모바일 카메라) ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">사진 첨부</label>
              <span className="text-xs text-gray-400">
                JPG · PNG · GIF · WEBP · 최대 {MAX_IMAGES}장
              </span>
            </div>

            {/* 모바일: 갤러리 / 카메라 버튼 */}
            <div className="lg:hidden flex gap-3 mb-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isFull}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 active:bg-gray-100 disabled:opacity-40 transition-colors"
              >
                <span>🖼️</span>
                <span>갤러리 선택</span>
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isFull}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-600 active:bg-blue-100 disabled:opacity-40 transition-colors"
              >
                <span>📷</span>
                <span>카메라 촬영</span>
              </button>
            </div>

            {/* 데스크탑: 드롭 존 */}
            <div className="hidden lg:block">
            <div
              ref={dropZoneRef}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={handleDropZoneClick}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && handleDropZoneClick()}
              aria-label="사진 첨부 영역. 클릭하거나 드래그하여 이미지를 추가하세요"
              className={[
                'relative mt-1 rounded-xl border-2 border-dashed transition-all duration-200 select-none',
                isFull
                  ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                  : isDragging
                    ? 'border-blue-400 bg-blue-50 scale-[1.01] shadow-md cursor-copy'
                    : 'border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer',
              ].join(' ')}
            >
              {/* 드래그 중 오버레이 */}
              {isDragging && (
                <div className="absolute inset-0 rounded-xl bg-blue-400/10 flex items-center justify-center z-10 pointer-events-none">
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-10 h-10 text-blue-500 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                    <span className="text-blue-600 font-semibold text-sm">여기에 놓으세요!</span>
                  </div>
                </div>
              )}

              <div className="p-6 flex flex-col items-center gap-2">
                {/* 아이콘 */}
                <div className={[
                  'w-14 h-14 rounded-full flex items-center justify-center transition-colors',
                  isDragging ? 'bg-blue-100' : 'bg-gray-100',
                ].join(' ')}>
                  <svg className={['w-7 h-7 transition-colors', isDragging ? 'text-blue-500' : 'text-gray-400'].join(' ')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>

                {isFull ? (
                  <p className="text-sm text-gray-400 text-center">최대 {MAX_IMAGES}장 첨부 완료</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-600 text-center">
                      사진을 드래그하거나{' '}
                      <span className="text-blue-500 underline underline-offset-2">클릭하여 선택</span>
                    </p>
                    <p className="text-xs text-gray-400 text-center">
                      JPG, PNG, GIF, WEBP · {imageFiles.length}/{MAX_IMAGES}장 첨부됨
                    </p>
                  </>
                )}
              </div>
            </div>
            </div>{/* end hidden lg:block */}

            {/* 썸네일 미리보기 (모바일/데스크탑 공통) */}
            {imagePreviews.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-3">
                {imagePreviews.map((src, idx) => (
                  <div
                    key={idx}
                    className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 shadow-sm group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`첨부 이미지 ${idx + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); removeImage(idx); }}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full text-sm flex items-center justify-center leading-none shadow transition-colors"
                      aria-label={`이미지 ${idx + 1} 삭제`}
                    >
                      ×
                    </button>
                    <span className="absolute bottom-1 left-1 w-5 h-5 bg-black/50 text-white text-xs rounded-full flex items-center justify-center">
                      {idx + 1}
                    </span>
                  </div>
                ))}
                {!isFull && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-400 transition-colors"
                    aria-label="사진 추가"
                  >
                    <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-xs">사진 추가</span>
                  </button>
                )}
              </div>
            )}

            {/* 숨김 파일 인풋 */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.gif,.webp,image/jpeg,image/png,image/gif,image/webp"
              multiple
              className="hidden"
              onChange={handleImageChange}
            />
            {/* 카메라 촬영 인풋 (모바일) */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleImageChange}
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => router.back()}>취소</button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? '처리 중...' : autoOrder ? '자동 발주 처리' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback, useRef, DragEvent } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { PurchaseRequest, Bid, Profile } from '@/lib/types';
import ImageGallery from '@/components/ImageGallery';
import { PARTS_LIST } from '@/lib/constants';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGES = 3;

export default function RequestsPage() {
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [bidCounts, setBidCounts] = useState<Record<number, number>>({});
  const [filter, setFilter]     = useState('all');
  const [detail, setDetail]     = useState<PurchaseRequest | null>(null);
  const [bids, setBids]         = useState<Bid[]>([]);
  const [bidModal, setBidModal] = useState(false);
  const [awardModal, setAwardModal] = useState<Bid | null>(null);
  const [bidForm, setBidForm]   = useState({ unit_price: '', delivery_days: '', notes: '' });
  const [awardForm, setAwardForm] = useState({ start_date: '', end_date: '', prev_unit_price: '' });
  const [quickSelect, setQuickSelect] = useState<'once' | '6m' | '1y' | null>(null);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');

  /* ── 수정 모드 상태 ── */
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    item_name: '', maker: '', spec: '', quantity: '', unit: 'EA', required_date: '', notes: '',
  });
  const [editParts, setEditParts] = useState<string[]>([]);
  const [editExistingUrls, setEditExistingUrls] = useState<string[]>([]);
  const [editNewFiles, setEditNewFiles] = useState<File[]>([]);
  const [editNewPreviews, setEditNewPreviews] = useState<string[]>([]);
  const [editSaved, setEditSaved] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  /* ── 재입찰 모달 상태 ── */
  const [rebidSource, setRebidSource] = useState<PurchaseRequest | null>(null);
  const [rebidForm, setRebidForm] = useState({
    item_name: '', maker: '', spec: '', quantity: '', unit: 'EA', required_date: '', notes: '',
  });
  const [rebidParts, setRebidParts] = useState<string[]>([]);
  const [rebidImageUrls, setRebidImageUrls] = useState<string[]>([]);
  const [rebidSaving, setRebidSaving] = useState(false);
  const [rebidErr, setRebidErr] = useState('');

  /* 날짜 → YYYY-MM-DD */
  const toDateStr = (d: Date) => d.toISOString().slice(0, 10);

  /* 빠른 계약 기간 선택 */
  const applyQuickSelect = (type: 'once' | '6m' | '1y') => {
    const start = new Date();
    const end   = new Date();
    if (type === '6m') end.setMonth(end.getMonth() + 6);
    if (type === '1y') end.setFullYear(end.getFullYear() + 1);
    setAwardForm(f => ({ ...f, start_date: toDateStr(start), end_date: toDateStr(end) }));
    setQuickSelect(type);
  };

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    setProfile(session);
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('purchase_requests')
      .select('*, requester:profiles!requester_id(name), company:companies!company_id(name)')
      .order('created_at', { ascending: false });
    const reqList = (data ?? []) as PurchaseRequest[];
    setRequests(reqList);

    if (reqList.length > 0) {
      const { data: bidData } = await supabase
        .from('bids')
        .select('request_id')
        .in('request_id', reqList.map(r => r.id));
      const counts: Record<number, number> = {};
      (bidData ?? []).forEach((b: { request_id: number }) => {
        counts[b.request_id] = (counts[b.request_id] ?? 0) + 1;
      });
      setBidCounts(counts);
    } else {
      setBidCounts({});
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (r: PurchaseRequest) => {
    setDetail(r); setErr(''); setEditMode(false); setEditSaved(false);

    const { data: bidsData } = await supabase
      .from('bids')
      .select('*')
      .eq('request_id', r.id)
      .order('unit_price');
    const rawBids = (bidsData ?? []) as Bid[];

    if (rawBids.length > 0) {
      const companyIds = [...new Set(rawBids.map(b => b.supplier_id))];
      const { data: profileData } = await supabase
        .from('profiles')
        .select('name, parts, company_id')
        .in('company_id', companyIds)
        .eq('role', '납품협력사');

      const profileMap: Record<number, { name: string; parts?: string[] | null }> = {};
      (profileData ?? []).forEach((p: { name: string; parts?: string[] | null; company_id: number }) => {
        profileMap[p.company_id] = { name: p.name, parts: p.parts };
      });

      setBids(rawBids.map(b => ({ ...b, supplier: profileMap[b.supplier_id] ?? null })));
    } else {
      setBids([]);
    }
  };

  const closeDetail = () => {
    setDetail(null); setBids([]);
    setEditMode(false); setEditSaved(false);
    setEditNewFiles([]); setEditNewPreviews([]);
  };

  /* ── 수정 모드 진입 ── */
  const enterEditMode = () => {
    if (!detail) return;
    setEditForm({
      item_name: detail.item_name,
      maker: detail.maker ?? '',
      spec: detail.spec ?? '',
      quantity: String(detail.quantity),
      unit: detail.unit,
      required_date: detail.required_date ?? '',
      notes: detail.notes ?? '',
    });
    setEditParts(detail.required_parts ?? []);
    setEditExistingUrls(detail.image_urls ?? []);
    setEditNewFiles([]);
    setEditNewPreviews([]);
    setEditSaved(false);
    setErr('');
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditNewFiles([]);
    setEditNewPreviews([]);
    setErr('');
  };

  const toggleEditPart = (part: string) =>
    setEditParts(prev => prev.includes(part) ? prev.filter(p => p !== part) : [...prev, part]);

  /* ── 편집 이미지 처리 ── */
  const editTotalImages = editExistingUrls.length + editNewFiles.length;
  const editIsFull = editTotalImages >= MAX_IMAGES;

  const addEditFiles = (files: File[]) => {
    const valid = files.filter(f => ALLOWED_TYPES.includes(f.type));
    if (valid.length === 0) return;
    const available = MAX_IMAGES - editExistingUrls.length - editNewFiles.length;
    if (available <= 0) return;
    const toAdd = valid.slice(0, available);
    setEditNewFiles(prev => {
      const next = [...prev, ...toAdd];
      setEditNewPreviews(next.map(f => URL.createObjectURL(f)));
      return next;
    });
  };

  const removeEditExistingImage = (idx: number) => {
    setEditExistingUrls(prev => prev.filter((_, i) => i !== idx));
  };

  const removeEditNewImage = (idx: number) => {
    setEditNewFiles(prev => {
      const next = prev.filter((_, i) => i !== idx);
      setEditNewPreviews(next.map(f => URL.createObjectURL(f)));
      return next;
    });
  };

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addEditFiles(Array.from(e.target.files ?? []));
    e.target.value = '';
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    if (!editIsFull) setIsDragging(true);
  };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false); dragCounter.current = 0;
    if (editIsFull) return;
    addEditFiles(Array.from(e.dataTransfer.files));
  };

  /* ── 수정 저장 ── */
  const saveEdit = async () => {
    if (!detail || !editForm.item_name || !editForm.quantity) {
      setErr('품목명과 수량은 필수입니다.'); return;
    }
    setSaving(true); setErr('');
    try {
      const newUrls: string[] = [];
      for (const file of editNewFiles) {
        const ext = file.name.split('.').pop();
        const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('procurement-images')
          .upload(path, file, { contentType: file.type });
        if (upErr) throw new Error(`이미지 업로드 실패: ${upErr.message}`);
        const { data } = supabase.storage.from('procurement-images').getPublicUrl(path);
        newUrls.push(data.publicUrl);
      }
      const allUrls = [...editExistingUrls, ...newUrls];

      const { error: updateErr } = await supabase
        .from('purchase_requests')
        .update({
          item_name: editForm.item_name,
          maker: editForm.maker || null,
          spec: editForm.spec || null,
          quantity: Number(editForm.quantity),
          unit: editForm.unit,
          required_date: editForm.required_date || null,
          notes: editForm.notes || null,
          image_urls: allUrls.length > 0 ? allUrls : null,
          required_parts: editParts.length > 0 ? editParts : null,
        })
        .eq('id', detail.id);

      if (updateErr) { setErr(updateErr.message); return; }

      setEditMode(false);
      setEditSaved(true);
      setEditNewFiles([]); setEditNewPreviews([]);

      await load();
      const { data: updated } = await supabase
        .from('purchase_requests')
        .select('*, requester:profiles!requester_id(name), company:companies!company_id(name)')
        .eq('id', detail.id)
        .single();
      if (updated) setDetail(updated as PurchaseRequest);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const submitBid = async () => {
    if (!detail || !profile) return;
    setSaving(true); setErr('');
    const { error } = await supabase.from('bids').insert({
      request_id: detail.id,
      supplier_id: profile.company_id,
      unit_price: Number(bidForm.unit_price),
      total_price: Number(bidForm.unit_price) * detail.quantity,
      delivery_days: bidForm.delivery_days ? Number(bidForm.delivery_days) : null,
      notes: bidForm.notes || null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setBidModal(false);
    setBidForm({ unit_price:'', delivery_days:'', notes:'' });
    openDetail(detail);
  };

  const submitAward = async () => {
    if (!awardModal) return;
    setSaving(true); setErr('');
    const { data, error } = await supabase.rpc('award_bid', {
      p_bid_id:          awardModal.id,
      p_created_by:      profile?.id ?? null,
      p_start_date:      awardForm.start_date,
      p_end_date:        awardForm.end_date,
      p_prev_unit_price: awardForm.prev_unit_price ? Number(awardForm.prev_unit_price) : null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    const result = data as { error?: string; contract_id?: number } | null;
    if (result?.error) { setErr(result.error); return; }
    setAwardModal(null); setDetail(null); load();
    alert('낙찰 처리 완료! 계약이 생성되었습니다.');
  };

  /* ── 재입찰 모달 열기: 기존 데이터 자동 복사 ── */
  const openRebid = (req: PurchaseRequest) => {
    setRebidSource(req);
    setRebidForm({
      item_name:     req.item_name,
      maker:         req.maker ?? '',
      spec:          req.spec ?? '',
      quantity:      String(req.quantity),
      unit:          req.unit,
      required_date: '',       // 필요일자는 비워둠
      notes:         req.notes ?? '',
    });
    setRebidParts(req.required_parts ?? []);
    setRebidImageUrls(req.image_urls ?? []);
    setRebidErr('');
  };

  const toggleRebidPart = (part: string) =>
    setRebidParts(prev => prev.includes(part) ? prev.filter(p => p !== part) : [...prev, part]);

  /* ── 재입찰 확정: 기존 입찰 취소 + 기존 request 취소 + 새 request 생성 ── */
  const confirmRebid = async () => {
    if (!rebidSource || !profile) return;
    if (!rebidForm.item_name || !rebidForm.quantity) {
      setRebidErr('품목명과 수량은 필수입니다.'); return;
    }
    setRebidSaving(true); setRebidErr('');

    try {
      // 1. 기존 입찰 취소
      await supabase
        .from('bids')
        .update({ status: 'cancelled' })
        .eq('request_id', rebidSource.id)
        .eq('status', 'submitted');

      // 2. 기존 구매 요청 취소
      await supabase
        .from('purchase_requests')
        .update({ status: 'cancelled' })
        .eq('id', rebidSource.id);

      // 3. 새 구매 요청 생성 (image_urls 그대로 복사)
      const { error } = await supabase.from('purchase_requests').insert({
        item_id:        rebidSource.item_id,
        item_name:      rebidForm.item_name,
        maker:          rebidForm.maker || null,
        spec:           rebidForm.spec || null,
        quantity:       Number(rebidForm.quantity),
        unit:           rebidForm.unit,
        required_date:  rebidForm.required_date || null,
        requester_id:   profile.id,
        company_id:     profile.company_id,
        status:         'bidding',
        notes:          rebidForm.notes || null,
        image_urls:     rebidImageUrls.length > 0 ? rebidImageUrls : null,
        required_parts: rebidParts.length > 0 ? rebidParts : null,
      });

      if (error) { setRebidErr(error.message); setRebidSaving(false); return; }

      setRebidSource(null);
      setDetail(null);
      await load();
      alert('재입찰이 등록되었습니다. 납품협력사가 새로 입찰할 수 있습니다.');
    } catch (e: unknown) {
      setRebidErr(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setRebidSaving(false);
    }
  };

  /* ── 구매 요청 삭제 (관리자 전용, 입찰 없을 때만) ── */
  const deleteRequest = async (r: PurchaseRequest) => {
    if (!confirm('정말 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    const { error } = await supabase.from('purchase_requests').delete().eq('id', r.id);
    if (error) { alert(`삭제 실패: ${error.message}`); return; }
    load();
  };

  const STATUSES = ['all','pending','bidding','contracted','completed','cancelled'];
  const LABELS: Record<string,string> = { all:'전체', pending:'대기중', bidding:'입찰중', contracted:'계약완료', completed:'완료', cancelled:'취소' };
  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);
  const minBid    = bids.length ? Math.min(...bids.map(b => b.unit_price)) : null;
  const isManager  = profile?.role === '직영관리자' || profile?.role === '마스터관리자';
  const isOperator = isManager || profile?.role === '직영';
  const canBid     = detail && profile?.role === '납품협력사' && detail.status === 'bidding';
  const canAward   = detail && isManager && detail.status === 'bidding' && bids.length > 0;
  const canRebid   = canAward && bids.some(b => b.status === 'submitted');
  const canEdit    = detail?.status === 'bidding' && (
    profile?.role === '직영관리자' || profile?.role === '직영' || profile?.role === '마스터관리자'
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {STATUSES.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${filter===s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'}`}>
              {LABELS[s]}
            </button>
          ))}
        </div>
        {profile?.role !== '납품협력사' && (
          <Link href="/requests/new" className="btn-primary">+ 신규 구매품 등록</Link>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="table-th">품목명</th><th className="table-th">메이커/규격</th>
              <th className="table-th">수량</th><th className="table-th">필요일</th>
              <th className="table-th">요청자</th><th className="table-th">상태</th>
              <th className="table-th">상세</th>
              {isManager && <th className="table-th">삭제</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={isOperator ? 8 : 7} className="table-td text-center text-gray-400 py-8">등록된 항목이 없습니다.</td></tr>
            )}
            {filtered.map(r => {
              const hasBids = (bidCounts[r.id] ?? 0) > 0;
              return (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="table-td font-medium">
                  <span className="flex items-center gap-1.5">
                    {r.item_name}
                    {r.image_urls && r.image_urls.length > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[10px] text-blue-500 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full font-normal"
                        title={`사진 ${r.image_urls.length}장 첨부`}
                      >
                        📷 {r.image_urls.length}
                      </span>
                    )}
                  </span>
                </td>
                <td className="table-td text-gray-500">{[r.maker, r.spec].filter(Boolean).join(' / ') || '-'}</td>
                <td className="table-td">{r.quantity.toLocaleString()} {r.unit}</td>
                <td className="table-td">{r.required_date ?? '-'}</td>
                <td className="table-td">{(r.requester as {name:string}|null)?.name ?? '-'}</td>
                <td className="table-td"><StatusBadge status={r.status} /></td>
                <td className="table-td">
                  <button onClick={() => openDetail(r)} className="text-blue-600 hover:underline text-sm">보기</button>
                </td>
                {isManager && (
                  <td className="table-td">
                    {hasBids ? (
                      <span className="text-xs text-gray-300 cursor-not-allowed" title="입찰 기록이 있어 삭제할 수 없습니다">
                        삭제 불가
                      </span>
                    ) : (
                      <button onClick={() => deleteRequest(r)} className="text-xs text-red-500 hover:text-red-700 hover:underline font-medium transition-colors">
                        삭제
                      </button>
                    )}
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 상세 모달 */}
      <Modal
        isOpen={!!detail}
        onClose={closeDetail}
        title={editMode ? '구매 요청 수정' : '구매 요청 상세'}
        size="lg"
      >
        {detail && (
          <div className="space-y-4">

            {/* 저장 완료 알림 */}
            {editSaved && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                <span className="text-amber-500 text-base mt-0.5">🔔</span>
                <div>
                  <p className="font-semibold text-amber-800">수정이 완료되었습니다.</p>
                  <p className="text-amber-700 mt-0.5">입찰 참여 업체에게 변경 내용을 별도로 안내해 주세요.</p>
                </div>
              </div>
            )}

            {/* 조회 모드 */}
            {!editMode && (
              <>
                <div className="grid grid-cols-3 gap-3 text-sm bg-gray-50 rounded-lg p-4">
                  <div><span className="text-gray-500">품목명</span><p className="font-semibold">{detail.item_name}</p></div>
                  <div><span className="text-gray-500">메이커</span><p>{detail.maker ?? '-'}</p></div>
                  <div><span className="text-gray-500">규격</span><p>{detail.spec ?? '-'}</p></div>
                  <div><span className="text-gray-500">수량</span><p className="font-semibold">{detail.quantity.toLocaleString()} {detail.unit}</p></div>
                  <div><span className="text-gray-500">필요일</span><p>{detail.required_date ?? '-'}</p></div>
                  <div><span className="text-gray-500">상태</span><p><StatusBadge status={detail.status} /></p></div>
                  {detail.notes && <div className="col-span-3"><span className="text-gray-500">비고</span><p>{detail.notes}</p></div>}
                </div>

                {detail.required_parts && detail.required_parts.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-500">대상 파트:</span>
                    {detail.required_parts.map(p => (
                      <span key={p} className="text-xs bg-purple-100 text-purple-700 font-semibold px-2.5 py-1 rounded-full">{p}</span>
                    ))}
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">첨부 사진</p>
                  <ImageGallery urls={detail.image_urls} />
                </div>

                {/* 수정 버튼 */}
                {canEdit && (
                  <div className="flex justify-end">
                    <button
                      onClick={enterEditMode}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg font-medium transition-colors"
                    >
                      ✏️ 수정
                    </button>
                  </div>
                )}
              </>
            )}

            {/* 편집 모드 */}
            {editMode && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="col-span-2">
                    <label className="label">품목명 *</label>
                    <input className="input" value={editForm.item_name}
                      onChange={e => setEditForm(f => ({...f, item_name: e.target.value}))}
                      placeholder="품목명 입력" />
                  </div>
                  <div>
                    <label className="label">메이커</label>
                    <input className="input" value={editForm.maker}
                      onChange={e => setEditForm(f => ({...f, maker: e.target.value}))}
                      placeholder="제조사" />
                  </div>
                  <div>
                    <label className="label">규격/사양</label>
                    <input className="input" value={editForm.spec}
                      onChange={e => setEditForm(f => ({...f, spec: e.target.value}))}
                      placeholder="규격" />
                  </div>
                  <div>
                    <label className="label">수량 *</label>
                    <input className="input" type="number" min="1" value={editForm.quantity}
                      onChange={e => setEditForm(f => ({...f, quantity: e.target.value}))} />
                  </div>
                  <div>
                    <label className="label">단위</label>
                    <select className="input" value={editForm.unit}
                      onChange={e => setEditForm(f => ({...f, unit: e.target.value}))}>
                      {['EA','SET','Box','kg','L','m','pair','Roll'].map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">필요일자</label>
                    <input className="input" type="date" value={editForm.required_date}
                      onChange={e => setEditForm(f => ({...f, required_date: e.target.value}))} />
                  </div>
                </div>

                <div>
                  <label className="label">비고</label>
                  <textarea className="input resize-none h-16" value={editForm.notes}
                    onChange={e => setEditForm(f => ({...f, notes: e.target.value}))} />
                </div>

                {/* 대상 파트 편집 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">대상 파트</label>
                    {editParts.length > 0 && (
                      <span className="text-xs text-purple-600 font-medium">{editParts.length}개 선택됨</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-2 p-3 bg-purple-50 rounded-xl border border-purple-100">
                    {PARTS_LIST.map(part => (
                      <label key={part} className="flex items-center gap-1.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={editParts.includes(part)}
                          onChange={() => toggleEditPart(part)}
                          className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-400"
                        />
                        <span className={`text-sm font-medium transition-colors ${
                          editParts.includes(part) ? 'text-purple-800' : 'text-gray-500 group-hover:text-purple-700'
                        }`}>
                          {part}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 첨부 사진 편집 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">첨부 사진</label>
                    <span className="text-xs text-gray-400">최대 {MAX_IMAGES}장 · {editTotalImages}/{MAX_IMAGES}장</span>
                  </div>

                  {(editExistingUrls.length > 0 || editNewFiles.length > 0) && (
                    <div className="flex flex-wrap gap-3 mb-3">
                      {editExistingUrls.map((url, idx) => (
                        <div key={`exist-${idx}`} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 shadow-sm group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`기존 이미지 ${idx + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeEditExistingImage(idx)}
                            className="absolute top-1 right-1 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full text-sm flex items-center justify-center leading-none shadow transition-colors"
                            aria-label="이미지 삭제"
                          >×</button>
                        </div>
                      ))}
                      {editNewPreviews.map((src, idx) => (
                        <div key={`new-${idx}`} className="relative w-20 h-20 rounded-lg overflow-hidden border border-blue-200 bg-blue-50 shadow-sm">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`새 이미지 ${idx + 1}`} className="w-full h-full object-cover" />
                          <span className="absolute top-1 left-1 text-[9px] bg-blue-500 text-white px-1 py-0.5 rounded font-medium">NEW</span>
                          <button
                            type="button"
                            onClick={() => removeEditNewImage(idx)}
                            className="absolute top-1 right-1 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full text-sm flex items-center justify-center leading-none shadow transition-colors"
                            aria-label="이미지 삭제"
                          >×</button>
                        </div>
                      ))}
                      {!editIsFull && (
                        <button
                          type="button"
                          onClick={() => editFileInputRef.current?.click()}
                          className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-400 transition-colors"
                          aria-label="사진 추가"
                        >
                          <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          <span className="text-xs">추가</span>
                        </button>
                      )}
                    </div>
                  )}

                  {editTotalImages === 0 && (
                    <div
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onClick={() => editFileInputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && editFileInputRef.current?.click()}
                      className={[
                        'rounded-xl border-2 border-dashed transition-all duration-200 select-none cursor-pointer p-5 flex items-center justify-center gap-2 text-sm',
                        isDragging
                          ? 'border-blue-400 bg-blue-50 text-blue-600'
                          : 'border-gray-300 bg-gray-50 text-gray-500 hover:border-blue-300 hover:bg-blue-50/40',
                      ].join(' ')}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>{isDragging ? '여기에 놓으세요!' : '클릭하거나 드래그하여 사진 추가'}</span>
                    </div>
                  )}

                  <input
                    ref={editFileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.gif,.webp,image/jpeg,image/png,image/gif,image/webp"
                    multiple
                    className="hidden"
                    onChange={handleEditFileChange}
                  />
                </div>

                {err && <p className="text-red-600 text-sm">{err}</p>}

                <div className="flex gap-3 pt-1">
                  <button className="btn-secondary flex-1" onClick={cancelEdit} disabled={saving}>취소</button>
                  <button className="btn-primary flex-1" onClick={saveEdit} disabled={saving}>
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            )}

            {/* 입찰 현황 (조회 모드에서만) */}
            {!editMode && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-800">입찰 현황 ({bids.length}건)</h4>
                  <div className="flex gap-2">
                    {canRebid && (
                      <button
                        className="py-1 px-3 text-xs bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-300 rounded-lg font-medium transition-colors"
                        onClick={() => openRebid(detail)}
                      >
                        🔄 재입찰 등록
                      </button>
                    )}
                    {canBid && <button className="btn-primary py-1 px-3 text-xs" onClick={() => { setBidModal(true); setErr(''); }}>입찰 참여</button>}
                  </div>
                </div>
                <table className="w-full text-sm border rounded-lg overflow-hidden">
                  <thead><tr className="bg-gray-50">
                    <th className="table-th">납품사</th><th className="table-th">파트</th>
                    <th className="table-th">단가</th><th className="table-th">총액</th>
                    <th className="table-th">납기(일)</th>
                    <th className="table-th">결과</th>
                    {canAward && <th className="table-th text-center">낙찰</th>}
                  </tr></thead>
                  <tbody>
                    {bids.length === 0 && <tr><td colSpan={7} className="table-td text-center text-gray-400 py-4">입찰 없음</td></tr>}
                    {bids.map(b => {
                      const sup = b.supplier as { name: string; parts?: string[] | null } | null;
                      return (
                      <tr key={b.id} className={`border-t ${b.unit_price === minBid && bids.length>1 ? 'bg-green-50' : ''}`}>
                        <td className="table-td font-medium">
                          {sup?.name}
                          {b.unit_price === minBid && bids.length>1 && <span className="ml-1 text-xs text-green-600 font-bold">최저가</span>}
                        </td>
                        <td className="table-td">
                          {sup?.parts && sup.parts.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {sup.parts.map(p => (
                                <span key={p} className="text-[10px] bg-purple-100 text-purple-700 font-medium px-1.5 py-0.5 rounded-full">{p}</span>
                              ))}
                            </div>
                          ) : <span className="text-xs text-gray-300">-</span>}
                        </td>
                        <td className="table-td font-bold">{b.unit_price.toLocaleString()}원</td>
                        <td className="table-td">{b.total_price.toLocaleString()}원</td>
                        <td className="table-td">{b.delivery_days ?? '-'}</td>
                        <td className="table-td"><StatusBadge status={b.status} /></td>
                        {canAward && (
                          <td className="table-td">
                            {b.status === 'submitted' && (
                              <button className="btn-primary py-1 px-2 text-xs"
                                onClick={() => { setAwardModal(b); setAwardForm({start_date:'', end_date:'', prev_unit_price:''}); setQuickSelect(null); setErr(''); }}>
                                낙찰
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 입찰 모달 */}
      <Modal isOpen={bidModal} onClose={() => setBidModal(false)} title="입찰 참여" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">단가 (원) *</label>
            <input className="input" type="number" min="1" value={bidForm.unit_price}
              onChange={e => setBidForm(f => ({...f, unit_price: e.target.value}))} />
            {bidForm.unit_price && detail && (
              <p className="text-xs text-gray-500 mt-1">총액: {(Number(bidForm.unit_price)*detail.quantity).toLocaleString()}원</p>
            )}
          </div>
          <div>
            <label className="label">납기일(일)</label>
            <input className="input" type="number" min="1" value={bidForm.delivery_days}
              onChange={e => setBidForm(f => ({...f, delivery_days: e.target.value}))} />
          </div>
          <div>
            <label className="label">비고</label>
            <textarea className="input resize-none h-16" value={bidForm.notes}
              onChange={e => setBidForm(f => ({...f, notes: e.target.value}))} />
          </div>
          {err && <p className="text-red-600 text-sm">{err}</p>}
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => setBidModal(false)}>취소</button>
            <button className="btn-primary flex-1" onClick={submitBid} disabled={saving}>{saving?'처리중...':'입찰 제출'}</button>
          </div>
        </div>
      </Modal>

      {/* 낙찰 모달 */}
      <Modal isOpen={!!awardModal} onClose={() => setAwardModal(null)} title="낙찰 처리 및 계약 등록" size="sm">
        {awardModal && (
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-lg text-sm">
              <p><strong>낙찰 업체:</strong> {(awardModal.supplier as {name:string}|null)?.name}</p>
              <p><strong>낙찰 단가:</strong> {awardModal.unit_price.toLocaleString()}원</p>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">계약 시작일 *</label>
                  <input className="input" type="date" value={awardForm.start_date}
                    onChange={e => { setAwardForm(f => ({...f, start_date:e.target.value})); setQuickSelect(null); }} />
                </div>
                <div>
                  <label className="label">계약 종료일 *</label>
                  <input className="input" type="date" value={awardForm.end_date}
                    onChange={e => { setAwardForm(f => ({...f, end_date:e.target.value})); setQuickSelect(null); }} />
                </div>
              </div>

              <div className="flex gap-2">
                {([
                  { key: 'once', label: '일회성', active: 'bg-gray-600 text-white border-gray-600', inactive: 'text-gray-600 border-gray-300 hover:bg-gray-50' },
                  { key: '6m',   label: '6개월',  active: 'bg-blue-600 text-white border-blue-600',  inactive: 'text-blue-600 border-blue-300 hover:bg-blue-50' },
                  { key: '1y',   label: '1년',    active: 'bg-green-600 text-white border-green-600', inactive: 'text-green-600 border-green-300 hover:bg-green-50' },
                ] as const).map(({ key, label, active, inactive }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyQuickSelect(key)}
                    className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                      quickSelect === key ? active : `bg-white ${inactive}`
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">이전 단가 (절감액 계산용)</label>
              <input className="input" type="number" min="0" value={awardForm.prev_unit_price}
                onChange={e => setAwardForm(f => ({...f, prev_unit_price:e.target.value}))} />
              {awardForm.prev_unit_price && detail && (
                <p className="text-xs text-green-600 mt-1">
                  절감액: {((Number(awardForm.prev_unit_price)-awardModal.unit_price)*detail.quantity).toLocaleString()}원
                </p>
              )}
            </div>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setAwardModal(null)}>취소</button>
              <button className="btn-primary flex-1" onClick={submitAward} disabled={saving}>{saving?'처리중...':'낙찰 확정'}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* 재입찰 모달: 기존 데이터 자동 입력 */}
      <Modal
        isOpen={!!rebidSource}
        onClose={() => setRebidSource(null)}
        title={rebidSource ? `재입찰 - ${rebidSource.item_name}` : '재입찰'}
        size="lg"
      >
        {rebidSource && (
          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm text-orange-800">
              기존 입찰이 모두 취소되고 새 구매 요청으로 재입찰이 진행됩니다. 필요일자를 새로 입력해주세요.
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2">
                <label className="label">품목명 *</label>
                <input
                  className="input"
                  value={rebidForm.item_name}
                  onChange={e => setRebidForm(f => ({...f, item_name: e.target.value}))}
                  placeholder="품목명 입력"
                />
              </div>
              <div>
                <label className="label">메이커</label>
                <input
                  className="input"
                  value={rebidForm.maker}
                  onChange={e => setRebidForm(f => ({...f, maker: e.target.value}))}
                  placeholder="제조사"
                />
              </div>
              <div>
                <label className="label">규격/사양</label>
                <input
                  className="input"
                  value={rebidForm.spec}
                  onChange={e => setRebidForm(f => ({...f, spec: e.target.value}))}
                  placeholder="규격"
                />
              </div>
              <div>
                <label className="label">수량 *</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  value={rebidForm.quantity}
                  onChange={e => setRebidForm(f => ({...f, quantity: e.target.value}))}
                />
              </div>
              <div>
                <label className="label">단위</label>
                <select
                  className="input"
                  value={rebidForm.unit}
                  onChange={e => setRebidForm(f => ({...f, unit: e.target.value}))}
                >
                  {['EA','SET','Box','kg','L','m','pair','Roll'].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="label">필요일자 <span className="text-orange-500 font-semibold">* 새로 입력</span></label>
                <input
                  className="input border-orange-300 focus:ring-orange-400"
                  type="date"
                  value={rebidForm.required_date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={e => setRebidForm(f => ({...f, required_date: e.target.value}))}
                />
              </div>
            </div>

            <div>
              <label className="label">비고</label>
              <textarea
                className="input resize-none h-16"
                value={rebidForm.notes}
                onChange={e => setRebidForm(f => ({...f, notes: e.target.value}))}
              />
            </div>

            {/* 대상 파트 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">대상 파트</label>
                {rebidParts.length > 0 && (
                  <span className="text-xs text-purple-600 font-medium">{rebidParts.length}개 선택됨</span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 p-3 bg-purple-50 rounded-xl border border-purple-100">
                {PARTS_LIST.map(part => (
                  <label key={part} className="flex items-center gap-1.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={rebidParts.includes(part)}
                      onChange={() => toggleRebidPart(part)}
                      className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-400"
                    />
                    <span className={`text-sm font-medium transition-colors ${
                      rebidParts.includes(part) ? 'text-purple-800' : 'text-gray-500 group-hover:text-purple-700'
                    }`}>
                      {part}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* 복사된 첨부 사진 */}
            {rebidImageUrls.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">첨부 사진 (기존에서 복사)</label>
                  <span className="text-xs text-gray-400">{rebidImageUrls.length}장</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {rebidImageUrls.map((url, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 shadow-sm group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`첨부 이미지 ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setRebidImageUrls(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full text-sm flex items-center justify-center leading-none shadow transition-colors"
                        aria-label="이미지 제거"
                      >×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rebidErr && <p className="text-red-600 text-sm">{rebidErr}</p>}
            <div className="flex gap-3 pt-1">
              <button className="btn-secondary flex-1" onClick={() => setRebidSource(null)} disabled={rebidSaving}>취소</button>
              <button className="btn-primary flex-1" onClick={confirmRebid} disabled={rebidSaving}>
                {rebidSaving ? '처리 중...' : '재입찰 등록'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

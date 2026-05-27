'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { PurchaseRequest, Bid, Profile } from '@/lib/types';
import ImageGallery from '@/components/ImageGallery';

export default function RequestsPage() {
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [filter, setFilter]     = useState('all');
  const [detail, setDetail]     = useState<PurchaseRequest | null>(null);
  const [bids, setBids]         = useState<Bid[]>([]);
  const [bidModal, setBidModal] = useState(false);
  const [awardModal, setAwardModal] = useState<Bid | null>(null);
  const [bidForm, setBidForm]   = useState({ unit_price: '', delivery_days: '', notes: '' });
  const [awardForm, setAwardForm] = useState({ start_date: '', end_date: '', prev_unit_price: '' });
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');

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
    setRequests((data ?? []) as PurchaseRequest[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (r: PurchaseRequest) => {
    setDetail(r); setErr('');
    const { data } = await supabase
      .from('bids')
      .select('*, supplier:companies!supplier_id(name)')
      .eq('request_id', r.id)
      .order('unit_price');
    setBids((data ?? []) as Bid[]);
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
      p_bid_id:          awardModal.id,            // integer (bids.id)
      p_created_by:      profile?.id ?? null,       // uuid   (profiles.id)
      p_start_date:      awardForm.start_date,
      p_end_date:        awardForm.end_date,
      p_prev_unit_price: awardForm.prev_unit_price ? Number(awardForm.prev_unit_price) : null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    // 함수가 { error: '...' } JSONB를 반환하는 경우 처리
    const result = data as { error?: string; contract_id?: number } | null;
    if (result?.error) { setErr(result.error); return; }
    setAwardModal(null); setDetail(null); load();
    alert('낙찰 처리 완료! 계약이 생성되었습니다.');
  };

  const STATUSES = ['all','pending','bidding','contracted','completed','cancelled'];
  const LABELS: Record<string,string> = { all:'전체', pending:'대기중', bidding:'입찰중', contracted:'계약완료', completed:'완료', cancelled:'취소' };
  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);
  const minBid   = bids.length ? Math.min(...bids.map(b => b.unit_price)) : null;
  const canBid   = detail && profile?.role === '납품협력사' && detail.status === 'bidding';
  const canAward = detail && profile?.role === '직영' && detail.status === 'bidding' && bids.length > 0;

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
          <Link href="/requests/new" className="btn-primary">+ 구매 요청 등록</Link>
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
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="table-td text-center text-gray-400 py-8">구매 요청이 없습니다.</td></tr>}
            {filtered.map(r => (
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 상세 모달 */}
      <Modal isOpen={!!detail} onClose={() => { setDetail(null); setBids([]); }} title="구매 요청 상세" size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm bg-gray-50 rounded-lg p-4">
              <div><span className="text-gray-500">품목명</span><p className="font-semibold">{detail.item_name}</p></div>
              <div><span className="text-gray-500">메이커</span><p>{detail.maker ?? '-'}</p></div>
              <div><span className="text-gray-500">규격</span><p>{detail.spec ?? '-'}</p></div>
              <div><span className="text-gray-500">수량</span><p className="font-semibold">{detail.quantity.toLocaleString()} {detail.unit}</p></div>
              <div><span className="text-gray-500">필요일</span><p>{detail.required_date ?? '-'}</p></div>
              <div><span className="text-gray-500">상태</span><p><StatusBadge status={detail.status} /></p></div>
              {detail.notes && <div className="col-span-3"><span className="text-gray-500">비고</span><p>{detail.notes}</p></div>}
            </div>

            {/* 첨부 사진 */}
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">첨부 사진</p>
              <ImageGallery urls={detail.image_urls} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-gray-800">입찰 현황 ({bids.length}건)</h4>
                {canBid && <button className="btn-primary py-1 px-3 text-xs" onClick={() => { setBidModal(true); setErr(''); }}>입찰 참여</button>}
              </div>
              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead><tr className="bg-gray-50">
                  <th className="table-th">납품사</th><th className="table-th">단가</th>
                  <th className="table-th">총액</th><th className="table-th">납기(일)</th>
                  <th className="table-th">결과</th>
                  {canAward && <th className="table-th">낙찰</th>}
                </tr></thead>
                <tbody>
                  {bids.length === 0 && <tr><td colSpan={6} className="table-td text-center text-gray-400 py-4">입찰 없음</td></tr>}
                  {bids.map(b => (
                    <tr key={b.id} className={`border-t ${b.unit_price === minBid && bids.length>1 ? 'bg-green-50' : ''}`}>
                      <td className="table-td font-medium">
                        {(b.supplier as {name:string}|null)?.name}
                        {b.unit_price === minBid && bids.length>1 && <span className="ml-1 text-xs text-green-600 font-bold">최저가</span>}
                      </td>
                      <td className="table-td font-bold">{b.unit_price.toLocaleString()}원</td>
                      <td className="table-td">{b.total_price.toLocaleString()}원</td>
                      <td className="table-td">{b.delivery_days ?? '-'}</td>
                      <td className="table-td"><StatusBadge status={b.status} /></td>
                      {canAward && (
                        <td className="table-td">
                          {b.status === 'submitted' && (
                            <button className="btn-primary py-1 px-2 text-xs"
                              onClick={() => { setAwardModal(b); setAwardForm({start_date:'', end_date:'', prev_unit_price:''}); setErr(''); }}>
                              낙찰
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">계약 시작일 *</label>
                <input className="input" type="date" value={awardForm.start_date}
                  onChange={e => setAwardForm(f => ({...f, start_date:e.target.value}))} />
              </div>
              <div>
                <label className="label">계약 종료일 *</label>
                <input className="input" type="date" value={awardForm.end_date}
                  onChange={e => setAwardForm(f => ({...f, end_date:e.target.value}))} />
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
    </div>
  );
}

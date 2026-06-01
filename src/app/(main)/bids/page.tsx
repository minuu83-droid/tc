'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import StatusBadge from '@/components/StatusBadge';
import { Profile, PurchaseRequest, Bid } from '@/lib/types';
import ImageGallery from '@/components/ImageGallery';

/* ── 입찰 폼 상태 타입 ── */
type BidForm = { unit_price: string; delivery_date: string; notes: string };
const defaultForm: BidForm = { unit_price: '', delivery_date: '', notes: '' };
type SubmitState = 'idle' | 'submitting' | 'done' | 'error';

export default function BidsPage() {
  const [profile, setProfile]         = useState<Profile | null>(null);
  const [requests, setRequests]       = useState<PurchaseRequest[]>([]);
  const [myBids, setMyBids]           = useState<Bid[]>([]);
  const [bidForms, setBidForms]       = useState<Record<number, BidForm>>({});
  const [submitStates, setSubmitStates] = useState<Record<number, SubmitState>>({});
  const [formErrors, setFormErrors]   = useState<Record<number, string>>({});
  const [loading, setLoading]         = useState(true);

  /* ── 데이터 로드 ── */
  const loadData = useCallback(async (prof: Profile) => {
    setLoading(true);

    if (prof.role === '납품협력사') {
      /* 0. 최신 파트 정보 조회 (세션 캐시 무시) */
      const { data: profileData } = await supabase
        .from('profiles')
        .select('parts')
        .eq('id', prof.id)
        .single();
      const myParts = (profileData?.parts ?? []) as string[];

      /* 1. 입찰 진행 중인 구매 요청 전체 조회 후 파트 필터링 */
      const { data: reqs } = await supabase
        .from('purchase_requests')
        .select('*')
        .eq('status', 'bidding')
        .order('created_at', { ascending: false });
      const allReqs = (reqs ?? []) as PurchaseRequest[];

      /* 파트 매칭: required_parts 없으면 전체 공개, 있으면 교집합 확인 */
      const reqList = allReqs.filter(r => {
        if (!r.required_parts || r.required_parts.length === 0) return true;
        if (myParts.length === 0) return false;
        return r.required_parts.some(p => myParts.includes(p));
      });
      setRequests(reqList);

      /* 2. 내 입찰 내역 */
      if (prof.company_id) {
        const { data: bids } = await supabase
          .from('bids')
          .select('*')
          .eq('supplier_id', prof.company_id)
          .order('submitted_at', { ascending: false });
        setMyBids((bids ?? []) as Bid[]);
      }

    } else {
      /* 직영관리자/마스터관리자/직영: 입찰 중인 구매 요청 목록 */
      const { data } = await supabase
        .from('purchase_requests')
        .select('*, requester:profiles!requester_id(name), company:companies!company_id(name)')
        .eq('status', 'bidding')
        .order('created_at', { ascending: false });
      setRequests((data ?? []) as PurchaseRequest[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    setProfile(session);
    loadData(session);
  }, [loadData]);

  /* ── 폼 필드 업데이트 ── */
  const setFormField = (reqId: number, field: keyof BidForm, value: string) => {
    setBidForms(prev => ({
      ...prev,
      [reqId]: { ...(prev[reqId] ?? defaultForm), [field]: value },
    }));
    // 에러 초기화
    setFormErrors(prev => ({ ...prev, [reqId]: '' }));
  };

  /* ── 입찰 제출 ── */
  const submitBid = async (req: PurchaseRequest) => {
    if (!profile?.company_id) {
      setFormErrors(prev => ({ ...prev, [req.id]: '소속 협력사가 없어 입찰할 수 없습니다. 관리자에게 문의하세요.' }));
      return;
    }

    const form = bidForms[req.id] ?? defaultForm;
    const unitPrice = parseFloat(form.unit_price);

    if (!form.unit_price || isNaN(unitPrice) || unitPrice <= 0) {
      setFormErrors(prev => ({ ...prev, [req.id]: '유효한 단가를 입력하세요.' }));
      return;
    }
    if (!form.delivery_date) {
      setFormErrors(prev => ({ ...prev, [req.id]: '납품 가능일을 선택하세요.' }));
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deliveryDate = new Date(form.delivery_date);
    const deliveryDays = Math.ceil((deliveryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (deliveryDays < 0) {
      setFormErrors(prev => ({ ...prev, [req.id]: '납품 가능일은 오늘 이후여야 합니다.' }));
      return;
    }

    setSubmitStates(prev => ({ ...prev, [req.id]: 'submitting' }));

    const { error } = await supabase.from('bids').insert({
      request_id:    req.id,
      supplier_id:   profile.company_id,
      unit_price:    unitPrice,
      total_price:   unitPrice * req.quantity,
      delivery_days: deliveryDays,
      notes:         form.notes || null,
      status:        'submitted',
    });

    if (error) {
      setSubmitStates(prev => ({ ...prev, [req.id]: 'error' }));
      setFormErrors(prev => ({ ...prev, [req.id]: `입찰 실패: ${error.message}` }));
      return;
    }

    setSubmitStates(prev => ({ ...prev, [req.id]: 'done' }));
    setBidForms(prev => ({ ...prev, [req.id]: defaultForm }));
    await loadData(profile);
  };

  /* ── 입찰 취소 ── */
  const cancelBid = async (bid: Bid) => {
    if (!confirm('입찰 취소 시 해당 항목에 재입찰이 불가합니다.')) return;
    const { error } = await supabase.from('bids').update({ status: 'cancelled' }).eq('id', bid.id);
    if (error) { alert(`취소 실패: ${error.message}`); return; }
    if (profile) await loadData(profile);
  };

  if (!profile || loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-gray-400 animate-pulse">로딩 중...</p>
      </div>
    );
  }

  /* ════════════════════════════════════════
     납품협력사 뷰
  ════════════════════════════════════════ */
  if (profile.role === '납품협력사') {
    return (
      <div className="space-y-5 max-w-3xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">입찰 참여</h2>
            <p className="text-sm text-gray-500 mt-0.5">진행 중인 구매 요청에 단가를 제시하고 입찰에 참여하세요.</p>
          </div>
          <span className="text-xs bg-blue-50 text-blue-600 font-medium px-3 py-1 rounded-full border border-blue-200">
            {requests.length}건 진행 중
          </span>
        </div>

        {/* 협력사 미연결 경고 */}
        {!profile.company_id && (
          <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-xl text-sm text-yellow-800 flex items-start gap-2">
            <span className="text-lg">⚠️</span>
            <div>
              <strong>소속 협력사가 설정되어 있지 않습니다.</strong>
              <p className="mt-0.5 text-xs">관리자에게 문의하여 협력사를 연결해주세요. 연결 전까지 입찰에 참여할 수 없습니다.</p>
            </div>
          </div>
        )}

        {/* 입찰 목록 */}
        {requests.length === 0 ? (
          <div className="card p-14 text-center">
            <p className="text-3xl mb-3">📭</p>
            <p className="text-gray-500 text-sm">현재 진행 중인 입찰이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map(req => {
              const existingBid = myBids.find(b => b.request_id === req.id);
              const form        = bidForms[req.id] ?? defaultForm;
              const submitState = submitStates[req.id] ?? 'idle';
              const formError   = formErrors[req.id];
              const liveTotal   = form.unit_price && !isNaN(parseFloat(form.unit_price))
                ? parseFloat(form.unit_price) * req.quantity
                : null;

              return (
                <div
                  key={req.id}
                  className={[
                    'card p-5 transition-shadow',
                    existingBid?.status === 'cancelled'
                      ? 'border-l-4 border-red-300'
                      : existingBid
                        ? 'border-l-4 border-green-400'
                        : 'border-l-4 border-transparent',
                  ].join(' ')}
                >
                  {/* 품목 정보 */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-900">{req.item_name}</h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-sm text-gray-500">
                        <span>수량 <strong className="text-gray-800">{req.quantity} {req.unit}</strong></span>
                        <span>희망납품일 <strong className="text-gray-800">{req.required_date ?? '미지정'}</strong></span>
                        {req.maker && <span>메이커 {req.maker}</span>}
                        {req.spec  && <span>규격 {req.spec}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0 ml-4">
                      {existingBid?.status === 'cancelled'
                        ? <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-600">입찰취소</span>
                        : existingBid
                          ? <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">✓ 참여완료</span>
                          : <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-200">입찰 가능</span>
                      }
                    </div>
                  </div>

                  {/* ── 대상 파트 태그 ── */}
                  {req.required_parts && req.required_parts.length > 0 && (
                    <div className="mb-3 flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-400 shrink-0">대상 파트:</span>
                      {req.required_parts.map(p => (
                        <span key={p} className="text-xs bg-purple-100 text-purple-700 font-medium px-2 py-0.5 rounded-full">
                          {p}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* ── 첨부 사진 ── */}
                  <div className="mb-4 pt-3 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-400 mb-2">첨부 사진</p>
                    <ImageGallery urls={req.image_urls} />
                  </div>

                  {existingBid?.status === 'cancelled' ? (
                    /* ── 입찰 취소됨 ── */
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center space-y-1">
                      <p className="text-sm font-semibold text-red-700">🚫 입찰취소 (재입찰 불가)</p>
                      <p className="text-xs text-red-500">취소한 입찰 건은 동일 요청에 재입찰하실 수 없습니다.</p>
                    </div>
                  ) : existingBid ? (
                    /* ── 참여완료 상세 + 취소 버튼 ── */
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <div className="flex items-center justify-between gap-4">
                        <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                          <dt className="text-gray-500">내 입찰 단가</dt>
                          <dd className="font-semibold text-gray-900">{existingBid.unit_price.toLocaleString()}원</dd>
                          <dt className="text-gray-500">총액</dt>
                          <dd className="font-semibold text-gray-900">{existingBid.total_price.toLocaleString()}원</dd>
                          <dt className="text-gray-500">납품 가능</dt>
                          <dd className="text-gray-700">{existingBid.delivery_days}일 이내</dd>
                          <dt className="text-gray-500">입찰일시</dt>
                          <dd className="text-gray-500 text-xs">{existingBid.submitted_at?.slice(0, 16) ?? '-'}</dd>
                        </dl>
                      </div>
                      {/* 입찰 취소 버튼 */}
                      <div className="mt-3 pt-3 border-t border-green-200 flex justify-end">
                        <button
                          onClick={() => cancelBid(existingBid)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium hover:underline transition-colors"
                        >
                          입찰 취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── 입찰 폼 ── */
                    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">입찰 정보 입력</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label text-xs">단가 (원) *</label>
                          <input
                            type="number"
                            className="input text-sm"
                            placeholder="예: 15,000"
                            min="1"
                            value={form.unit_price}
                            onChange={e => setFormField(req.id, 'unit_price', e.target.value)}
                            disabled={!profile.company_id || submitState === 'submitting'}
                          />
                          {liveTotal !== null && (
                            <p className="text-xs text-blue-600 mt-1">
                              예상 총액: <strong>{liveTotal.toLocaleString()}원</strong>
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="label text-xs">납품 가능일 *</label>
                          <input
                            type="date"
                            className="input text-sm"
                            min={new Date().toISOString().slice(0, 10)}
                            value={form.delivery_date}
                            onChange={e => setFormField(req.id, 'delivery_date', e.target.value)}
                            disabled={!profile.company_id || submitState === 'submitting'}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="label text-xs">비고 (선택)</label>
                        <input
                          type="text"
                          className="input text-sm"
                          placeholder="특이사항이 있으면 입력하세요"
                          value={form.notes}
                          onChange={e => setFormField(req.id, 'notes', e.target.value)}
                          disabled={!profile.company_id || submitState === 'submitting'}
                        />
                      </div>
                      {formError && (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                          <span>⚠️</span>{formError}
                        </p>
                      )}
                      <button
                        onClick={() => submitBid(req)}
                        disabled={!profile.company_id || submitState === 'submitting'}
                        className="btn-primary w-full py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitState === 'submitting' ? '입찰 제출 중...' : '입찰 참여'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 내 입찰 이력 (완료된 것 포함) */}
        {myBids.length > 0 && (
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">내 전체 입찰 이력</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="table-th">품목명</th>
                  <th className="table-th">단가</th>
                  <th className="table-th">총액</th>
                  <th className="table-th">납품가능</th>
                  <th className="table-th">결과</th>
                  <th className="table-th">입찰일시</th>
                </tr>
              </thead>
              <tbody>
                {myBids.map(b => (
                  <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="table-td font-medium">
                      {requests.find(r => r.id === b.request_id)?.item_name ?? `요청 #${b.request_id}`}
                    </td>
                    <td className="table-td">{b.unit_price.toLocaleString()}원</td>
                    <td className="table-td">{b.total_price.toLocaleString()}원</td>
                    <td className="table-td text-gray-600">{b.delivery_days}일</td>
                    <td className="table-td"><StatusBadge status={b.status} /></td>
                    <td className="table-td text-xs text-gray-500">{b.submitted_at?.slice(0, 16) ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════
     직영관리자 / 마스터관리자 / 직영 뷰
  ════════════════════════════════════════ */
  const isManager = profile.role === '직영관리자' || profile.role === '마스터관리자';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">입찰 진행중 구매 요청</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {isManager
              ? '낙찰 확정 및 재입찰은 구매 요청 메뉴 → 상세보기에서 처리하세요.'
              : '현재 입찰이 진행 중인 구매 요청 목록입니다. (조회만 가능)'}
          </p>
        </div>
        <span className="text-xs bg-blue-50 text-blue-600 font-medium px-3 py-1 rounded-full border border-blue-200">
          {requests.length}건 진행 중
        </span>
      </div>

      {!isManager && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 flex items-center gap-2">
          <span>ℹ️</span>
          <span>입찰 조회만 가능합니다. 낙찰 확정/재입찰은 직영관리자 권한이 필요합니다.</span>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="table-th">품목명</th>
              <th className="table-th">수량</th>
              <th className="table-th">필요일</th>
              <th className="table-th">요청자</th>
              <th className="table-th">대상 파트</th>
              {isManager && <th className="table-th text-center">처리</th>}
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr>
                <td colSpan={isManager ? 6 : 5} className="table-td text-center text-gray-400 py-8">
                  입찰 중인 항목 없음
                </td>
              </tr>
            )}
            {requests.map(r => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="table-td font-medium">{r.item_name}</td>
                <td className="table-td">{r.quantity} {r.unit}</td>
                <td className="table-td">{r.required_date ?? '-'}</td>
                <td className="table-td">{(r.requester as { name: string } | null)?.name ?? '-'}</td>
                <td className="table-td">
                  {r.required_parts && r.required_parts.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {r.required_parts.map(p => (
                        <span key={p} className="text-[10px] bg-purple-100 text-purple-700 font-medium px-1.5 py-0.5 rounded-full">
                          {p}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">전체 공개</span>
                  )}
                </td>
                {isManager && (
                  <td className="table-td text-center">
                    <Link
                      href="/requests"
                      className="text-xs text-blue-600 hover:underline font-medium"
                    >
                      구매요청에서 처리 →
                    </Link>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import Modal from '@/components/Modal';
import ImageGallery from '@/components/ImageGallery';
import { Profile, Contract } from '@/lib/types';

type Tab = '전체' | '일회성' | '기간계약';

/* purchase_requests.image_urls 를 조인해서 가져온 확장 타입 */
type ContractWithImages = Contract & {
  request?: { image_urls: string[] | null } | null;
};

const today      = () => new Date();
const daysLeft   = (end: string) => Math.ceil((new Date(end).getTime() - today().getTime()) / 86400000);
const toDateStr  = (d: Date)     => d.toISOString().slice(0, 10);

export default function ItemsPage() {
  const router = useRouter();
  const [profile,   setProfile]   = useState<Profile | null>(null);
  const [contracts, setContracts] = useState<ContractWithImages[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState<Tab>('전체');

  /* ── 발주 모달 ── */
  const [orderTarget, setOrderTarget] = useState<ContractWithImages | null>(null);
  const [orderForm,   setOrderForm]   = useState({ quantity: '', required_date: '', notes: '' });
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderErr,    setOrderErr]    = useState('');

  /* ── 갱신 모달 ── */
  const [renewTarget, setRenewTarget] = useState<ContractWithImages | null>(null);
  const [renewPeriod, setRenewPeriod] = useState<'6m' | '1y' | null>(null);
  const [renewPrice,  setRenewPrice]  = useState('');
  const [renewSaving, setRenewSaving] = useState(false);
  const [renewErr,    setRenewErr]    = useState('');

  const isAdmin   = profile?.role === '직영' || profile?.role === '마스터관리자';
  const canRebid  = profile?.role === '마스터관리자' || profile?.role === '직영관리자';
  /* 직영 비결재자(tc202~206): 발주 시 결재 필요 */
  const needsApproval = profile?.role === '직영' && !(profile?.is_approver ?? false);

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    setProfile(session);
  }, []);

  /* ── 계약 목록 로드 ── */
  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('contracts')
      .select('*, supplier:companies!supplier_id(name), request:purchase_requests!request_id(image_urls)')
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    setContracts((data ?? []) as ContractWithImages[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── 파생 데이터 ── */
  const expiringSoon = contracts.filter(c => { const d = daysLeft(c.end_date); return d >= 0 && d <= 30; });

  const tabCounts: Record<Tab, number> = {
    '전체':   contracts.length,
    '일회성': contracts.filter(c => c.contract_type === '일회성').length,
    '기간계약': contracts.filter(c => c.contract_type === '기간계약').length,
  };

  const filtered = contracts.filter(c => {
    if (tab === '일회성')  return c.contract_type === '일회성';
    if (tab === '기간계약') return c.contract_type === '기간계약';
    return true;
  });

  /* ── 발주 처리 ── */
  const submitOrder = async () => {
    if (!orderTarget || !profile) return;
    const qty = Number(orderForm.quantity);
    if (!qty || qty <= 0) { setOrderErr('수량을 입력하세요.'); return; }
    setOrderSaving(true); setOrderErr('');
    const orderNo = `ORD-${Date.now()}`;
    const { error } = await supabase.from('orders').insert({
      order_no:      orderNo,
      contract_id:   orderTarget.id,
      item_id:       orderTarget.item_id,
      item_name:     orderTarget.item_name,
      quantity:      qty,
      unit_price:    orderTarget.unit_price,
      total_price:   orderTarget.unit_price * qty,
      ordered_by:    profile.id,
      supplier_id:   orderTarget.supplier_id,
      required_date: orderForm.required_date || null,
      notes:         orderForm.notes || null,
      status:        'ordered',
      ...(needsApproval ? { approval_status: '결재대기' } : {}),
    });
    setOrderSaving(false);
    if (error) { setOrderErr(error.message); return; }
    setOrderTarget(null);
    if (needsApproval) {
      alert('발주 신청이 등록되었습니다. 결재자 승인 후 발주가 확정됩니다.');
    } else {
      alert('발주가 완료되었습니다.');
    }
    router.push('/orders');
  };

  /* ── 재입찰: 새 구매 요청 생성 후 이동 ── */
  const startReBid = async (c: ContractWithImages) => {
    if (!profile) return;
    if (!confirm(`"${c.item_name}" 품목으로 재입찰을 시작하겠습니까?`)) return;
    const { error } = await supabase.from('purchase_requests').insert({
      item_name:    c.item_name,
      quantity:     c.quantity ?? 1,
      unit:         'EA',
      requester_id: profile.id,
      company_id:   profile.company_id,
      status:       'bidding',
      notes:        `[재입찰] ${c.item_name}`,
    });
    if (error) { alert(`재입찰 등록 실패: ${error.message}`); return; }
    alert('재입찰 요청이 등록되었습니다.');
    router.push('/requests');
  };

  /* ── 계약 갱신 ── */
  const submitRenew = async () => {
    if (!renewTarget || !renewPeriod || !profile) return;
    setRenewSaving(true); setRenewErr('');
    const { data, error } = await supabase.rpc('renew_contract', {
      p_contract_id:  renewTarget.id,
      p_requester_id: profile.id,
      p_period:       renewPeriod,
      p_unit_price:   renewPrice ? Number(renewPrice) : null,
    });
    setRenewSaving(false);
    if (error) { setRenewErr(error.message); return; }
    const result = data as { error?: string } | null;
    if (result?.error) { setRenewErr(result.error); return; }
    setRenewTarget(null);
    alert('계약이 갱신되었습니다.');
    load();
  };

  /* ── 갱신 미리보기 날짜 ── */
  const renewPreviewDate = renewPeriod
    ? (() => { const d = new Date(); renewPeriod === '6m' ? d.setMonth(d.getMonth() + 6) : d.setFullYear(d.getFullYear() + 1); return toDateStr(d); })()
    : null;

  if (!profile || loading) {
    return <div className="flex items-center justify-center h-48 text-gray-400 animate-pulse">로딩 중...</div>;
  }

  return (
    <div className="space-y-4">

      {/* ── 만료 임박 경고 배너 (관리자 전용) ── */}
      {isAdmin && expiringSoon.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🚨</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-red-800">계약 만료 임박 {expiringSoon.length}건 — 재입찰 또는 갱신 처리가 필요합니다.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {expiringSoon.map(c => {
                  const d = daysLeft(c.end_date);
                  return (
                    <span key={c.id} className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${
                      d <= 7
                        ? 'bg-red-100 text-red-700 border-red-300'
                        : 'bg-orange-100 text-orange-700 border-orange-300'
                    }`}>
                      {c.item_name}
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        d <= 7 ? 'bg-red-200 text-red-800' : 'bg-orange-200 text-orange-800'
                      }`}>
                        {d}일
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 탭 ── */}
      <div className="flex gap-0 border-b border-gray-200">
        {(['전체', '일회성', '기간계약'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
              tab === t ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
            }`}>
              {tabCounts[t]}
            </span>
          </button>
        ))}
      </div>

      {/* ── 계약 품목 테이블 ── */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="table-th">품목명</th>
              <th className="table-th">납품사</th>
              <th className="table-th">계약 단가</th>
              <th className="table-th">유형</th>
              <th className="table-th">계약 기간</th>
              <th className="table-th">사진</th>
              <th className="table-th text-center">액션</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="table-td text-center text-gray-400 py-12">
                  {tab === '전체'
                    ? '계약 완료된 품목이 없습니다. 신규 구매품을 등록하고 입찰을 진행하세요.'
                    : `${tab} 유형의 계약 품목이 없습니다.`}
                </td>
              </tr>
            )}
            {filtered.map(c => (
                <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                  {/* 품목명 */}
                  <td className="table-td font-semibold text-gray-900">
                    {c.item_name}
                  </td>

                  {/* 납품사 */}
                  <td className="table-td text-gray-600">
                    {(c.supplier as { name: string } | null)?.name ?? '-'}
                  </td>

                  {/* 단가 */}
                  <td className="table-td font-semibold">
                    {c.unit_price.toLocaleString()}원
                  </td>

                  {/* 유형 */}
                  <td className="table-td">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                      c.contract_type === '일회성'
                        ? 'bg-gray-100 text-gray-600'
                        : c.contract_type === '기간계약'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-50 text-gray-400'
                    }`}>
                      {c.contract_type ?? '-'}
                    </span>
                  </td>

                  {/* 계약 기간 */}
                  <td className="table-td text-xs text-gray-500">
                    {c.start_date} ~ {c.end_date}
                  </td>

                  {/* 사진 */}
                  <td className="table-td">
                    <ImageGallery urls={c.request?.image_urls} emptyText="사진 없음" />
                  </td>

                  {/* 액션 */}
                  <td className="table-td">
                    <div className="flex items-center gap-1.5 justify-center flex-wrap">
                      {/* 발주 */}
                      <button
                        onClick={() => { setOrderTarget(c); setOrderForm({ quantity: '', required_date: '', notes: '' }); setOrderErr(''); }}
                        className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                      >
                        발주
                      </button>
                      {/* 재입찰 (마스터관리자/직영관리자만) */}
                      {canRebid && (
                        <button
                          onClick={() => startReBid(c)}
                          className="px-2.5 py-1 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
                        >
                          재입찰
                        </button>
                      )}
                      {/* 갱신 (관리자, 기간계약) */}
                      {isAdmin && c.contract_type === '기간계약' && (
                        <button
                          onClick={() => { setRenewTarget(c); setRenewPeriod(null); setRenewPrice(''); setRenewErr(''); }}
                          className="px-2.5 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                        >
                          갱신
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        * 신규 구매품 등록 → 입찰 → 낙찰 확정 시 자동으로 이 목록에 등록됩니다.
      </p>

      {/* ── 발주 모달 ── */}
      <Modal isOpen={!!orderTarget} onClose={() => setOrderTarget(null)} title={needsApproval ? '발주 신청' : '구매 발주'} size="sm">
        {orderTarget && (
          <div className="space-y-4">
            {needsApproval && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800 flex items-start gap-2">
                <span>⏳</span>
                <span>발주 신청 후 결재자 승인이 필요합니다. 승인 완료 시 발주가 확정됩니다.</span>
              </div>
            )}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm space-y-1">
              <p><strong>품목:</strong> {orderTarget.item_name}</p>
              <p><strong>납품사:</strong> {(orderTarget.supplier as { name: string } | null)?.name ?? '-'}</p>
              <p><strong>계약 단가:</strong> {orderTarget.unit_price.toLocaleString()}원</p>
            </div>
            <div>
              <label className="label">수량 *</label>
              <input className="input" type="number" min="1"
                value={orderForm.quantity}
                onChange={e => setOrderForm(f => ({ ...f, quantity: e.target.value }))} />
              {orderForm.quantity && Number(orderForm.quantity) > 0 && (
                <p className="text-xs text-blue-600 mt-1">
                  총액: {(Number(orderForm.quantity) * orderTarget.unit_price).toLocaleString()}원
                </p>
              )}
            </div>
            <div>
              <label className="label">필요일</label>
              <input className="input" type="date"
                value={orderForm.required_date}
                onChange={e => setOrderForm(f => ({ ...f, required_date: e.target.value }))} />
            </div>
            <div>
              <label className="label">비고</label>
              <textarea className="input resize-none h-16"
                value={orderForm.notes}
                onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            {orderErr && <p className="text-red-600 text-sm">⚠️ {orderErr}</p>}
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setOrderTarget(null)}>취소</button>
              <button
                className={`flex-1 py-2 px-4 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${needsApproval ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                onClick={submitOrder}
                disabled={orderSaving}
              >
                {orderSaving ? '처리 중...' : needsApproval ? '결재 요청' : '발주 확정'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── 갱신 모달 ── */}
      <Modal isOpen={!!renewTarget} onClose={() => setRenewTarget(null)} title="계약 갱신" size="sm">
        {renewTarget && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm space-y-1">
              <p><strong>품목:</strong> {renewTarget.item_name}</p>
              <p><strong>납품사:</strong> {(renewTarget.supplier as { name: string } | null)?.name ?? '-'}</p>
              <p><strong>현재 단가:</strong> {renewTarget.unit_price.toLocaleString()}원</p>
              <p><strong>현재 계약 종료:</strong> {renewTarget.end_date}
                <span className={`ml-2 text-xs font-semibold ${
                  daysLeft(renewTarget.end_date) <= 7 ? 'text-red-600' : 'text-orange-500'
                }`}>
                  ({daysLeft(renewTarget.end_date)}일 남음)
                </span>
              </p>
            </div>

            {/* 갱신 기간 선택 */}
            <div>
              <label className="label">갱신 기간 *</label>
              <div className="flex gap-2 mt-1">
                {([['6m', '6개월'], ['1y', '1년']] as const).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setRenewPeriod(key)}
                    className={`flex-1 py-2.5 text-sm rounded-lg border font-medium transition-colors ${
                      renewPeriod === key
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-green-600 border-green-300 hover:bg-green-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {renewPreviewDate && (
                <p className="text-xs text-gray-500 mt-1.5">
                  새 계약: <strong>{toDateStr(new Date())}</strong> ~ <strong>{renewPreviewDate}</strong>
                </p>
              )}
            </div>

            {/* 단가 변경 */}
            <div>
              <label className="label">단가 변경 (미입력 시 현재 단가 유지)</label>
              <input className="input" type="number" min="1"
                placeholder={`현재: ${renewTarget.unit_price.toLocaleString()}원`}
                value={renewPrice}
                onChange={e => setRenewPrice(e.target.value)} />
              {renewPrice && Number(renewPrice) !== renewTarget.unit_price && (
                <p className={`text-xs mt-1 font-medium ${
                  Number(renewPrice) < renewTarget.unit_price ? 'text-green-600' : 'text-red-500'
                }`}>
                  {Number(renewPrice) < renewTarget.unit_price ? '▼ 단가 인하' : '▲ 단가 인상'}
                  &nbsp;({Math.abs(Number(renewPrice) - renewTarget.unit_price).toLocaleString()}원)
                </p>
              )}
            </div>

            {renewErr && <p className="text-red-600 text-sm">⚠️ {renewErr}</p>}
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setRenewTarget(null)}>취소</button>
              <button
                onClick={submitRenew}
                disabled={!renewPeriod || renewSaving}
                className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {renewSaving ? '처리 중...' : '갱신 확정'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { Order, Profile } from '@/lib/types';

const toDateStr = (d: Date) => d.toISOString().slice(0, 10);

const FLOW_ADMIN:    Record<string, string> = { ordered:'processing', processing:'shipped', shipped:'delivered' };
const FLOW_SUPPLIER: Record<string, string> = { ordered:'shipped', processing:'shipped', shipped:'delivered' };

const LABEL_ADMIN:    Record<string, string> = { ordered:'처리중으로', processing:'배송중으로', shipped:'납품완료로' };
const LABEL_SUPPLIER: Record<string, string> = { ordered:'배송중으로 변경', processing:'배송중으로 변경', shipped:'납품완료 처리' };

const SEEN_KEY = (userId: string) => `approval_seen_at_${userId}`;

const needsApproval = (o: Order) =>
  o.approval_status === '결재대기' || o.approval_status === '반려';

export default function OrdersPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders]   = useState<Order[]>([]);
  const [filter, setFilter]   = useState('all');

  /* 상태변경 모달 */
  const [target, setTarget]     = useState<Order | null>(null);
  const [delivDate, setDelivDate] = useState('');

  /* 재신청 모달 */
  const [resubmitTarget, setResubmitTarget] = useState<Order | null>(null);
  const [resubmitQty, setResubmitQty]       = useState('');
  const [resubmitNotes, setResubmitNotes]   = useState('');
  const [resubmitting, setResubmitting]     = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    setProfile(session);
  }, []);

  const isSupplier     = profile?.role === '납품협력사';
  const isApprover     = profile?.role === '직영관리자' || (profile?.role === '직영' && (profile?.is_approver ?? false));
  const isDirectWorker = profile?.role === '직영' && !(profile?.is_approver ?? false);

  const statusFlow  = isSupplier ? FLOW_SUPPLIER  : FLOW_ADMIN;
  const statusLabel = isSupplier ? LABEL_SUPPLIER : LABEL_ADMIN;

  /* 발주 목록 로드 */
  const load = useCallback(async () => {
    if (!profile) return;

    let query = supabase
      .from('orders')
      .select('*, orderer:profiles!ordered_by(name)')
      .order('created_at', { ascending: false });

    /* 납품협력사: 본인 회사 발주만 */
    if (profile.role === '납품협력사' && profile.company_id) {
      query = query.eq('supplier_id', profile.company_id);
    }

    /* 비결재자 직영 / 사용협력사: 본인이 요청한 발주만 */
    if (isDirectWorker || profile.role === '사용협력사') {
      query = query.eq('ordered_by', profile.id);
    }

    const { data } = await query;
    const rawOrders = (data ?? []) as Order[];

    /* supplier_id(companies.id) → profiles.name(납품협력사 업체명) 매핑 */
    if (rawOrders.length > 0) {
      const supplierIds = [...new Set(
        rawOrders.map(o => o.supplier_id).filter((id): id is number => id != null)
      )];
      const { data: profileData } = await supabase
        .from('profiles')
        .select('name, company_id')
        .in('company_id', supplierIds)
        .eq('role', '납품협력사');

      const supplierNameMap: Record<number, string> = {};
      (profileData ?? []).forEach((p: { name: string; company_id: number }) => {
        supplierNameMap[p.company_id] = p.name;
      });

      setOrders(rawOrders.map(o => ({
        ...o,
        supplier: o.supplier_id != null
          ? { name: supplierNameMap[o.supplier_id] ?? '-' }
          : null,
      })));
    } else {
      setOrders([]);
    }

    /* 비결재자 직영: 발주 현황 방문 시 알림 읽음 처리 */
    if (isDirectWorker) {
      localStorage.setItem(SEEN_KEY(profile.id), new Date().toISOString());
    }
  }, [profile, isDirectWorker]);

  useEffect(() => { load(); }, [load]);

  /* 상태 변경 모달 열기 */
  const openModal = (o: Order) => {
    setTarget(o);
    setDelivDate(statusFlow[o.status] === 'delivered' ? toDateStr(new Date()) : '');
  };

  /* 상태 업데이트 */
  const updateStatus = async () => {
    if (!target) return;
    const next = statusFlow[target.status];
    const update: Record<string, unknown> = { status: next };
    if (next === 'delivered') update.delivery_date = delivDate || toDateStr(new Date());
    await supabase.from('orders').update(update).eq('id', target.id);
    setTarget(null);
    load();
  };

  /* 재신청 */
  const openResubmit = (o: Order) => {
    setResubmitTarget(o);
    setResubmitQty(String(o.quantity));
    setResubmitNotes(o.notes ?? '');
  };

  const submitResubmit = async () => {
    if (!resubmitTarget) return;
    setResubmitting(true);
    const newQty    = Math.max(1, Number(resubmitQty) || resubmitTarget.quantity);
    const newTotal  = newQty * Number(resubmitTarget.unit_price);

    await supabase
      .from('orders')
      .update({
        approval_status:  '결재대기',
        rejection_reason: null,
        approver_id:      null,
        approval_date:    null,
        quantity:         newQty,
        total_price:      newTotal,
        notes:            resubmitNotes || null,
      })
      .eq('id', resubmitTarget.id);

    setResubmitTarget(null);
    setResubmitting(false);
    load();
  };

  /* 필터 */
  const isSaUser = profile?.role === '사용협력사';
  const STATUSES = isSaUser
    ? ['all', 'ordered', 'processing', 'shipped', 'delivered', 'cancelled']
    : ['all', 'ordered', 'processing', 'shipped', 'delivered', 'cancelled', '결재대기', '반려'];
  const SLABELS: Record<string, string> = {
    all:'전체', ordered:'발주완료', processing:'처리중',
    shipped:'배송중', delivered:'납품완료', cancelled:'취소',
    '결재대기': '결재대기', '반려': '반려',
  };

  const countFor = (s: string) => {
    if (s === '결재대기') return orders.filter(o => o.approval_status === '결재대기').length;
    if (s === '반려')     return orders.filter(o => o.approval_status === '반려').length;
    return orders.filter(o => o.status === s).length;
  };

  const filtered = orders.filter(o => {
    if (filter === 'all')      return true;
    if (filter === '결재대기') return o.approval_status === '결재대기';
    if (filter === '반려')     return o.approval_status === '반려';
    return o.status === filter;
  });

  /* 처리 버튼: 결재자 직영 or 납품협력사 or 마스터관리자 */
  const canProcess = isApprover || isSupplier || profile?.role === '마스터관리자';

  const myPendingCount = isDirectWorker
    ? orders.filter(o => o.approval_status === '결재대기').length
    : 0;
  const myRejectedCount = isDirectWorker
    ? orders.filter(o => o.approval_status === '반려').length
    : 0;

  return (
    <div className="space-y-4">

      {/* 납품협력사 안내 */}
      {isSupplier && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-sm text-purple-800 flex items-center gap-2">
          <span>🏢</span>
          <span>본인 회사로 접수된 발주 건만 표시됩니다. 발주접수 → 배송중 → 납품완료 순으로 처리해 주세요.</span>
        </div>
      )}

      {/* 비결재자 직영: 결재 대기 안내 */}
      {isDirectWorker && myPendingCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-800 flex items-center gap-2">
          <span>⏳</span>
          <span>결재 대기 중인 발주 <strong>{myPendingCount}건</strong>이 있습니다. 결재자 승인 후 발주가 확정됩니다.</span>
        </div>
      )}

      {/* 비결재자 직영: 반려 안내 */}
      {isDirectWorker && myRejectedCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 flex items-center gap-2">
          <span>❌</span>
          <span>반려된 발주 <strong>{myRejectedCount}건</strong>이 있습니다. 반려 사유를 확인 후 수정하여 재신청하세요.</span>
        </div>
      )}

      {/* 상태 필터 */}
      <div className="flex gap-2 flex-wrap">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              filter === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
            }`}>
            {SLABELS[s]}
            {s !== 'all' && (
              <span className="ml-1.5 text-xs opacity-70">{countFor(s)}</span>
            )}
          </button>
        ))}
      </div>

      {/* 발주 목록 테이블 */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="table-th">발주번호</th>
              <th className="table-th">품목명</th>
              <th className="table-th">수량</th>
              <th className="table-th">단가/총액</th>
              <th className="table-th">납품사</th>
              <th className="table-th">요청일</th>
              <th className="table-th">유형</th>
              <th className="table-th">상태</th>
              {(canProcess || isDirectWorker) && <th className="table-th">처리</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={(canProcess || isDirectWorker) ? 9 : 8}
                    className="table-td text-center text-gray-400 py-8">
                  발주 내역이 없습니다.
                </td>
              </tr>
            )}
            {filtered.map(o => {
              const isPending  = o.approval_status === '결재대기';
              const isRejected = o.approval_status === '반려';
              const isApprovalNeeded = needsApproval(o);
              const isMyOrder  = o.ordered_by === profile?.id;

              return (
                <>
                  <tr
                    key={o.id}
                    className={`border-t border-gray-100 hover:bg-gray-50 ${
                      isPending  ? 'bg-orange-50/40' :
                      isRejected ? 'bg-red-50/40' : ''
                    }`}
                  >
                    <td className="table-td font-mono text-xs text-gray-500">{o.order_no}</td>
                    <td className="table-td font-medium">{o.item_name}</td>
                    <td className="table-td">{o.quantity.toLocaleString()}</td>
                    <td className="table-td">
                      <span className="font-medium">{Number(o.unit_price).toLocaleString()}원</span>
                      <span className="text-xs text-gray-400 ml-1">({Number(o.total_price).toLocaleString()}원)</span>
                    </td>
                    <td className="table-td">{(o.supplier as { name: string } | null)?.name ?? '-'}</td>
                    <td className="table-td text-sm text-gray-500">{o.required_date ?? '-'}</td>
                    <td className="table-td">
                      {o.is_auto
                        ? <span className="inline-block px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">자동발주</span>
                        : <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">일반</span>
                      }
                    </td>
                    <td className="table-td">
                      <div className="flex flex-col gap-1">
                        {isApprovalNeeded
                          ? <StatusBadge status={o.approval_status!} />
                          : <StatusBadge status={o.status} />
                        }
                      </div>
                    </td>
                    {(canProcess || isDirectWorker) && (
                      <td className="table-td">
                        {/* 비결재자 직영: 재신청 버튼 (반려된 본인 발주만) */}
                        {isDirectWorker && isRejected && isMyOrder ? (
                          <button
                            onClick={() => openResubmit(o)}
                            className="px-2.5 py-1 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors whitespace-nowrap"
                          >
                            재신청
                          </button>
                        ) : isDirectWorker && isPending ? (
                          <span className="text-xs text-orange-500 font-medium">결재 대기중</span>
                        ) : canProcess && !isApprovalNeeded ? (
                          o.status === 'delivered' ? (
                            <span className="text-xs font-semibold text-green-600">✓ 완료</span>
                          ) : statusFlow[o.status] ? (
                            <button
                              onClick={() => openModal(o)}
                              className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors whitespace-nowrap"
                            >
                              {statusLabel[o.status]}
                            </button>
                          ) : canProcess && isPending ? (
                            <span className="text-xs text-orange-500 font-medium">결재 대기중</span>
                          ) : canProcess && isRejected ? (
                            <span className="text-xs text-red-500 font-medium">반려됨</span>
                          ) : null
                        ) : null}
                      </td>
                    )}
                  </tr>

                  {/* 반려 사유 서브행 */}
                  {isRejected && o.rejection_reason && (
                    <tr key={`${o.id}-rej`} className="bg-red-50/60 border-t-0">
                      <td colSpan={(canProcess || isDirectWorker) ? 9 : 8} className="px-4 pb-2.5 pt-0">
                        <div className="flex items-start gap-1.5 text-xs text-red-700">
                          <span className="mt-0.5 shrink-0">↳</span>
                          <span><strong>반려 사유:</strong> {o.rejection_reason}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 상태 변경 모달 */}
      <Modal isOpen={!!target} onClose={() => setTarget(null)} title="발주 상태 변경" size="sm">
        {target && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm space-y-1">
              <p><strong>품목:</strong> {target.item_name}</p>
              <p><strong>현재 상태:</strong> <StatusBadge status={target.status} /></p>
              <p><strong>변경 상태:</strong>{' '}
                <span className="font-semibold text-blue-700">
                  {statusLabel[target.status]?.replace('로', '').replace(' 변경', '').replace(' 처리', '')}
                </span>
              </p>
            </div>
            {statusFlow[target.status] === 'delivered' && (
              <div>
                <label className="label">납품 완료일</label>
                <input className="input" type="date" value={delivDate} onChange={e => setDelivDate(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">미입력 시 오늘({toDateStr(new Date())}) 자동 기록</p>
              </div>
            )}
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setTarget(null)}>취소</button>
              <button className="btn-primary flex-1" onClick={updateStatus}>상태 변경</button>
            </div>
          </div>
        )}
      </Modal>

      {/* 재신청 모달 */}
      <Modal isOpen={!!resubmitTarget} onClose={() => setResubmitTarget(null)} title="발주 재신청" size="sm">
        {resubmitTarget && (
          <div className="space-y-4">
            {/* 반려 사유 표시 */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-red-700 mb-1">반려 사유</p>
              <p className="text-red-600">{resubmitTarget.rejection_reason ?? '-'}</p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1">
              <p><strong>품목:</strong> {resubmitTarget.item_name}</p>
              <p><strong>단가:</strong> {Number(resubmitTarget.unit_price).toLocaleString()}원</p>
            </div>

            <div>
              <label className="label">수량 수정</label>
              <input
                className="input"
                type="number"
                min="1"
                value={resubmitQty}
                onChange={e => setResubmitQty(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">
                총액: {(Math.max(1, Number(resubmitQty) || 1) * Number(resubmitTarget.unit_price)).toLocaleString()}원
              </p>
            </div>

            <div>
              <label className="label">비고</label>
              <textarea
                className="input resize-none h-20"
                value={resubmitNotes}
                onChange={e => setResubmitNotes(e.target.value)}
                placeholder="변경 내용이나 추가 사항을 입력하세요"
              />
            </div>

            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setResubmitTarget(null)}>취소</button>
              <button
                className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
                onClick={submitResubmit}
                disabled={resubmitting}
              >
                {resubmitting ? '처리중...' : '재신청'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

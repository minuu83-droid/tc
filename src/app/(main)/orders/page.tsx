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

/* 발주의 표시 상태 결정 */
const displayApprovalStatus = (o: Order) => {
  if (!o.approval_status || o.approval_status === '승인') return null;
  return o.approval_status; // '결재대기' | '반려'
};

export default function OrdersPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders]   = useState<Order[]>([]);
  const [filter, setFilter]   = useState('all');
  const [target, setTarget]   = useState<Order | null>(null);
  const [delivDate, setDelivDate] = useState('');

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    setProfile(session);
  }, []);

  const isSupplier     = profile?.role === '납품협력사';
  const isBuyer        = profile?.role === '사용협력사';
  const isApprover     = profile?.role === '직영' && profile?.is_approver;
  const isDirectWorker = profile?.role === '직영' && !profile?.is_approver;

  const statusFlow  = isSupplier ? FLOW_SUPPLIER  : FLOW_ADMIN;
  const statusLabel = isSupplier ? LABEL_SUPPLIER : LABEL_ADMIN;

  /* 발주 목록 로드 */
  const load = useCallback(async () => {
    if (!profile) return;
    let query = supabase
      .from('orders')
      .select('*, orderer:profiles!ordered_by(name), supplier:companies!supplier_id(name)')
      .order('created_at', { ascending: false });

    if (profile.role === '납품협력사' && profile.company_id) {
      query = query.eq('supplier_id', profile.company_id);
    }

    const { data } = await query;
    setOrders((data ?? []) as Order[]);

    /* 직영 일반 사용자: 발주 현황 방문 시 알림 읽음 처리 */
    if (isDirectWorker) {
      localStorage.setItem(SEEN_KEY(profile.id), new Date().toISOString());
    }
  }, [profile, isDirectWorker]);

  useEffect(() => { load(); }, [load]);

  const openModal = (o: Order) => {
    const next = statusFlow[o.status];
    setTarget(o);
    setDelivDate(next === 'delivered' ? toDateStr(new Date()) : '');
  };

  const updateStatus = async () => {
    if (!target) return;
    const next = statusFlow[target.status];
    const update: Record<string, unknown> = { status: next };
    if (next === 'delivered') {
      update.delivery_date = delivDate || toDateStr(new Date());
    }
    await supabase.from('orders').update(update).eq('id', target.id);
    setTarget(null);
    load();
  };

  /* 필터링 */
  const STATUSES = ['all', 'ordered', 'processing', 'shipped', 'delivered', 'cancelled', '결재대기', '반려'];
  const SLABELS: Record<string, string> = {
    all:'전체', ordered:'발주완료', processing:'처리중',
    shipped:'배송중', delivered:'납품완료', cancelled:'취소',
    '결재대기': '결재대기', '반려': '반려',
  };

  const filtered = orders.filter(o => {
    if (filter === 'all')      return true;
    if (filter === '결재대기') return o.approval_status === '결재대기';
    if (filter === '반려')     return o.approval_status === '반려';
    return o.status === filter;
  });

  /* 처리 버튼 표시 조건: 결재자 직영 또는 납품협력사, 마스터관리자 */
  const canProcess = isApprover || isSupplier || profile?.role === '마스터관리자';

  /* 결재대기 건수 (직영 일반) */
  const myPendingCount = isDirectWorker
    ? orders.filter(o => o.ordered_by === profile?.id && o.approval_status === '결재대기').length
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

      {/* 직영 일반: 결재대기 안내 */}
      {isDirectWorker && myPendingCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-800 flex items-center gap-2">
          <span>⏳</span>
          <span>결재 대기 중인 발주 <strong>{myPendingCount}건</strong>이 있습니다. 결재자 승인 후 발주가 확정됩니다.</span>
        </div>
      )}

      {/* 반려된 내 발주 알림 */}
      {isDirectWorker && orders.some(o => o.ordered_by === profile?.id && o.approval_status === '반려') && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 flex items-center gap-2">
          <span>❌</span>
          <span>반려된 발주가 있습니다. 반려 사유를 확인하세요.</span>
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
              <span className="ml-1.5 text-xs opacity-70">
                {s === '결재대기'
                  ? orders.filter(o => o.approval_status === '결재대기').length
                  : s === '반려'
                  ? orders.filter(o => o.approval_status === '반려').length
                  : orders.filter(o => o.status === s).length}
              </span>
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
              {canProcess && <th className="table-th">처리</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={canProcess ? 9 : 8} className="table-td text-center text-gray-400 py-8">
                  발주 내역이 없습니다.
                </td>
              </tr>
            )}
            {filtered.map(o => {
              const approvalDisp = displayApprovalStatus(o);
              const isPending    = o.approval_status === '결재대기';
              const isRejected   = o.approval_status === '반려';

              return (
                <>
                  <tr key={o.id} className={`border-t border-gray-100 hover:bg-gray-50 ${isPending ? 'bg-orange-50/40' : isRejected ? 'bg-red-50/40' : ''}`}>
                    <td className="table-td font-mono text-xs text-gray-500">{o.order_no}</td>
                    <td className="table-td font-medium">{o.item_name}</td>
                    <td className="table-td">{o.quantity.toLocaleString()}</td>
                    <td className="table-td">
                      <span className="font-medium">{o.unit_price.toLocaleString()}원</span>
                      <span className="text-xs text-gray-400 ml-1">({o.total_price.toLocaleString()}원)</span>
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
                        {approvalDisp
                          ? <StatusBadge status={approvalDisp} />
                          : <StatusBadge status={o.status} />
                        }
                        {/* 승인 후 발주완료 표시 */}
                        {o.approval_status === '승인' && (
                          <StatusBadge status={o.status} />
                        )}
                      </div>
                    </td>
                    {canProcess && (
                      <td className="table-td">
                        {isPending ? (
                          <span className="text-xs text-orange-500 font-medium">결재 대기중</span>
                        ) : isRejected ? (
                          <span className="text-xs text-red-500 font-medium">반려됨</span>
                        ) : o.status === 'delivered' ? (
                          <span className="text-xs font-semibold text-green-600">✓ 완료</span>
                        ) : statusFlow[o.status] ? (
                          <button
                            onClick={() => openModal(o)}
                            className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors whitespace-nowrap"
                          >
                            {statusLabel[o.status]}
                          </button>
                        ) : null}
                      </td>
                    )}
                  </tr>

                  {/* 반려 사유 서브행 */}
                  {isRejected && o.rejection_reason && (
                    <tr key={`${o.id}-rejection`} className="bg-red-50 border-t-0">
                      <td colSpan={canProcess ? 9 : 8} className="px-4 pb-2.5 pt-0">
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
                <p className="text-xs text-gray-400 mt-1">미입력 시 오늘 날짜({toDateStr(new Date())})로 자동 기록됩니다.</p>
              </div>
            )}
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setTarget(null)}>취소</button>
              <button className="btn-primary flex-1" onClick={updateStatus}>상태 변경</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

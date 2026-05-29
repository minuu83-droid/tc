'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import type { Profile, Order } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';

type Tab = 'pending' | 'history';

type OrderWithRequester = Order & {
  orderer: { name: string } | null;
  supplier: { name: string } | null;
};

export default function ApprovalPage() {
  const router = useRouter();
  const [profile, setProfile]         = useState<Profile | null>(null);
  const [orders, setOrders]           = useState<OrderWithRequester[]>([]);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState<Tab>('pending');
  const [rejectTarget, setRejectTarget] = useState<OrderWithRequester | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing]   = useState<Record<number, boolean>>({});
  const [error, setError]             = useState('');

  /* 결재자(tc101)만 접근 */
  useEffect(() => {
    const session = getSession();
    if (!session) { router.push('/login'); return; }
    if (session.role !== '직영관리자' && (session.role !== '직영' || !session.is_approver)) { router.push('/dashboard'); return; }
    setProfile(session);
  }, [router]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('orders')
      .select('*, orderer:profiles!ordered_by(name), supplier:companies!supplier_id(name)')
      .neq('approval_status', '미해당')
      .order('created_at', { ascending: false });

    if (err) {
      setError(`데이터 조회 실패: ${err.message}`);
    } else {
      setOrders((data ?? []) as OrderWithRequester[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (profile) fetchOrders(); }, [profile, fetchOrders]);

  /* 승인 처리 */
  const approve = async (order: OrderWithRequester) => {
    if (!profile) return;
    setProcessing(m => ({ ...m, [order.id]: true }));
    setError('');

    const { error: err } = await supabase
      .from('orders')
      .update({
        approval_status: '승인',
        approver_id:     profile.id,
        approval_date:   new Date().toISOString(),
      })
      .eq('id', order.id);

    if (err) {
      setError(`승인 실패: ${err.message}`);
    } else {
      fetchOrders();
    }
    setProcessing(m => ({ ...m, [order.id]: false }));
  };

  /* 반려 처리 */
  const reject = async () => {
    if (!profile || !rejectTarget) return;
    if (!rejectReason.trim()) { setError('반려 사유를 입력하세요.'); return; }
    setProcessing(m => ({ ...m, [rejectTarget.id]: true }));
    setError('');

    const { error: err } = await supabase
      .from('orders')
      .update({
        approval_status:  '반려',
        rejection_reason: rejectReason.trim(),
        approver_id:      profile.id,
        approval_date:    new Date().toISOString(),
      })
      .eq('id', rejectTarget.id);

    if (err) {
      setError(`반려 처리 실패: ${err.message}`);
    } else {
      setRejectTarget(null);
      setRejectReason('');
      fetchOrders();
    }
    setProcessing(m => ({ ...m, [rejectTarget.id]: false }));
  };

  const pending = orders.filter(o => o.approval_status === '결재대기');
  const history = orders.filter(o => o.approval_status !== '결재대기');

  const displayList = tab === 'pending' ? pending : history;

  if (!profile || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 animate-pulse">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">결재 관리</h2>
          <p className="text-sm text-gray-500 mt-1">직영 팀원들의 발주 요청을 승인하거나 반려합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          {pending.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
              <span>⏳</span>
              결재 대기 {pending.length}건
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <span>⚠️</span>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="underline text-xs">닫기</button>
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab('pending')}
          className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'pending'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          결재 대기
          {pending.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-orange-500 text-white text-[10px] font-bold rounded-full">
              {pending.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'history'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          결재 이력
          <span className="ml-1.5 text-xs text-gray-400">({history.length})</span>
        </button>
      </div>

      {/* 목록 */}
      {displayList.length === 0 ? (
        <div className="card text-center py-16 text-sm text-gray-400">
          {tab === 'pending' ? '결재 대기 중인 발주가 없습니다.' : '결재 이력이 없습니다.'}
        </div>
      ) : (
        <div className="space-y-3">
          {displayList.map(order => (
            <div
              key={order.id}
              className={`card p-5 ${
                order.approval_status === '결재대기' ? 'border-l-4 border-l-orange-400' :
                order.approval_status === '승인'    ? 'border-l-4 border-l-green-400' :
                'border-l-4 border-l-red-400'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                {/* 발주 정보 */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{order.item_name}</span>
                    <StatusBadge status={order.approval_status ?? 'pending'} />
                    {order.approval_status === '승인' && (
                      <StatusBadge status={order.status} />
                    )}
                    {order.is_auto && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">자동발주</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-sm text-gray-600">
                    <div>
                      <span className="text-xs text-gray-400">요청자</span>
                      <p className="font-medium">{order.orderer?.name ?? '-'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">납품사</span>
                      <p className="font-medium">{order.supplier?.name ?? '-'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">수량 / 단가</span>
                      <p className="font-medium">{order.quantity.toLocaleString()} / {order.unit_price.toLocaleString()}원</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">총액</span>
                      <p className="font-medium text-blue-700">{order.total_price.toLocaleString()}원</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>발주번호: {order.order_no}</span>
                    <span>요청일: {order.required_date ?? '-'}</span>
                    <span>등록: {order.created_at.slice(0, 10)}</span>
                  </div>

                  {/* 반려 사유 표시 */}
                  {order.approval_status === '반려' && order.rejection_reason && (
                    <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
                      <span>↳</span>
                      <span><strong>반려 사유:</strong> {order.rejection_reason}</span>
                    </div>
                  )}
                </div>

                {/* 결재 버튼 (대기 중인 경우만) */}
                {order.approval_status === '결재대기' && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => approve(order)}
                      disabled={processing[order.id]}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                    >
                      {processing[order.id] ? '처리중...' : '✓ 승인'}
                    </button>
                    <button
                      onClick={() => { setRejectTarget(order); setRejectReason(''); setError(''); }}
                      disabled={processing[order.id]}
                      className="px-4 py-2 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-700 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                    >
                      ✕ 반려
                    </button>
                  </div>
                )}

                {/* 이력: 처리 일시 */}
                {order.approval_status !== '결재대기' && order.approval_date && (
                  <div className="text-right text-xs text-gray-400 shrink-0">
                    <p>처리일: {order.approval_date.slice(0, 10)}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 반려 사유 입력 모달 */}
      <Modal
        isOpen={!!rejectTarget}
        onClose={() => { setRejectTarget(null); setRejectReason(''); setError(''); }}
        title="발주 반려"
        size="sm"
      >
        {rejectTarget && (
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1">
              <p><strong>품목:</strong> {rejectTarget.item_name}</p>
              <p><strong>요청자:</strong> {rejectTarget.orderer?.name ?? '-'}</p>
              <p><strong>총액:</strong> {rejectTarget.total_price.toLocaleString()}원</p>
            </div>
            <div>
              <label className="label">반려 사유 *</label>
              <textarea
                className="input resize-none h-24"
                value={rejectReason}
                onChange={e => { setRejectReason(e.target.value); setError(''); }}
                placeholder="반려 사유를 입력하세요. 요청자에게 표시됩니다."
              />
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <div className="flex gap-3">
              <button
                className="btn-secondary flex-1"
                onClick={() => { setRejectTarget(null); setRejectReason(''); setError(''); }}
              >
                취소
              </button>
              <button
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                onClick={reject}
                disabled={processing[rejectTarget.id]}
              >
                {processing[rejectTarget.id] ? '처리중...' : '반려 처리'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

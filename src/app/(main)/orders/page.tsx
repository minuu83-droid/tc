'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { Order, Profile } from '@/lib/types';

const STATUS_FLOW: Record<string, string> = { ordered:'processing', processing:'shipped', shipped:'delivered' };
const STATUS_LABEL: Record<string, string> = { ordered:'처리중으로', processing:'배송중으로', shipped:'납품완료로' };

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

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, orderer:profiles!ordered_by(name), supplier:companies!supplier_id(name)')
      .order('created_at', { ascending: false });
    setOrders((data ?? []) as Order[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async () => {
    if (!target) return;
    const next = STATUS_FLOW[target.status];
    const update: Record<string, unknown> = { status: next };
    if (next === 'delivered') update.delivery_date = delivDate;
    await supabase.from('orders').update(update).eq('id', target.id);
    setTarget(null); load();
  };

  const STATUSES = ['all','ordered','processing','shipped','delivered','cancelled'];
  const SLABELS: Record<string,string> = { all:'전체', ordered:'발주완료', processing:'처리중', shipped:'배송중', delivered:'납품완료', cancelled:'취소' };
  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${filter===s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'}`}>
            {SLABELS[s]}
            {s !== 'all' && <span className="ml-1.5 text-xs opacity-70">{orders.filter(o => o.status===s).length}</span>}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="table-th">발주번호</th><th className="table-th">품목명</th>
              <th className="table-th">수량</th><th className="table-th">단가/총액</th>
              <th className="table-th">납품사</th><th className="table-th">요청일</th>
              <th className="table-th">유형</th><th className="table-th">상태</th>
              {profile?.role !== '사용협력사' && <th className="table-th">처리</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={9} className="table-td text-center text-gray-400 py-8">발주 내역이 없습니다.</td></tr>}
            {filtered.map(o => (
              <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="table-td font-mono text-xs text-gray-500">{o.order_no}</td>
                <td className="table-td font-medium">{o.item_name}</td>
                <td className="table-td">{o.quantity.toLocaleString()}</td>
                <td className="table-td">
                  <span className="font-medium">{o.unit_price.toLocaleString()}원</span>
                  <span className="text-xs text-gray-400 ml-1">({o.total_price.toLocaleString()}원)</span>
                </td>
                <td className="table-td">{(o.supplier as {name:string}|null)?.name ?? '-'}</td>
                <td className="table-td text-sm text-gray-500">{o.required_date ?? '-'}</td>
                <td className="table-td">
                  {o.is_auto
                    ? <span className="inline-block px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">자동발주</span>
                    : <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">일반</span>}
                </td>
                <td className="table-td"><StatusBadge status={o.status} /></td>
                {profile?.role !== '사용협력사' && (
                  <td className="table-td">
                    {STATUS_FLOW[o.status] && (
                      <button onClick={() => { setTarget(o); setDelivDate(''); }}
                        className="text-sm text-blue-600 hover:underline">
                        {STATUS_LABEL[o.status]}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={!!target} onClose={() => setTarget(null)} title="발주 상태 변경" size="sm">
        {target && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              <strong>{target.item_name}</strong>을(를) <strong className="text-blue-600">{STATUS_LABEL[target.status]?.replace('로','')}</strong> 변경합니다.
            </p>
            {STATUS_FLOW[target.status] === 'delivered' && (
              <div>
                <label className="label">납품 완료일 *</label>
                <input className="input" type="date" value={delivDate} onChange={e => setDelivDate(e.target.value)} />
              </div>
            )}
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setTarget(null)}>취소</button>
              <button className="btn-primary flex-1" onClick={updateStatus}>확인</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

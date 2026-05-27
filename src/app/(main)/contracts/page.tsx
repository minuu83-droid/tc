'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { Contract, Profile } from '@/lib/types';

export default function ContractsPage() {
  const [profile, setProfile]     = useState<Profile | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [filter, setFilter]       = useState('all');
  const [termModal, setTermModal] = useState<Contract | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    setProfile(session);
  }, []);

  const load = useCallback(async () => {
    if (!profile) return;
    await supabase.rpc('expire_contracts');
    let query = supabase
      .from('contracts')
      .select('*, supplier:companies!supplier_id(name)')
      .order('created_at', { ascending: false });

    // 납품협력사: 본인 회사(supplier_id)가 낙찰된 계약만 표시
    if (profile.role === '납품협력사' && profile.company_id) {
      query = query.eq('supplier_id', profile.company_id);
    }

    const { data } = await query;
    setContracts((data ?? []) as Contract[]);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const terminate = async () => {
    if (!termModal) return;
    await supabase.from('contracts').update({ status: 'terminated' }).eq('id', termModal.id);
    if (termModal.item_id) {
      const { count } = await supabase
        .from('contracts')
        .select('*', { count: 'exact', head: true })
        .eq('item_id', termModal.item_id)
        .eq('status', 'active')
        .neq('id', termModal.id);
      if (!count) {
        await supabase.from('items').update({ has_contract: false }).eq('id', termModal.item_id);
      }
    }
    setTermModal(null); load();
  };

  const statuses = ['all', 'active', 'expired', 'terminated'];
  const statusLabels: Record<string, string> = { all: '전체', active: '계약중', expired: '만료', terminated: '해지' };
  const filtered = filter === 'all' ? contracts : contracts.filter(c => c.status === filter);

  const totalSavings = contracts.filter(c => c.status === 'active').reduce((s, c) => s + (c.estimated_savings ?? 0), 0);
  const activeCount = contracts.filter(c => c.status === 'active').length;

  const daysLeft = (end: string) => {
    const ms = new Date(end).getTime() - Date.now();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 mb-2">
        <div className="card p-4 border-l-4 border-green-400">
          <p className="text-sm text-gray-500">유효 계약</p>
          <p className="text-2xl font-bold text-gray-900">{activeCount}건</p>
        </div>
        <div className="card p-4 border-l-4 border-purple-400">
          <p className="text-sm text-gray-500">누적 절감액</p>
          <p className="text-2xl font-bold text-gray-900">{totalSavings.toLocaleString()}원</p>
        </div>
        <div className="card p-4 border-l-4 border-orange-400">
          <p className="text-sm text-gray-500">30일내 만료</p>
          <p className="text-2xl font-bold text-gray-900">
            {contracts.filter(c => c.status === 'active' && daysLeft(c.end_date) <= 30 && daysLeft(c.end_date) > 0).length}건
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              filter === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
            }`}>
            {statusLabels[s]}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="table-th">품목명</th>
              <th className="table-th">납품사</th>
              <th className="table-th">계약단가</th>
              <th className="table-th">이전단가</th>
              <th className="table-th">절감액</th>
              <th className="table-th">계약기간</th>
              <th className="table-th">잔여일</th>
              <th className="table-th">상태</th>
              {(profile?.role === '직영' || profile?.role === '마스터관리자') && <th className="table-th">관리</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="table-td text-center text-gray-400 py-8">계약 내역이 없습니다.</td></tr>
            )}
            {filtered.map(c => {
              const days = daysLeft(c.end_date);
              const isExpiringSoon = c.status === 'active' && days <= 30 && days > 0;
              return (
                <tr key={c.id} className={`border-t border-gray-100 hover:bg-gray-50 ${isExpiringSoon ? 'bg-orange-50' : ''}`}>
                  <td className="table-td font-medium">{c.item_name}</td>
                  <td className="table-td">{(c.supplier as { name: string } | null)?.name ?? '-'}</td>
                  <td className="table-td font-bold text-blue-700">{c.unit_price.toLocaleString()}원</td>
                  <td className="table-td text-gray-400">{c.prev_unit_price ? `${c.prev_unit_price.toLocaleString()}원` : '-'}</td>
                  <td className="table-td text-green-700 font-medium">
                    {c.estimated_savings > 0 ? `${c.estimated_savings.toLocaleString()}원` : '-'}
                  </td>
                  <td className="table-td text-sm">{c.start_date} ~ {c.end_date}</td>
                  <td className="table-td">
                    {c.status === 'active' ? (
                      <span className={`text-sm font-medium ${isExpiringSoon ? 'text-orange-600' : 'text-gray-600'}`}>
                        {days > 0 ? `${days}일` : '오늘 만료'}
                        {isExpiringSoon && ' ⚠️'}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="table-td"><StatusBadge status={c.status} /></td>
                  {(profile?.role === '직영' || profile?.role === '마스터관리자') && (
                    <td className="table-td">
                      {c.status === 'active' && (
                        <button onClick={() => setTermModal(c)} className="text-sm text-red-500 hover:underline">해지</button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal isOpen={!!termModal} onClose={() => setTermModal(null)} title="계약 해지" size="sm">
        {termModal && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              <strong>{termModal.item_name}</strong>의 계약을 해지하시겠습니까?<br />
              해지 후에는 해당 품목의 자동발주가 중단됩니다.
            </p>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setTermModal(null)}>취소</button>
              <button className="btn-danger flex-1" onClick={terminate}>계약 해지</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

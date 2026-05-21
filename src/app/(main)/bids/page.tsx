'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import StatusBadge from '@/components/StatusBadge';
import { Profile, PurchaseRequest, Bid } from '@/lib/types';

export default function BidsPage() {
  const [profile, setProfile]     = useState<Profile | null>(null);
  const [requests, setRequests]   = useState<PurchaseRequest[]>([]);
  const [myBids, setMyBids]       = useState<(Bid & { item_name?: string; quantity?: number })[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: prof } = await supabase.from('profiles').select('*, company:companies(name)').eq('id', user.id).single();
      setProfile(prof as Profile);
      loadData(prof as Profile);
    });
  }, []);

  const loadData = async (prof: Profile) => {
    if (prof.role === '납품협력사') {
      const [{ data: reqs }, { data: bids }] = await Promise.all([
        supabase.from('purchase_requests').select('*, requester:profiles!requester_id(name)').eq('status','bidding').order('created_at',{ascending:false}),
        supabase.from('bids').select('*, request:purchase_requests!request_id(item_name, quantity)').eq('supplier_id', prof.company_id).order('submitted_at',{ascending:false}),
      ]);
      setRequests((reqs ?? []) as PurchaseRequest[]);
      const mapped = (bids ?? []).map((b: Record<string, unknown>) => ({
        ...(b as Bid),
        item_name: (b.request as { item_name: string } | null)?.item_name,
        quantity:  (b.request as { quantity: number } | null)?.quantity,
      }));
      setMyBids(mapped);
    } else {
      const { data } = await supabase
        .from('purchase_requests')
        .select('*, requester:profiles!requester_id(name), company:companies!company_id(name)')
        .eq('status','bidding')
        .order('created_at',{ascending:false});
      setRequests((data ?? []) as PurchaseRequest[]);
    }
  };

  if (!profile) return <div className="text-gray-400">로딩 중...</div>;

  return (
    <div className="space-y-6">
      {profile.role === '납품협력사' ? (
        <>
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">입찰 가능 품목</h3>
              <p className="text-sm text-gray-500 mt-0.5">구매 요청 페이지에서 세부 정보 확인 후 입찰 참여하세요.</p>
            </div>
            <table className="w-full">
              <thead><tr>
                <th className="table-th">품목명</th><th className="table-th">수량</th>
                <th className="table-th">필요일</th><th className="table-th">상태</th>
              </tr></thead>
              <tbody>
                {requests.length === 0 && <tr><td colSpan={4} className="table-td text-center text-gray-400 py-6">입찰 가능 품목 없음</td></tr>}
                {requests.map(r => (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="table-td font-medium">{r.item_name}</td>
                    <td className="table-td">{r.quantity} {r.unit}</td>
                    <td className="table-td">{r.required_date ?? '-'}</td>
                    <td className="table-td"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">내 입찰 이력</h3>
            </div>
            <table className="w-full">
              <thead><tr>
                <th className="table-th">품목명</th><th className="table-th">수량</th>
                <th className="table-th">내 단가</th><th className="table-th">총액</th>
                <th className="table-th">결과</th><th className="table-th">입찰일시</th>
              </tr></thead>
              <tbody>
                {myBids.length === 0 && <tr><td colSpan={6} className="table-td text-center text-gray-400 py-6">입찰 이력 없음</td></tr>}
                {myBids.map(b => (
                  <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="table-td font-medium">{b.item_name}</td>
                    <td className="table-td">{b.quantity}</td>
                    <td className="table-td font-bold">{b.unit_price.toLocaleString()}원</td>
                    <td className="table-td">{b.total_price.toLocaleString()}원</td>
                    <td className="table-td"><StatusBadge status={b.status} /></td>
                    <td className="table-td text-xs text-gray-500">{b.submitted_at?.slice(0,16) ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">입찰 진행중 구매 요청</h3>
            <p className="text-sm text-gray-500 mt-0.5">구매 요청 목록에서 낙찰 처리를 진행할 수 있습니다.</p>
          </div>
          <table className="w-full">
            <thead><tr>
              <th className="table-th">품목명</th><th className="table-th">수량</th>
              <th className="table-th">필요일</th><th className="table-th">요청자</th>
            </tr></thead>
            <tbody>
              {requests.length === 0 && <tr><td colSpan={4} className="table-td text-center text-gray-400 py-6">입찰 중인 항목 없음</td></tr>}
              {requests.map(r => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="table-td font-medium">{r.item_name}</td>
                  <td className="table-td">{r.quantity} {r.unit}</td>
                  <td className="table-td">{r.required_date ?? '-'}</td>
                  <td className="table-td">{(r.requester as {name:string}|null)?.name ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

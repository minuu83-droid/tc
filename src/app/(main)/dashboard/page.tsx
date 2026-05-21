'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import StatusBadge from '@/components/StatusBadge';
import { Profile, Order, Contract } from '@/lib/types';

type Stats = {
  pendingRequests: number;
  biddingItems: number;
  activeContracts: number;
  monthlySavings: number;
};

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div className={`card p-5 border-l-4 ${color}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <span className="text-3xl opacity-60">{icon}</span>
      </div>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString('ko-KR');

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats]     = useState<Stats>({ pendingRequests:0, biddingItems:0, activeContracts:0, monthlySavings:0 });
  const [recentOrders, setRecentOrders]   = useState<Order[]>([]);
  const [activeBids, setActiveBids]       = useState<{ id:number; item_name:string; quantity:number; unit:string; bid_count:number; lowest_price:number|null }[]>([]);
  const [expiringContracts, setExpiring]  = useState<Contract[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: prof } = await supabase.from('profiles').select('*, company:companies(name)').eq('id', user.id).single();
      setProfile(prof as Profile);
      loadDashboard(prof as Profile);
    });
  }, []);

  const loadDashboard = async (prof: Profile) => {
    // 계약 만료 처리
    await supabase.rpc('expire_contracts');

    const thisMonth = new Date().toISOString().slice(0, 7);
    const thirtyDaysLater = new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0];

    if (prof.role === '직영') {
      const [p, b, a, m] = await Promise.all([
        supabase.from('purchase_requests').select('*', { count:'exact', head:true }).eq('status','pending'),
        supabase.from('purchase_requests').select('*', { count:'exact', head:true }).eq('status','bidding'),
        supabase.from('contracts').select('*', { count:'exact', head:true }).eq('status','active'),
        supabase.from('contracts').select('estimated_savings').eq('status','active').gte('created_at', thisMonth+'-01'),
      ]);
      const savings = (m.data ?? []).reduce((s: number, c: { estimated_savings: number }) => s + (c.estimated_savings ?? 0), 0);
      setStats({ pendingRequests: p.count??0, biddingItems: b.count??0, activeContracts: a.count??0, monthlySavings: savings });

      const [orders, contracts, bidsRaw] = await Promise.all([
        supabase.from('orders').select('*, orderer:profiles!ordered_by(name), supplier:companies!supplier_id(name)').order('created_at',{ascending:false}).limit(5),
        supabase.from('contracts').select('*, supplier:companies!supplier_id(name)').eq('status','active').lte('end_date', thirtyDaysLater).order('end_date').limit(5),
        supabase.from('purchase_requests').select('id, item_name, quantity, unit, bids!request_id(unit_price)').eq('status','bidding'),
      ]);
      setRecentOrders((orders.data ?? []) as Order[]);
      setExpiring((contracts.data ?? []) as Contract[]);
      const bidItems = (bidsRaw.data ?? []).map((r: { id: number; item_name: string; quantity: number; unit: string; bids: { unit_price: number }[] }) => ({
        id: r.id, item_name: r.item_name, quantity: r.quantity, unit: r.unit,
        bid_count: r.bids?.length ?? 0,
        lowest_price: r.bids?.length ? Math.min(...r.bids.map((b: { unit_price: number }) => b.unit_price)) : null,
      }));
      setActiveBids(bidItems);

    } else if (prof.role === '사용협력사') {
      const [p, b] = await Promise.all([
        supabase.from('purchase_requests').select('*', { count:'exact', head:true }).eq('status','pending').eq('requester_id', prof.id),
        supabase.from('purchase_requests').select('*', { count:'exact', head:true }).eq('status','bidding').eq('requester_id', prof.id),
      ]);
      setStats({ pendingRequests: p.count??0, biddingItems: b.count??0, activeContracts:0, monthlySavings:0 });
      const { data: orders } = await supabase.from('orders').select('*, supplier:companies!supplier_id(name)').eq('ordered_by', prof.id).order('created_at',{ascending:false}).limit(5);
      setRecentOrders((orders ?? []) as Order[]);

    } else {
      const [b, a] = await Promise.all([
        supabase.from('purchase_requests').select('*', { count:'exact', head:true }).eq('status','bidding'),
        supabase.from('contracts').select('*', { count:'exact', head:true }).eq('status','active').eq('supplier_id', prof.company_id),
      ]);
      setStats({ pendingRequests:0, biddingItems: b.count??0, activeContracts: a.count??0, monthlySavings:0 });
      const { data: orders } = await supabase.from('orders').select('*, orderer:profiles!ordered_by(name)').eq('supplier_id', prof.company_id).order('created_at',{ascending:false}).limit(5);
      setRecentOrders((orders ?? []) as Order[]);
    }
  };

  if (!profile) return <div className="text-gray-400">로딩 중...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="📋" label="대기중 요청"  value={fmt(stats.pendingRequests)} color="border-yellow-400" />
        <StatCard icon="🏷️" label="입찰 진행중"  value={fmt(stats.biddingItems)}   color="border-blue-400" />
        <StatCard icon="📄" label="유효 계약"    value={fmt(stats.activeContracts)} color="border-green-400" />
        <StatCard icon="💰" label="이달 절감액"  value={`${fmt(stats.monthlySavings)}원`} color="border-purple-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">최근 발주 현황</h3>
            <Link href="/orders" className="text-sm text-blue-600 hover:underline">전체보기</Link>
          </div>
          <table className="w-full">
            <thead><tr>
              <th className="table-th">발주번호</th><th className="table-th">품목명</th>
              <th className="table-th">금액</th><th className="table-th">상태</th>
            </tr></thead>
            <tbody>
              {recentOrders.length === 0 && <tr><td colSpan={4} className="table-td text-center text-gray-400">데이터 없음</td></tr>}
              {recentOrders.map(o => (
                <tr key={o.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="table-td font-mono text-xs">{o.order_no}</td>
                  <td className="table-td">{o.item_name}</td>
                  <td className="table-td">{fmt(o.total_price)}원</td>
                  <td className="table-td">
                    <StatusBadge status={o.status} />
                    {o.is_auto && <span className="ml-1 text-xs text-purple-600">자동</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">입찰 진행 현황</h3>
            <Link href="/bids" className="text-sm text-blue-600 hover:underline">전체보기</Link>
          </div>
          <table className="w-full">
            <thead><tr>
              <th className="table-th">품목명</th><th className="table-th">수량</th>
              <th className="table-th">입찰수</th><th className="table-th">최저가</th>
            </tr></thead>
            <tbody>
              {activeBids.length === 0 && <tr><td colSpan={4} className="table-td text-center text-gray-400">데이터 없음</td></tr>}
              {activeBids.map(b => (
                <tr key={b.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="table-td">{b.item_name}</td>
                  <td className="table-td">{b.quantity} {b.unit}</td>
                  <td className="table-td"><span className="font-medium text-blue-600">{b.bid_count}</span>건</td>
                  <td className="table-td text-green-700 font-medium">{b.lowest_price ? `${fmt(b.lowest_price)}원` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {expiringContracts.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">⚠️ 30일 내 만료 예정 계약</h3>
            <Link href="/contracts" className="text-sm text-blue-600 hover:underline">전체보기</Link>
          </div>
          <table className="w-full">
            <thead><tr>
              <th className="table-th">품목명</th><th className="table-th">납품사</th>
              <th className="table-th">단가</th><th className="table-th">만료일</th>
            </tr></thead>
            <tbody>
              {expiringContracts.map(c => (
                <tr key={c.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="table-td">{c.item_name}</td>
                  <td className="table-td">{(c.supplier as { name: string } | null)?.name}</td>
                  <td className="table-td">{fmt(c.unit_price)}원</td>
                  <td className="table-td text-orange-600 font-medium">{c.end_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

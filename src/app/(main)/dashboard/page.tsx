'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { Profile, Order, Contract } from '@/lib/types';

/* ── 기존 타입 ── */
type Stats = {
  pendingRequests: number;
  biddingItems: number;
  activeContracts: number;
  monthlySavings: number;
};

/* ── 발주 현황 타입 ── */
type OrdStat = {
  id: string | number;
  name: string;
  username?: string;
  monthCount: number;
  monthAmount: number;
  totalAmount: number;
  pendingCount?: number;
};

type MonthlyRow = { month: string; count: number; amount: number };

type RawOrder = {
  id: number;
  supplier_id: number | null;
  ordered_by: string;
  total_price: number;
  status: string;
  approval_status: string | null;
  created_at: string;
};

/* ── 공통 유틸 ── */
const fmt = (n: number) => n.toLocaleString('ko-KR');

function getLast6Months(): string[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

/* ── 통계 카드 ── */
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

/* ── 가로 바 차트 ── */
function BarChart({ data }: { data: MonthlyRow[] }) {
  const maxAmt = Math.max(...data.map(d => d.amount), 1);
  return (
    <div className="space-y-2">
      {data.map(row => (
        <div key={row.month} className="flex items-center gap-3">
          <span className="text-xs text-gray-500 w-16 shrink-0">{row.month}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${maxAmt > 0 ? (row.amount / maxAmt) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs font-medium text-right shrink-0 w-24 text-gray-700">
            {row.amount > 0 ? `${fmt(row.amount)}원` : '-'}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── 섹션 헤더 ── */
function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center justify-between p-4 border-b border-gray-100">
      <div>
        <h3 className="font-semibold text-gray-800">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [stats, setStats]       = useState<Stats>({ pendingRequests: 0, biddingItems: 0, activeContracts: 0, monthlySavings: 0 });
  const [recentOrders, setRecentOrders]     = useState<Order[]>([]);
  const [activeBids, setActiveBids]         = useState<{ id: number; item_name: string; quantity: number; unit: string; bid_count: number; lowest_price: number | null }[]>([]);
  const [expiringContracts, setExpiring]    = useState<Contract[]>([]);

  /* 발주 현황 섹션 */
  const [supplierStats, setSupplierStats] = useState<OrdStat[]>([]);
  const [teamStats, setTeamStats]         = useState<OrdStat[]>([]);
  const [saStats, setSaStats]             = useState<OrdStat[]>([]);
  const [allOrders, setAllOrders]         = useState<RawOrder[]>([]);
  const [modalTarget, setModalTarget]     = useState<{ id: string | number; name: string; filterType: 'supplier' | 'user' } | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<MonthlyRow[]>([]);

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    setProfile(session);
    loadDashboard(session);
    if (['마스터관리자', '직영관리자', '직영'].includes(session.role)) {
      loadOrderStats(session);
    }
  }, []);

  /* ── 기존 대시보드 데이터 로드 ── */
  const loadDashboard = async (prof: Profile) => {
    await supabase.rpc('expire_contracts');

    const thisMonth       = new Date().toISOString().slice(0, 7);
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const isManagement    = ['마스터관리자', '직영관리자', '직영'].includes(prof.role);

    if (isManagement) {
      const [p, b, a, m] = await Promise.all([
        supabase.from('purchase_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('purchase_requests').select('*', { count: 'exact', head: true }).eq('status', 'bidding'),
        supabase.from('contracts').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('contracts').select('estimated_savings').eq('status', 'active').gte('created_at', thisMonth + '-01'),
      ]);
      const savings = (m.data ?? []).reduce((s: number, c: { estimated_savings: number }) => s + (c.estimated_savings ?? 0), 0);
      setStats({ pendingRequests: p.count ?? 0, biddingItems: b.count ?? 0, activeContracts: a.count ?? 0, monthlySavings: savings });

      const [orders, contracts, bidsRaw] = await Promise.all([
        supabase.from('orders').select('*, orderer:profiles!ordered_by(name), supplier:companies!supplier_id(name)').order('created_at', { ascending: false }).limit(5),
        supabase.from('contracts').select('*, supplier:companies!supplier_id(name)').eq('status', 'active').lte('end_date', thirtyDaysLater).order('end_date').limit(5),
        supabase.from('purchase_requests').select('id, item_name, quantity, unit, bids!request_id(unit_price)').eq('status', 'bidding'),
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
        supabase.from('purchase_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending').eq('requester_id', prof.id),
        supabase.from('purchase_requests').select('*', { count: 'exact', head: true }).eq('status', 'bidding').eq('requester_id', prof.id),
      ]);
      setStats({ pendingRequests: p.count ?? 0, biddingItems: b.count ?? 0, activeContracts: 0, monthlySavings: 0 });
      const { data: orders } = await supabase.from('orders').select('*, supplier:companies!supplier_id(name)').eq('ordered_by', prof.id).order('created_at', { ascending: false }).limit(5);
      setRecentOrders((orders ?? []) as Order[]);

    } else {
      // 납품협력사, 부관리자
      const [b, a] = await Promise.all([
        supabase.from('purchase_requests').select('*', { count: 'exact', head: true }).eq('status', 'bidding'),
        supabase.from('contracts').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('supplier_id', prof.company_id),
      ]);
      setStats({ pendingRequests: 0, biddingItems: b.count ?? 0, activeContracts: a.count ?? 0, monthlySavings: 0 });
      if (prof.company_id) {
        const { data: orders } = await supabase.from('orders').select('*, orderer:profiles!ordered_by(name)').eq('supplier_id', prof.company_id).order('created_at', { ascending: false }).limit(5);
        setRecentOrders((orders ?? []) as Order[]);
      }
    }
  };

  /* ── 발주 현황 섹션 데이터 로드 ── */
  const loadOrderStats = async (prof: Profile) => {
    const [supRes, teamRes, saRes, ordRes] = await Promise.all([
      supabase.from('profiles').select('id, name, username, company_id').eq('role', '납품협력사'),
      supabase.from('profiles').select('id, name, username, is_approver').eq('role', '직영'),
      supabase.from('profiles').select('id, name, username').eq('role', '사용협력사'),
      supabase.from('orders').select('id, supplier_id, ordered_by, total_price, status, approval_status, created_at'),
    ]);

    const suppliers = (supRes.data ?? []) as { id: string; name: string; username: string; company_id: number | null }[];
    const team      = (teamRes.data ?? []) as { id: string; name: string; username: string; is_approver: boolean }[];
    const sa        = (saRes.data ?? []) as { id: string; name: string; username: string }[];
    const rawAll    = (ordRes.data ?? []) as RawOrder[];

    /* 유효 발주: 취소·결재대기 제외 */
    const valid = rawAll.filter(o =>
      ['ordered', 'processing', 'shipped', 'delivered'].includes(o.status) &&
      o.approval_status !== '결재대기'
    );

    const thisMonth = new Date().toISOString().slice(0, 7);
    const isLeader  = prof.role === '마스터관리자' || prof.role === '직영관리자' ||
                      (prof.role === '직영' && (prof.is_approver ?? false));

    /* 납품협력사별 */
    const supStats: OrdStat[] = suppliers
      .filter(s => s.company_id != null)
      .map(s => {
        const ords  = valid.filter(o => o.supplier_id === s.company_id);
        const mOrds = ords.filter(o => o.created_at.startsWith(thisMonth));
        return {
          id: s.company_id as number,
          name: s.name,
          username: s.username,
          monthCount:  mOrds.length,
          monthAmount: mOrds.reduce((sum, o) => sum + Number(o.total_price), 0),
          totalAmount: ords.reduce((sum, o) => sum + Number(o.total_price), 0),
        };
      })
      .sort((a, b) => b.totalAmount - a.totalAmount);

    /* 직영팀별 (tc202~206은 본인만) */
    const filteredTeam = isLeader ? team : team.filter(t => t.id === prof.id);
    const tmStats: OrdStat[] = filteredTeam.map(t => {
      const ords  = valid.filter(o => o.ordered_by === t.id);
      const mOrds = ords.filter(o => o.created_at.startsWith(thisMonth));
      const pendingCount = rawAll.filter(o => o.ordered_by === t.id && o.approval_status === '결재대기').length;
      return {
        id: t.id,
        name: t.name,
        username: t.username,
        monthCount:  mOrds.length,
        monthAmount: mOrds.reduce((sum, o) => sum + Number(o.total_price), 0),
        totalAmount: ords.reduce((sum, o) => sum + Number(o.total_price), 0),
        pendingCount,
      };
    });

    /* 사용협력사별 */
    const saStats: OrdStat[] = sa.map(s => {
      const ords  = valid.filter(o => o.ordered_by === s.id);
      const mOrds = ords.filter(o => o.created_at.startsWith(thisMonth));
      return {
        id: s.id,
        name: s.name,
        username: s.username,
        monthCount:  mOrds.length,
        monthAmount: mOrds.reduce((sum, o) => sum + Number(o.total_price), 0),
        totalAmount: ords.reduce((sum, o) => sum + Number(o.total_price), 0),
      };
    });

    setAllOrders(valid);
    setSupplierStats(supStats);
    setTeamStats(tmStats);
    setSaStats(saStats);
  };

  /* ── 월별 서머리 모달 열기 ── */
  const openMonthlySummary = (id: string | number, name: string, filterType: 'supplier' | 'user') => {
    const months   = getLast6Months();
    const filtered = filterType === 'supplier'
      ? allOrders.filter(o => o.supplier_id === id)
      : allOrders.filter(o => o.ordered_by === id);

    const summary: MonthlyRow[] = months.map(month => {
      const mOrds = filtered.filter(o => o.created_at.startsWith(month));
      return {
        month,
        count:  mOrds.length,
        amount: mOrds.reduce((sum, o) => sum + Number(o.total_price), 0),
      };
    });

    setModalTarget({ id, name, filterType });
    setMonthlySummary(summary);
  };

  if (!profile) return <div className="text-gray-400">로딩 중...</div>;

  const showStatsSections = ['마스터관리자', '직영관리자', '직영'].includes(profile.role);
  const totalSummaryAmount = monthlySummary.reduce((sum, r) => sum + r.amount, 0);
  const totalSummaryCount  = monthlySummary.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="space-y-6">

      {/* ── 상단 통계 카드 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="📋" label="대기중 요청"  value={fmt(stats.pendingRequests)} color="border-yellow-400" />
        <StatCard icon="🏷️" label="입찰 진행중"  value={fmt(stats.biddingItems)}   color="border-blue-400" />
        <StatCard icon="📄" label="유효 계약"    value={fmt(stats.activeContracts)} color="border-green-400" />
        <StatCard icon="💰" label="이달 절감액"  value={`${fmt(stats.monthlySavings)}원`} color="border-purple-400" />
      </div>

      {/* ── 기존 섹션 (최근발주 / 입찰현황) ── */}
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

      {/* ── 만료 임박 계약 ── */}
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

      {/* ════════════════════════════════════════
          발주 현황 섹션 (관리자/직영 전용)
      ════════════════════════════════════════ */}
      {showStatsSections && (
        <div className="space-y-6">

          {/* ── 납품협력사별 발주 현황 ── */}
          <div className="card overflow-hidden">
            <SectionHeader
              title="납품협력사별 발주 현황"
              subtitle="업체명 클릭 시 월별 서머리 확인"
            />
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="table-th">업체명</th>
                  <th className="table-th text-right">이달발주건수</th>
                  <th className="table-th text-right">이달발주금액</th>
                  <th className="table-th text-right">누적발주금액</th>
                  <th className="table-th text-center">상태</th>
                </tr>
              </thead>
              <tbody>
                {supplierStats.length === 0 && (
                  <tr><td colSpan={5} className="table-td text-center text-gray-400 py-6">데이터 없음</td></tr>
                )}
                {supplierStats.map(s => (
                  <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="table-td">
                      <button
                        onClick={() => openMonthlySummary(s.id, s.name, 'supplier')}
                        className="font-semibold text-blue-600 hover:underline text-left"
                      >
                        {s.name}
                      </button>
                      <span className="ml-1.5 text-xs text-gray-400 font-mono">{s.username}</span>
                    </td>
                    <td className="table-td text-right">{s.monthCount}건</td>
                    <td className="table-td text-right font-medium">{fmt(s.monthAmount)}원</td>
                    <td className="table-td text-right text-gray-500">{fmt(s.totalAmount)}원</td>
                    <td className="table-td text-center">
                      {s.monthCount > 0
                        ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">활성</span>
                        : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">대기</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── 직영팀별 발주 현황 ── */}
          <div className="card overflow-hidden">
            <SectionHeader
              title="직영팀 발주 현황"
              subtitle="팀원명 클릭 시 월별 서머리 확인"
            />
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="table-th">팀원명</th>
                  <th className="table-th text-right">이달발주건수</th>
                  <th className="table-th text-right">이달발주금액</th>
                  <th className="table-th text-center">결재대기</th>
                  <th className="table-th text-center">상태</th>
                </tr>
              </thead>
              <tbody>
                {teamStats.length === 0 && (
                  <tr><td colSpan={5} className="table-td text-center text-gray-400 py-6">데이터 없음</td></tr>
                )}
                {teamStats.map(t => (
                  <tr key={t.id} className={`border-t border-gray-100 hover:bg-gray-50 ${(t.pendingCount ?? 0) > 0 ? 'bg-orange-50/30' : ''}`}>
                    <td className="table-td">
                      <button
                        onClick={() => openMonthlySummary(t.id, t.name, 'user')}
                        className="font-semibold text-blue-600 hover:underline text-left"
                      >
                        {t.name}
                      </button>
                      <span className="ml-1.5 text-xs text-gray-400 font-mono">{t.username}</span>
                    </td>
                    <td className="table-td text-right">{t.monthCount}건</td>
                    <td className="table-td text-right font-medium">{fmt(t.monthAmount)}원</td>
                    <td className="table-td text-center">
                      {(t.pendingCount ?? 0) > 0
                        ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{t.pendingCount}건</span>
                        : <span className="text-xs text-gray-300">-</span>
                      }
                    </td>
                    <td className="table-td text-center">
                      {(t.pendingCount ?? 0) > 0
                        ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">결재대기</span>
                        : t.monthCount > 0
                          ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">정상</span>
                          : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">대기</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── 사용협력사별 발주 현황 ── */}
          <div className="card overflow-hidden">
            <SectionHeader
              title="사용협력사별 발주 현황"
              subtitle="업체명 클릭 시 월별 서머리 확인"
            />
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="table-th">업체명</th>
                  <th className="table-th text-right">이달발주건수</th>
                  <th className="table-th text-right">이달발주금액</th>
                  <th className="table-th text-right">누적발주금액</th>
                </tr>
              </thead>
              <tbody>
                {saStats.length === 0 && (
                  <tr><td colSpan={4} className="table-td text-center text-gray-400 py-6">데이터 없음</td></tr>
                )}
                {saStats.map(s => (
                  <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="table-td">
                      <button
                        onClick={() => openMonthlySummary(s.id, s.name, 'user')}
                        className="font-semibold text-blue-600 hover:underline text-left"
                      >
                        {s.name}
                      </button>
                      <span className="ml-1.5 text-xs text-gray-400 font-mono">{s.username}</span>
                    </td>
                    <td className="table-td text-right">{s.monthCount}건</td>
                    <td className="table-td text-right font-medium">{fmt(s.monthAmount)}원</td>
                    <td className="table-td text-right text-gray-500">{fmt(s.totalAmount)}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 월별 서머리 모달 ── */}
      <Modal
        isOpen={!!modalTarget}
        onClose={() => setModalTarget(null)}
        title={`월별 발주 서머리 — ${modalTarget?.name ?? ''}`}
        size="sm"
      >
        {modalTarget && (
          <div className="space-y-5">
            {/* 바 차트 */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">최근 6개월 발주 금액</p>
              <BarChart data={monthlySummary} />
            </div>

            {/* 월별 테이블 */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">월별 상세</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-y border-gray-200">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">월</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">건수</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">발주금액</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySummary.map(row => (
                    <tr key={row.month} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-gray-700 font-mono text-xs">{row.month}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{row.count}건</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {row.amount > 0 ? `${fmt(row.amount)}원` : <span className="text-gray-300">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-blue-50">
                    <td className="px-3 py-2 font-semibold text-blue-800 text-xs">6개월 합계</td>
                    <td className="px-3 py-2 text-right font-semibold text-blue-800">{totalSummaryCount}건</td>
                    <td className="px-3 py-2 text-right font-bold text-blue-800">{fmt(totalSummaryAmount)}원</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

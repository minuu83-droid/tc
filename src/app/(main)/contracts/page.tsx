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

  /* ── 갱신 모달 상태 ── */
  const [renewModal, setRenewModal]     = useState<Contract | null>(null);
  const [renewType, setRenewType]       = useState<'once' | '6m' | '1y' | null>(null);
  const [renewSaving, setRenewSaving]   = useState(false);
  const [renewErr, setRenewErr]         = useState('');
  const [renewImgUrls, setRenewImgUrls] = useState<string[] | null>(null);

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

  /* ── 갱신 모달 열기: 연결된 구매요청 이미지 로드 ── */
  const openRenew = async (c: Contract) => {
    setRenewModal(c);
    setRenewType(null);
    setRenewErr('');
    setRenewImgUrls(null);
    if (c.request_id) {
      const { data } = await supabase
        .from('purchase_requests')
        .select('image_urls')
        .eq('id', c.request_id)
        .single();
      setRenewImgUrls((data as { image_urls?: string[] | null } | null)?.image_urls ?? null);
    }
  };

  /* ── 갱신 처리: 기존 계약 종료 + 동일 조건으로 새 계약 생성 ── */
  const submitRenew = async () => {
    if (!renewModal || !profile) return;
    if (!renewType) { setRenewErr('갱신 기간을 선택해주세요.'); return; }
    setRenewSaving(true); setRenewErr('');

    const toDateStr = (d: Date) => d.toISOString().slice(0, 10);
    const start = new Date();
    const end   = new Date();
    if (renewType === '6m') end.setMonth(end.getMonth() + 6);
    if (renewType === '1y') end.setFullYear(end.getFullYear() + 1);

    await supabase.from('contracts').update({ status: 'terminated' }).eq('id', renewModal.id);

    const { error } = await supabase.from('contracts').insert({
      request_id:       renewModal.request_id,
      winning_bid_id:   renewModal.winning_bid_id,
      item_id:          renewModal.item_id,
      item_name:        renewModal.item_name,
      supplier_id:      renewModal.supplier_id,
      unit_price:       renewModal.unit_price,
      quantity:         renewModal.quantity,
      start_date:       toDateStr(start),
      end_date:         renewType === 'once' ? toDateStr(start) : toDateStr(end),
      estimated_savings: renewModal.estimated_savings,
      prev_unit_price:  renewModal.prev_unit_price,
      created_by:       profile.id,
      status:           'active',
      contract_type:    renewType === 'once' ? '일회성' : '기간계약',
    });

    setRenewSaving(false);
    if (error) { setRenewErr(error.message); return; }
    setRenewModal(null);
    load();
    alert('계약이 갱신되었습니다.');
  };

  const statuses = ['all', 'active', 'expired', 'terminated'];
  const statusLabels: Record<string, string> = { all: '전체', active: '계약중', expired: '만료', terminated: '해지' };
  const filtered = filter === 'all' ? contracts : contracts.filter(c => c.status === filter);

  const totalSavings = contracts.filter(c => c.status === 'active').reduce((s, c) => s + (c.estimated_savings ?? 0), 0);
  const activeCount  = contracts.filter(c => c.status === 'active').length;

  const daysLeft = (end: string) => {
    const ms = new Date(end).getTime() - Date.now();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  };

  /* 갱신·해지 권한: 마스터관리자 / 직영관리자만 */
  const canManage = profile?.role === '마스터관리자' || profile?.role === '직영관리자';

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
              {canManage && <th className="table-th">관리</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={canManage ? 9 : 8} className="table-td text-center text-gray-400 py-8">계약 내역이 없습니다.</td></tr>
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
                  {canManage && (
                    <td className="table-td">
                      {c.status === 'active' && (
                        <div className="flex gap-3">
                          <button
                            onClick={() => openRenew(c)}
                            className="text-sm text-blue-600 hover:underline font-medium"
                          >
                            갱신
                          </button>
                          <button
                            onClick={() => setTermModal(c)}
                            className="text-sm text-red-500 hover:underline"
                          >
                            해지
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 해지 모달 */}
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

      {/* 갱신 모달 */}
      <Modal isOpen={!!renewModal} onClose={() => setRenewModal(null)} title="계약 갱신" size="sm">
        {renewModal && (
          <div className="space-y-4">
            {/* 계약 정보 (수정 불가) */}
            <div className="bg-blue-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">품목명</span>
                <span className="font-semibold text-gray-900">{renewModal.item_name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">납품사</span>
                <span className="font-semibold text-gray-900">
                  {(renewModal.supplier as { name: string } | null)?.name ?? '-'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">계약 단가</span>
                <span className="font-bold text-blue-700">{renewModal.unit_price.toLocaleString()}원</span>
              </div>
            </div>

            {/* 첨부 사진 썸네일 */}
            {renewImgUrls && renewImgUrls.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">첨부 사진</p>
                <div className="flex gap-2 flex-wrap">
                  {renewImgUrls.map((url, idx) => (
                    <div key={idx} className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`사진 ${idx + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 안내 문구 */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              이전 계약과 동일 조건으로 갱신합니다.
            </div>

            {/* 갱신 기간 선택 */}
            <div>
              <label className="label">갱신 기간 *</label>
              <div className="flex gap-2">
                {([
                  { key: 'once', label: '일회성',
                    active: 'bg-gray-700 text-white border-gray-700',
                    inactive: 'text-gray-600 border-gray-300 hover:bg-gray-50' },
                  { key: '6m',   label: '6개월',
                    active: 'bg-blue-600 text-white border-blue-600',
                    inactive: 'text-blue-600 border-blue-300 hover:bg-blue-50' },
                  { key: '1y',   label: '1년',
                    active: 'bg-green-600 text-white border-green-600',
                    inactive: 'text-green-600 border-green-300 hover:bg-green-50' },
                ] as const).map(({ key, label, active, inactive }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRenewType(key)}
                    className={`flex-1 py-2 text-sm rounded-lg border font-medium transition-colors ${
                      renewType === key ? active : `bg-white ${inactive}`
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {renewErr && <p className="text-red-600 text-sm">{renewErr}</p>}
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setRenewModal(null)}>취소</button>
              <button className="btn-primary flex-1" onClick={submitRenew} disabled={renewSaving}>
                {renewSaving ? '처리 중...' : '갱신 확정'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

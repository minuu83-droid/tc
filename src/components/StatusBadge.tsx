type BadgeVariant =
  | 'pending' | 'bidding' | 'awarded' | 'contracted' | 'completed' | 'cancelled'
  | 'submitted' | 'won' | 'lost'
  | 'ordered' | 'processing' | 'shipped' | 'delivered'
  | 'active' | 'expired' | 'terminated'
  | 'active_co' | 'inactive'
  | '결재대기' | '반려' | '승인';

const variantMap: Record<BadgeVariant, { label: string; cls: string }> = {
  '결재대기':  { label: '결재대기', cls: 'bg-orange-100 text-orange-700' },
  '반려':      { label: '반려',     cls: 'bg-red-100 text-red-700' },
  '승인':      { label: '승인완료', cls: 'bg-green-100 text-green-700' },
  pending:    { label: '대기중',   cls: 'bg-gray-100 text-gray-700' },
  bidding:    { label: '입찰중',   cls: 'bg-blue-100 text-blue-700' },
  awarded:    { label: '낙찰완료', cls: 'bg-indigo-100 text-indigo-700' },
  contracted: { label: '계약완료', cls: 'bg-green-100 text-green-700' },
  completed:  { label: '완료',     cls: 'bg-green-100 text-green-700' },
  cancelled:  { label: '취소',     cls: 'bg-red-100 text-red-700' },
  submitted:  { label: '입찰중',   cls: 'bg-blue-100 text-blue-700' },
  won:        { label: '낙찰',     cls: 'bg-green-100 text-green-700' },
  lost:       { label: '탈락',     cls: 'bg-red-100 text-red-700' },
  ordered:    { label: '발주완료', cls: 'bg-blue-100 text-blue-700' },
  processing: { label: '처리중',   cls: 'bg-yellow-100 text-yellow-700' },
  shipped:    { label: '배송중',   cls: 'bg-indigo-100 text-indigo-700' },
  delivered:  { label: '납품완료', cls: 'bg-green-100 text-green-700' },
  active:     { label: '계약중',   cls: 'bg-green-100 text-green-700' },
  expired:    { label: '만료',     cls: 'bg-gray-100 text-gray-600' },
  terminated: { label: '해지',     cls: 'bg-red-100 text-red-700' },
  active_co:  { label: '활성',     cls: 'bg-green-100 text-green-700' },
  inactive:   { label: '비활성',   cls: 'bg-gray-100 text-gray-500' },
};

export default function StatusBadge({ status }: { status: string }) {
  const v = variantMap[status as BadgeVariant] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}

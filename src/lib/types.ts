export type Role = '직영' | '사용협력사' | '납품협력사';

export type Profile = {
  id: string;
  name: string;
  email: string | null;
  username: string;
  role: Role;
  company_id: number | null;
  company?: { name: string } | null;
  created_at: string;
};

export type Company = {
  id: number;
  name: string;
  type: '사용협력사' | '납품협력사';
  business_no: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: 'active' | 'inactive';
  created_at: string;
};

export type Item = {
  id: number;
  code: string;
  name: string;
  category: string | null;
  maker: string | null;
  spec: string | null;
  unit: string;
  has_contract: boolean;
  status: 'active' | 'inactive';
  created_by: string | null;
  creator?: { name: string } | null;
  created_at: string;
};

export type PurchaseRequest = {
  id: number;
  item_id: number | null;
  item_name: string;
  maker: string | null;
  spec: string | null;
  quantity: number;
  unit: string;
  required_date: string | null;
  requester_id: string;
  company_id: number | null;
  status: 'pending' | 'bidding' | 'awarded' | 'contracted' | 'completed' | 'cancelled';
  notes: string | null;
  image_urls: string[] | null;
  requester?: { name: string } | null;
  company?: { name: string } | null;
  created_at: string;
};

export type Bid = {
  id: number;
  request_id: number;
  supplier_id: number;
  unit_price: number;
  total_price: number;
  delivery_days: number | null;
  notes: string | null;
  status: 'submitted' | 'won' | 'lost';
  supplier?: { name: string } | null;
  submitted_at: string;
};

export type Contract = {
  id: number;
  request_id: number | null;
  winning_bid_id: number | null;
  item_id: number | null;
  item_name: string;
  supplier_id: number;
  unit_price: number;
  quantity: number | null;
  start_date: string;
  end_date: string;
  estimated_savings: number;
  prev_unit_price: number | null;
  created_by: string | null;
  status: 'active' | 'expired' | 'terminated';
  contract_type: '일회성' | '기간계약' | null;
  supplier?: { name: string } | null;
  created_at: string;
};

export type Order = {
  id: number;
  order_no: string;
  request_id: number | null;
  contract_id: number | null;
  item_id: number | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  ordered_by: string;
  supplier_id: number | null;
  is_auto: boolean;
  status: 'ordered' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  required_date: string | null;
  delivery_date: string | null;
  notes: string | null;
  orderer?: { name: string } | null;
  supplier?: { name: string } | null;
  created_at: string;
};

-- ================================================================
-- 현장 소모품 구매 시스템 - Supabase 초기화 SQL
-- Supabase Dashboard > SQL Editor 에서 전체 실행
-- ================================================================

-- 1. 비밀번호 해싱용 pgcrypto 확장
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. 기존 함수 정리
DROP FUNCTION IF EXISTS login(TEXT, TEXT);
DROP FUNCTION IF EXISTS expire_contracts();
DROP FUNCTION IF EXISTS award_bid(INTEGER, DATE, DATE, INTEGER, TEXT);
DROP FUNCTION IF EXISTS award_bid(INTEGER, DATE, DATE, INTEGER);
DROP FUNCTION IF EXISTS create_auto_order(INTEGER, TEXT, INTEGER, TEXT, DATE, TEXT);
DROP FUNCTION IF EXISTS create_auto_order(INTEGER, TEXT, INTEGER, DATE, TEXT);

-- 3. 기존 테이블 정리 (FK 역순)
DROP TABLE IF EXISTS orders           CASCADE;
DROP TABLE IF EXISTS contracts        CASCADE;
DROP TABLE IF EXISTS bids             CASCADE;
DROP TABLE IF EXISTS purchase_requests CASCADE;
DROP TABLE IF EXISTS items            CASCADE;
DROP TABLE IF EXISTS profiles         CASCADE;
DROP TABLE IF EXISTS companies        CASCADE;

-- ================================================================
-- 테이블 생성
-- ================================================================

-- ① 협력사
CREATE TABLE companies (
  id           SERIAL PRIMARY KEY,
  name         TEXT    NOT NULL,
  type         TEXT    NOT NULL CHECK (type IN ('사용협력사', '납품협력사')),
  business_no  TEXT,
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  status       TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ② 사용자 (Supabase Auth 미사용, 자체 인증)
CREATE TABLE profiles (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('직영', '사용협력사', '납품협력사')),
  company_id    INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ③ 품목
CREATE TABLE items (
  id           SERIAL PRIMARY KEY,
  code         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  category     TEXT,
  maker        TEXT,
  spec         TEXT,
  unit         TEXT    NOT NULL DEFAULT 'EA',
  has_contract BOOLEAN NOT NULL DEFAULT false,
  status       TEXT    NOT NULL DEFAULT 'active',
  created_by   TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ④ 구매 요청
CREATE TABLE purchase_requests (
  id            SERIAL PRIMARY KEY,
  item_id       INTEGER REFERENCES items(id) ON DELETE SET NULL,
  item_name     TEXT    NOT NULL,
  maker         TEXT,
  spec          TEXT,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit          TEXT    NOT NULL DEFAULT 'EA',
  required_date DATE,
  requester_id  TEXT    NOT NULL REFERENCES profiles(id),
  company_id    INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  status        TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','bidding','awarded','contracted','completed','cancelled')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ⑤ 입찰
CREATE TABLE bids (
  id            SERIAL PRIMARY KEY,
  request_id    INTEGER NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  supplier_id   INTEGER NOT NULL REFERENCES companies(id),
  unit_price    INTEGER NOT NULL CHECK (unit_price > 0),
  total_price   INTEGER NOT NULL,
  delivery_days INTEGER,
  notes         TEXT,
  status        TEXT    NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','won','lost')),
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ⑥ 계약
CREATE TABLE contracts (
  id                SERIAL PRIMARY KEY,
  request_id        INTEGER REFERENCES purchase_requests(id) ON DELETE SET NULL,
  winning_bid_id    INTEGER REFERENCES bids(id) ON DELETE SET NULL,
  item_id           INTEGER REFERENCES items(id) ON DELETE SET NULL,
  item_name         TEXT    NOT NULL,
  supplier_id       INTEGER NOT NULL REFERENCES companies(id),
  unit_price        INTEGER NOT NULL,
  quantity          INTEGER,
  start_date        DATE    NOT NULL,
  end_date          DATE    NOT NULL,
  estimated_savings INTEGER NOT NULL DEFAULT 0,
  prev_unit_price   INTEGER,
  created_by        TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  status            TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','terminated')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ⑦ 발주
CREATE TABLE orders (
  id            SERIAL PRIMARY KEY,
  order_no      TEXT UNIQUE NOT NULL,
  request_id    INTEGER REFERENCES purchase_requests(id) ON DELETE SET NULL,
  contract_id   INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
  item_id       INTEGER REFERENCES items(id) ON DELETE SET NULL,
  item_name     TEXT    NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_price    INTEGER NOT NULL,
  total_price   INTEGER NOT NULL,
  ordered_by    TEXT    NOT NULL REFERENCES profiles(id),
  supplier_id   INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  is_auto       BOOLEAN NOT NULL DEFAULT false,
  status        TEXT    NOT NULL DEFAULT 'ordered'
                CHECK (status IN ('ordered','processing','shipped','delivered','cancelled')),
  required_date DATE,
  delivery_date DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- RLS - anon 역할 전체 허용 (자체 인증 방식)
-- ================================================================

ALTER TABLE companies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids               ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders             ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all" ON companies          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON profiles           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON items              FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON purchase_requests  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON bids               FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON contracts          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON orders             FOR ALL TO anon USING (true) WITH CHECK (true);

-- ================================================================
-- RPC 함수
-- ================================================================

-- 로그인 (이메일 + 비밀번호 검증 → Profile JSON 반환)
CREATE OR REPLACE FUNCTION login(p_email TEXT, p_password TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_profile      profiles%ROWTYPE;
  v_company_name TEXT;
BEGIN
  SELECT * INTO v_profile
  FROM   profiles
  WHERE  email = lower(trim(p_email));

  IF NOT FOUND
     OR v_profile.password_hash != crypt(p_password, v_profile.password_hash)
  THEN
    RETURN json_build_object('error', '이메일 또는 비밀번호가 올바르지 않습니다.');
  END IF;

  IF v_profile.company_id IS NOT NULL THEN
    SELECT name INTO v_company_name FROM companies WHERE id = v_profile.company_id;
  END IF;

  RETURN json_build_object(
    'id',         v_profile.id,
    'name',       v_profile.name,
    'email',      v_profile.email,
    'role',       v_profile.role,
    'company_id', v_profile.company_id,
    'company',    CASE WHEN v_company_name IS NOT NULL
                  THEN json_build_object('name', v_company_name)
                  ELSE NULL END,
    'created_at', v_profile.created_at::text
  );
END;
$$;

-- 만료 계약 처리
CREATE OR REPLACE FUNCTION expire_contracts()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE contracts
  SET    status = 'expired'
  WHERE  status = 'active' AND end_date < CURRENT_DATE;

  UPDATE items
  SET    has_contract = false
  WHERE  has_contract = true
    AND  id NOT IN (
           SELECT item_id FROM contracts
           WHERE  item_id IS NOT NULL AND status = 'active'
         );
END;
$$;

-- 낙찰 처리 및 계약 생성
CREATE OR REPLACE FUNCTION award_bid(
  p_bid_id          INTEGER,
  p_start_date      DATE,
  p_end_date        DATE,
  p_prev_unit_price INTEGER DEFAULT NULL,
  p_created_by      TEXT    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_bid         bids%ROWTYPE;
  v_request     purchase_requests%ROWTYPE;
  v_contract_id INTEGER;
  v_savings     INTEGER;
BEGIN
  SELECT * INTO v_bid FROM bids WHERE id = p_bid_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', '입찰을 찾을 수 없습니다.');
  END IF;

  SELECT * INTO v_request FROM purchase_requests WHERE id = v_bid.request_id;

  v_savings := CASE WHEN p_prev_unit_price IS NOT NULL
    THEN GREATEST(0, (p_prev_unit_price - v_bid.unit_price) * v_request.quantity)
    ELSE 0 END;

  INSERT INTO contracts (
    request_id, winning_bid_id, item_id, item_name,
    supplier_id, unit_price, quantity,
    start_date, end_date, estimated_savings, prev_unit_price,
    created_by, status
  ) VALUES (
    v_request.id, v_bid.id, v_request.item_id, v_request.item_name,
    v_bid.supplier_id, v_bid.unit_price, v_request.quantity,
    p_start_date, p_end_date, v_savings, p_prev_unit_price,
    p_created_by, 'active'
  ) RETURNING id INTO v_contract_id;

  UPDATE purchase_requests SET status = 'contracted' WHERE id = v_request.id;
  UPDATE bids SET status = 'won'  WHERE id = p_bid_id;
  UPDATE bids SET status = 'lost' WHERE request_id = v_request.id AND id != p_bid_id;

  IF v_request.item_id IS NOT NULL THEN
    UPDATE items SET has_contract = true WHERE id = v_request.item_id;
  END IF;

  RETURN json_build_object('contract_id', v_contract_id);
END;
$$;

-- 자동 발주 처리 (계약 품목 요청 시 즉시 발주)
CREATE OR REPLACE FUNCTION create_auto_order(
  p_item_id       INTEGER,
  p_item_name     TEXT,
  p_quantity      INTEGER,
  p_requester_id  TEXT,
  p_required_date DATE DEFAULT NULL,
  p_notes         TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_contract contracts%ROWTYPE;
  v_order_no TEXT;
  v_order_id INTEGER;
BEGIN
  SELECT * INTO v_contract
  FROM   contracts
  WHERE  item_id = p_item_id AND status = 'active'
  ORDER  BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
         LPAD((COALESCE(MAX(id), 0) + 1)::text, 4, '0')
  INTO   v_order_no FROM orders;

  INSERT INTO orders (
    order_no, item_id, item_name, quantity,
    unit_price, total_price,
    ordered_by, supplier_id, contract_id,
    is_auto, status, required_date, notes
  ) VALUES (
    v_order_no, p_item_id, p_item_name, p_quantity,
    v_contract.unit_price, v_contract.unit_price * p_quantity,
    p_requester_id, v_contract.supplier_id, v_contract.id,
    true, 'ordered', p_required_date, p_notes
  ) RETURNING id INTO v_order_id;

  RETURN json_build_object(
    'order_id', v_order_id,
    'message',  '계약가(' || v_contract.unit_price || '원)로 자동 발주 처리되었습니다.'
  );
END;
$$;

-- ================================================================
-- 초기 데이터
-- ================================================================

-- 협력사
INSERT INTO companies (name, type, business_no, contact_name, phone, status) VALUES
('ABC 제조(주)',  '사용협력사', '123-45-67890', '김철수', '02-1234-5678', 'active'),
('XYZ 건설(주)',  '사용협력사', '234-56-78901', '이영희', '02-2345-6789', 'active'),
('우리공급(주)',  '납품협력사', '345-67-89012', '박민준', '02-3456-7890', 'active'),
('한국물자(주)',  '납품협력사', '456-78-90123', '정대호', '02-4567-8901', 'active'),
('최고자재(주)',  '납품협력사', '567-89-01234', '강수진', '02-5678-9012', 'active');

-- 사용자 (비밀번호: admin123 / user123 / sup123)
INSERT INTO profiles (name, email, password_hash, role, company_id) VALUES
('홍길동', 'admin@company.com',  crypt('admin123', gen_salt('bf')), '직영',       NULL),
('김철수', 'user1@abc.com',      crypt('user123',  gen_salt('bf')), '사용협력사', 1),
('박민준', 'supplier1@wuri.com', crypt('sup123',   gen_salt('bf')), '납품협력사', 3);

-- 품목
INSERT INTO items (code, name, category, maker, spec, unit, has_contract) VALUES
('ITM-001', '안전화',        '보호구',   '한국안전',   '250mm, 강화발가락',  'EA',   false),
('ITM-002', '안전모',        '보호구',   '세이프티코', '흰색, ABS재질',     'EA',   false),
('ITM-003', '면장갑',        '소모품',   '광일',       '14수, 12쌍입',      'Pack', false),
('ITM-004', '절삭유',        '설비용',   '유공',       '20L, 수용성',       'L',    false),
('ITM-005', '에어필터',      '설비용',   '3M',         '10x10x1inch',      'EA',   false),
('ITM-006', '청소용 걸레',   '소모품',   NULL,         '극세사 30x30cm',   'EA',   false),
('ITM-007', '절연 테이프',   '전기자재', '3M',         '19mm x 20m',       'Roll', false),
('ITM-008', '볼트너트 세트', '체결자재', '한국파스너', 'M10x20mm',         'SET',  false);

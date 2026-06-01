-- 납품사 이름이 '-'로 표시되는 문제 수정
-- 원인: companies RLS 정책이 authenticated 롤만 허용하여
--       anon 키로 요청 시 JOIN 결과가 null 반환됨
-- 적용: 2026-06-01

CREATE POLICY IF NOT EXISTS "companies_anon_select" ON companies
  FOR SELECT TO anon
  USING (true);

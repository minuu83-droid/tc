-- ================================================================
-- profiles 테이블 테스트 계정 설정 스크립트
-- Supabase Dashboard > SQL Editor 에서 실행
-- ================================================================

-- pgcrypto 확장 (비밀번호 해싱)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- username 컬럼 추가 (없는 경우)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- password_hash 컬럼 추가 (없는 경우)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- ================================================================
-- 테스트 계정 삽입 (이미 있으면 username·password_hash만 갱신)
-- ================================================================

INSERT INTO profiles (id, name, email, username, password_hash, role, company_id)
VALUES
  (gen_random_uuid()::text, '홍길동', 'admin@company.com',  'admin',     crypt('admin123', gen_salt('bf')), '직영',       NULL),
  (gen_random_uuid()::text, '김철수', 'user1@abc.com',      'user1',     crypt('user123',  gen_salt('bf')), '사용협력사', 1),
  (gen_random_uuid()::text, '박민준', 'supplier1@wuri.com', 'supplier1', crypt('sup123',   gen_salt('bf')), '납품협력사', 3)
ON CONFLICT (email) DO UPDATE
  SET username      = EXCLUDED.username,
      password_hash = EXCLUDED.password_hash;

-- ================================================================
-- login RPC 함수 (username + password_hash 인증)
-- ================================================================

DROP FUNCTION IF EXISTS login(TEXT, TEXT);

CREATE FUNCTION login(p_username TEXT, p_password TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_profile      profiles%ROWTYPE;
  v_company_name TEXT;
BEGIN
  SELECT * INTO v_profile
  FROM   profiles
  WHERE  username = lower(trim(p_username));

  IF NOT FOUND
     OR v_profile.password_hash IS NULL
     OR v_profile.password_hash != crypt(p_password, v_profile.password_hash)
  THEN
    RETURN json_build_object('error', '아이디 또는 비밀번호가 올바르지 않습니다.');
  END IF;

  IF v_profile.company_id IS NOT NULL THEN
    SELECT name INTO v_company_name FROM companies WHERE id = v_profile.company_id;
  END IF;

  RETURN json_build_object(
    'id',         v_profile.id,
    'name',       v_profile.name,
    'email',      v_profile.email,
    'username',   v_profile.username,
    'role',       v_profile.role,
    'company_id', v_profile.company_id,
    'company',    CASE WHEN v_company_name IS NOT NULL
                  THEN json_build_object('name', v_company_name)
                  ELSE NULL END,
    'created_at', v_profile.created_at::text
  );
END;
$$;

-- ================================================================
-- 확인 쿼리
-- ================================================================

SELECT email, username, role,
       CASE WHEN password_hash IS NULL THEN '미설정' ELSE '설정됨' END AS pw_status
FROM profiles
ORDER BY created_at;

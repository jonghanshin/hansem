-- 입금 등록의 '거래처 정보'(공정·주요작업·업체·담당자)를 승인 요청에도 저장하기 위한 컬럼 추가.
-- 입금내역 테이블에는 이미 같은 컬럼이 있다. Supabase SQL Editor에서 한 번 실행한다.
alter table public."승인필요입금내역"
  add column if not exists "공정" text,
  add column if not exists "주요작업" text,
  add column if not exists "업체" text,
  add column if not exists "업체담당자성함" text,
  add column if not exists "업체담당자연락처" text,
  add column if not exists "업체비고" text;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';

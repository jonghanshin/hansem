-- 입금 등록 '거래처 정보'의 계좌(은행명·예금주·계좌번호)를 저장하기 위한 컬럼 추가.
-- 입금내역·승인필요입금내역 두 테이블 모두에 추가한다. Supabase SQL Editor에서 한 번 실행한다.
alter table public."입금내역"
  add column if not exists "업체은행" text,
  add column if not exists "업체예금주" text,
  add column if not exists "업체계좌번호" text;

alter table public."승인필요입금내역"
  add column if not exists "업체은행" text,
  add column if not exists "업체예금주" text,
  add column if not exists "업체계좌번호" text;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';

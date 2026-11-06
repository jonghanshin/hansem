-- 입금내역 A/S 필드 추가
-- 입금내역 테이블에는 "A/S" 컬럼이 이미 있으므로, 승인 요청이 거쳐 가는 승인필요입금내역에만 추가한다.
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 한 번 실행하세요.

alter table public."승인필요입금내역" add column if not exists "A/S" text;
alter table public."입금내역" add column if not exists "A/S" text;

-- 새 컬럼을 API가 바로 인식하도록 스키마 캐시 새로고침
notify pgrst, 'reload schema';

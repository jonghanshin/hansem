-- 입금내역 카드결제 컬럼 추가 (입금구분 '한샘 외 시공비'일 때 체크: 'Y', 미체크: null)
-- 입금내역과 승인 요청이 거쳐 가는 승인필요입금내역에 모두 추가한다.
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 한 번 실행하세요.

alter table public."입금내역" add column if not exists "카드결제" text;
alter table public."승인필요입금내역" add column if not exists "카드결제" text;

-- 새 컬럼을 API가 바로 인식하도록 스키마 캐시 새로고침
notify pgrst, 'reload schema';

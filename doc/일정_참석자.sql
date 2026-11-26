-- 팀 캘린더: 일정 참석자 컬럼 추가
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 한 번 실행하세요.
-- 참석자로 지정된 사용자(권한.id)에게도 그 일정이 보인다. 등록자(사용자)는 참석자에 넣지 않는다.

alter table public."일정" add column if not exists "참석자" bigint[] not null default '{}';

-- 참석자로 들어간 일정 조회 (참석자 && '{...}')
create index if not exists "일정_참석자_idx" on public."일정" using gin ("참석자");

notify pgrst, 'reload schema';

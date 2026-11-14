-- 담당 알림 테이블 생성 스크립트
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 한 번 실행하세요.
-- 고객상담(담당 RD·할 일 담당자), A/S(담당자)로 지정·변경되거나,
-- 맡은 일정(연락·미팅·실측·할 일 예정일 / 방문·처리기한)이 등록·변경·삭제되면 그 사람에게 알림을 남긴다.
-- 관리자 이상(CEO·관리자·슈퍼관리자)과 직접 지정한 본인에게는 남기지 않는다.

create table if not exists public."알림" (
  id          bigint generated always as identity primary key,
  "사용자"    bigint      not null,              -- 알림을 받을 사람 (권한.id)
  "구분"      text        not null,              -- 고객상담 / A/S
  "대상id"    bigint      not null,              -- 상담.id 또는 AS접수.id
  "내용"      text        not null,
  "등록자"    text        not null default '',   -- 지정한 사람 이름
  "등록일시"  timestamptz not null default now(),
  "읽은일시"  timestamptz                        -- null이면 안 읽음
);

create index if not exists "알림_사용자_등록일시_idx" on public."알림" ("사용자", "등록일시" desc);
create index if not exists "알림_안읽음_idx" on public."알림" ("사용자") where "읽은일시" is null;

alter table public."알림" enable row level security;

notify pgrst, 'reload schema';

-- (선택) pg_cron: 읽은 지 30일 지난 알림을 매일 새벽 3시(KST)에 정리
-- select cron.schedule(
--   '알림_30일_정리',
--   '0 18 * * *',
--   $$ delete from public."알림" where "읽은일시" < now() - interval '30 days' $$
-- );

-- 고객상담 2단계 (캘린더 자동 등록 · 첨부파일)
-- doc/상담노트.sql을 실행한 뒤, Supabase 대시보드 > SQL Editor 에 붙여 넣고 한 번 실행하세요.

-- 1) 캘린더 자동 등록: 상담노트에서 만든 일정은 상담id로 연결한다.
--    상담노트를 저장할 때마다 그 상담의 일정을 지우고 다시 만들며, 상담을 삭제하면 일정도 함께 지워진다.
alter table public."일정" add column if not exists "상담id" bigint references public."상담" (id) on delete cascade;
create index if not exists "일정_상담id_idx" on public."일정" ("상담id") where "상담id" is not null;

-- 2) 첨부파일: [{"name","stored","size","uploadedAt","by"}] (실제 파일은 서버의 upload/consult 폴더)
alter table public."상담" add column if not exists "첨부" jsonb not null default '[]'::jsonb;

-- 3) 현장으로 전환: 상담노트와 현장정보는 '상담.현장번호'로 연결 (컬럼은 doc/상담노트.sql에서 이미 만듦)
create index if not exists "상담_현장번호_idx" on public."상담" ("현장번호") where "현장번호" is not null;

notify pgrst, 'reload schema';

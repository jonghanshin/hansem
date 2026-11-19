-- 정산의견 테이블 생성 스크립트
-- RD게시 기간에 RD가 정산결과에 대한 의견을 등록하고, 관리자가 그 의견에 응답한다 (영업사원·정산월별).
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 한 번 실행하세요.

create table if not exists public."정산의견" (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  "영업사원"   text        not null,                 -- 의견 대상 RD 이름 (RD게시.영업사원)
  "정산월"     text        not null,                 -- RD게시.정산월 (예: 11월)
  "구분"       text        not null,                 -- RD(의견) / 관리자(응답)
  "작성자ID"   bigint,                               -- 권한.id
  "작성자"     text        not null default '',      -- 작성 당시 이름
  "내용"       text        not null,
  "부모id"     bigint references public."정산의견"(id) on delete cascade, -- 응답이면 대상 의견 id
  constraint "정산의견_구분_확인" check ("구분" in ('RD', '관리자')),
  constraint "정산의견_내용_길이" check (char_length("내용") between 1 and 1000)
);

create index if not exists "정산의견_영업사원_정산월_idx" on public."정산의견" ("영업사원", "정산월", id);

alter table public."정산의견" enable row level security;

notify pgrst, 'reload schema';

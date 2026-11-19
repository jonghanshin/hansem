-- 정산 RD게시 테이블 생성 스크립트
-- 관리자가 정산결과를 저장한 뒤 RD게시로 기간을 정하면, 그 RD는 기간 동안만 정산 메뉴에서 게시된 정산결과를 본다.
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 한 번 실행하세요.

create table if not exists public."RD게시" (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  "영업사원"   text        not null,              -- 현장정보.영업사원 (RD 이름)
  "영업사원ID" text,                              -- 권한.영업사원ID
  "정산월"     text        not null,              -- 현장정보.정산월과 같은 형식 (예: 11월)
  "시작일"     date        not null,              -- 이 날부터 (한국 날짜, 포함)
  "종료일"     date        not null,              -- 이 날까지 (한국 날짜, 포함)
  "게시자"     text,                              -- 게시한 관리자 이름
  "수정일시"   timestamptz not null default now(),
  "현장ids"    bigint[]    not null default '{}', -- 게시한 정산결과의 현장정보.id
  "결과"       jsonb,                             -- 게시할 때의 정산결과 (RD 화면에 그대로 보여준다)
  constraint "RD게시_기간_확인" check ("시작일" <= "종료일")
);

-- (이미 테이블을 만든 경우) 정산결과 컬럼 추가
alter table public."RD게시" add column if not exists "현장ids" bigint[] not null default '{}';
alter table public."RD게시" add column if not exists "결과" jsonb;

-- 같은 영업사원·정산월은 한 건만 (다시 게시하면 기간을 고쳐 쓴다)
create unique index if not exists "RD게시_영업사원_정산월_key" on public."RD게시" ("영업사원", "정산월");

alter table public."RD게시" enable row level security;

notify pgrst, 'reload schema';

-- 게시판 테이블 생성 스크립트
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 한 번 실행하세요.
-- (앱은 서버 전용 secret key로 접근하므로 RLS를 켜 두어도 동작합니다. 브라우저용 공개 키로는 접근할 수 없습니다.)

create table if not exists public."게시판" (
  id           bigint generated always as identity primary key,
  "제목"       text        not null,
  "내용"       text        not null default '',
  "작성자"     bigint,                         -- 권한.id
  "작성자이름" text,
  "공지"       boolean     not null default false, -- 관리자만 지정, 목록 상단 고정
  "조회수"     integer     not null default 0,
  "작성일시"   timestamptz not null default now(),
  "수정일시"   timestamptz
);

-- 서식 있는 글(HTML) 여부. false인 예전 글은 일반 텍스트로 표시한다
-- (이미 게시판 테이블을 만든 경우에도 이 줄만 실행하면 컬럼이 추가됨)
alter table public."게시판" add column if not exists "서식" boolean not null default false;

-- 카테고리 (견적·계약·교육). null이면 카테고리 없는 일반 글로 '전체'에서만 보인다
alter table public."게시판" add column if not exists "카테고리" text;
alter table public."게시판" drop constraint if exists "게시판_카테고리_확인";
alter table public."게시판" add constraint "게시판_카테고리_확인" check ("카테고리" in ('견적', '계약', '교육'));
create index if not exists "게시판_카테고리_id_idx" on public."게시판" ("카테고리", id desc);

create index if not exists "게시판_공지_id_idx" on public."게시판" ("공지", id desc);

-- 첨부파일 정보 (실제 파일은 서버의 upload 폴더에 '저장파일명'으로 저장)
create table if not exists public."게시판첨부" (
  id           bigint generated always as identity primary key,
  "게시글id"   bigint      not null references public."게시판"(id) on delete cascade,
  "원본파일명" text        not null,
  "저장파일명" text        not null unique,
  "크기"       bigint      not null,
  "형식"       text,
  "등록일시"   timestamptz not null default now()
);

create index if not exists "게시판첨부_게시글id_idx" on public."게시판첨부" ("게시글id");

alter table public."게시판" enable row level security;
alter table public."게시판첨부" enable row level security;

-- 조회수 1 증가 (동시에 여러 명이 열어도 정확히 세기 위해 함수로 처리)
create or replace function public."게시판_조회수_증가"(p_id bigint)
returns void
language sql
as $$
  update public."게시판" set "조회수" = "조회수" + 1 where id = p_id;
$$;

-- 새 테이블을 API가 바로 인식하도록 스키마 캐시 새로고침
notify pgrst, 'reload schema';

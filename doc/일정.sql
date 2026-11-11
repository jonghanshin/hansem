-- 팀 캘린더(일정) 테이블 생성 스크립트
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 한 번 실행하세요.
-- (앱은 서버 전용 secret key로 접근하므로 RLS를 켜 두어도 동작합니다. 브라우저용 공개 키로는 접근할 수 없습니다.)

create table if not exists public."일정" (
  id          bigint generated always as identity primary key,
  "사용자"    bigint      not null,              -- 일정의 주인 (권한.id)
  "제목"      text        not null,
  "메모"      text        not null default '',
  "구분"      text        not null default '개인', -- 개인: 본인·선택한 사람에게만 / 공용: 모든 사람에게 보임
  "색상"      text,                              -- 개인 일정 색 (blue, emerald, ...). null이면 사람별 기본 색
  "시작일"    date        not null,
  "종료일"    date        not null,              -- 하루 일정이면 시작일과 같음
  "시작시간"  time,                              -- null이면 종일 일정
  "종료시간"  time,
  "등록일시"  timestamptz not null default now(),
  "수정일시"  timestamptz,
  constraint "일정_기간_확인" check ("종료일" >= "시작일")
);

-- 월별 조회: 선택한 사용자들의 일정 중 해당 기간과 겹치는 것
create index if not exists "일정_사용자_시작일_idx" on public."일정" ("사용자", "시작일");
create index if not exists "일정_사용자_종료일_idx" on public."일정" ("사용자", "종료일");

-- (이미 '구분' 없이 테이블을 만든 경우를 위해) 구분 컬럼 추가 — 이미 있으면 아무 일도 하지 않음
alter table public."일정" add column if not exists "구분" text not null default '개인';
alter table public."일정" drop constraint if exists "일정_구분_확인";
alter table public."일정" add constraint "일정_구분_확인" check ("구분" in ('개인', '공용'));

-- (이미 '색상' 없이 테이블을 만든 경우를 위해) 색상 컬럼 추가
alter table public."일정" add column if not exists "색상" text;

-- 공용 일정은 사용자와 상관없이 기간으로만 조회
create index if not exists "일정_공용_시작일_idx" on public."일정" ("시작일") where "구분" = '공용';

alter table public."일정" enable row level security;

-- 새 테이블을 API가 바로 인식하도록 스키마 캐시 새로고침
notify pgrst, 'reload schema';

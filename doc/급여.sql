-- 급여(기준정보·월급명세서) 테이블 생성 스크립트
-- 관리자가 연도별 기준정보(4대보험 요율·기본급·수당)를 정하고, 그 기준으로 직원별·월별 급여명세서를 작성한다.
-- 직원은 나의정보 > 급여명세서에서 해당 월 29일부터 본인 명세서를 본다.
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 한 번 실행하세요.

-- 연도별 급여 기준정보 (요율·금액은 JSON으로 저장: src/lib/payroll-shared.ts 의 PayrollBase)
create table if not exists public."급여기준" (
  "연도"     int         primary key,
  "기준"     jsonb       not null,
  "수정자"   text,
  "수정일시" timestamptz not null default now()
);

alter table public."급여기준" enable row level security;

-- 직원별·월별 급여명세서 (작성할 때의 금액을 그대로 저장한다. 기준정보를 나중에 고쳐도 바뀌지 않는다)
create table if not exists public."급여명세서" (
  id           bigint generated always as identity primary key,
  "사용자"     bigint      not null,              -- 권한.id
  "이름"       text        not null default '',   -- 작성 당시 이름
  "귀속월"     text        not null,              -- YYYY-MM
  "직급"       text        not null,              -- 수습사원 / 대리 / 과장 / 차장 / 팀장
  "입사일"     date,
  "부서"       text,
  "호봉"       text,
  "지급일"     date,
  "지급"       jsonb       not null,              -- {기본급, 직책수당, 차량유지비, 식대, 성과급, 최소실적지원금}
  "공제"       jsonb       not null,              -- {국민연금, 건강보험, 장기요양보험료, 고용보험, 소득세, 지방소득세}
  "지급액계"   bigint      not null default 0,
  "공제액계"   bigint      not null default 0,
  "차인지급액" bigint      not null default 0,
  "작성자"     text,
  "수정일시"   timestamptz not null default now(),
  constraint "급여명세서_귀속월_확인" check ("귀속월" ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

-- 한 사람의 한 달 명세서는 한 건만 (다시 저장하면 고쳐 쓴다)
create unique index if not exists "급여명세서_사용자_귀속월_key" on public."급여명세서" ("사용자", "귀속월");
create index if not exists "급여명세서_귀속월_idx" on public."급여명세서" ("귀속월");

alter table public."급여명세서" enable row level security;

-- 나의정보 > 급여명세서를 볼 사용자: 권한.월급명세가 'Y'인 사용자만
alter table public."권한" add column if not exists "월급명세" text not null default 'N';
-- 예) update public."권한" set "월급명세" = 'Y' where "이름" = '양다예';

notify pgrst, 'reload schema';

-- 개인 기본급: 값이 있으면 급여 기준정보의 기본급 대신 이 금액으로 명세서를 작성한다 (비우면 기준정보 기본급)
alter table public."권한" add column if not exists "기본급" bigint;
-- 예) update public."권한" set "기본급" = 1500000 where "이름" = '황민희';

notify pgrst, 'reload schema';

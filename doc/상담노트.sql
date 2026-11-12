-- 고객상담(상담노트) 테이블 생성 스크립트
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 한 번 실행하세요.
-- (앱은 서버 전용 secret key로 접근하므로 RLS를 켜 두어도 동작합니다.)

-- 상담노트: 고객 1명당 1행 (엑셀 상담노트 1~5 영역)
create table if not exists public."상담" (
  id              bigint generated always as identity primary key,
  "고객번호"      text        not null unique,          -- 상담일 기준 YYYY-MMDD-순번 (예: 2026-1030-1), 자동 생성

  -- 1. 고객 및 현장 정보
  "고객명"        text        not null,
  "연락처"        text        not null default '',
  "만난장소"      text        not null default '',
  "매장지점"      text        not null default '',
  "현장주소"      text        not null default '',      -- 현장명·주소
  "평형"          numeric,
  "주택유형"      text        not null default '',
  "예산"          integer,                              -- 만원
  "영업사원"      text,                                 -- 담당 RD 이름 (RD는 본인 상담만 본다)
  "영업사원ID"    text,
  "상담일"        date        not null default current_date,
  "시공예정월"    text        not null default '',      -- YYYY-MM
  "진행단계"      text        not null default '상담접수',
  "상담구분"      text        not null default '최초상담',

  -- 2. 연락 및 방문 일정
  "연락상태"      text        not null default '미연락',
  "최근연락일"    date,
  "다음연락일"    date,
  "연락방법"      text        not null default '',
  "다음미팅일시"  timestamp,                            -- 한국 시간 그대로 (시간대 없음)
  "미팅장소"      text        not null default '',
  "미팅상태"      text        not null default '미정',
  "실측일시"      timestamp,
  "실측상태"      text        not null default '미정',
  "일정메모"      text        not null default '',

  -- 3. 희망 공사: [{"항목","상세","우선순위","견적반영"}]
  "공사항목"      jsonb       not null default '[]'::jsonb,

  -- 4. 견적 안내 및 상담 핵심
  "전체공사"      integer,                              -- 만원
  "금액구분"      text        not null default '',
  "예산별제안"    text        not null default '',
  "견적자재안내"  text        not null default '',
  "상담핵심"      text        not null default '',

  -- 5. 후속 할 일: [{"내용","담당자","예정일","상태"}]
  "할일"          jsonb       not null default '[]'::jsonb,

  "현장번호"      text,                                 -- 계약 후 현장으로 전환하면 연결 (2단계)
  "등록자"        bigint,                               -- 권한.id
  "등록일시"      timestamptz not null default now(),
  "수정일시"      timestamptz
);

create index if not exists "상담_영업사원_idx" on public."상담" ("영업사원");
create index if not exists "상담_상담일_idx" on public."상담" ("상담일" desc);

-- 6. 추가 상담 및 연락 기록
create table if not exists public."상담기록" (
  id          bigint generated always as identity primary key,
  "상담id"    bigint      not null references public."상담" (id) on delete cascade,
  "기록일시"  timestamp   not null,                     -- 한국 시간 그대로
  "연락방법"  text        not null default '',
  "담당자"    text        not null default '',
  "내용"      text        not null default '',
  "등록자"    bigint,                                   -- 권한.id
  "등록일시"  timestamptz not null default now()
);

create index if not exists "상담기록_상담id_idx" on public."상담기록" ("상담id", "기록일시" desc);

alter table public."상담" enable row level security;
alter table public."상담기록" enable row level security;

-- 새 테이블을 API가 바로 인식하도록 스키마 캐시 새로고침
notify pgrst, 'reload schema';

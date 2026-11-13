-- A/S 관리 테이블 생성 스크립트
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 한 번 실행하세요.
-- (앱은 서버 전용 secret key로 접근하므로 RLS를 켜 두어도 동작합니다.)

-- A/S 접수: 증상 1건 = 1행 (엑셀 'AS 관리대장' 한 줄 + 'AS 상세노트' 1·2·3·5·6 영역)
create table if not exists public."AS접수" (
  id              bigint generated always as identity primary key,
  "접수번호"      text        not null unique,          -- AS-YYYYMM-순번 (접수일 기준, 자동 생성)

  -- 1. 접수 및 고객·현장 정보 (현장정보에서 찾으면 자동으로 채우고, 없으면 직접 입력)
  "현장번호"      text,                                 -- 현장정보와 연결 (직접 입력한 고객은 null)
  "고객번호"      text        not null default '',
  "고객명"        text        not null,
  "연락처"        text        not null default '',
  "현장주소"      text        not null default '',
  "공사완료일"    date,                                 -- 무상 A/S 기간(1년) 계산 기준
  "영업사원"      text,                                 -- 담당 RD 이름 (RD는 본인 현장의 A/S만 본다)
  "영업사원ID"    text,
  "접수일"        date        not null default current_date,
  "접수경로"      text        not null default '',
  "담당자"        text        not null default '',      -- A/S 담당자 이름 (기본: 관리자 역할)
  "협력업체"      text        not null default '',      -- 처리 협력업체 요약 (업체 / 담당자 / 연락처)
  "협력업체정보"  jsonb,                                -- 처리 협력업체 거래처 정보 (입금 거래처 정보와 같은 항목)

  -- 2. 접수 증상 및 확인 내용
  "공종"          text        not null default '',
  "발생위치"      text        not null default '',
  "발생일"        date,
  "긴급도"        text        not null default '일반',
  "고객요청"      text        not null default '',      -- 증상·요청 내용 (대장의 한 줄 요약)
  "증상"          text        not null default '',      -- 증상·재현 조건
  "초기원인"      text        not null default '',

  -- 3. 방문 및 처리 계획
  "방문예정일시"  timestamp,                            -- 한국 시간 그대로
  "처리기한"      date,
  "진행상태"      text        not null default '접수',
  "최근안내일"    date,
  "유무상"        text        not null default '미정',
  "협의일"        date,
  "처리계획"      text        not null default '',
  "고객안내"      text        not null default '',
  "유무상근거"    text        not null default '',

  -- 5. 완료 및 고객 확인
  "처리완료일"    date,
  "고객확인"      text        not null default '미확인',
  "고객확인일"    date,
  "확인방법"      text        not null default '',
  "처리결과"      text        not null default '',
  "재발여부"      text        not null default '미확인',
  "최종조치"      text        not null default '',
  "추가요청"      text        not null default '',
  "추적계획"      text        not null default '',

  -- 6. 비용 및 증빙 (원)
  "자재비"        integer,
  "인건비"        integer,
  "기타비용"      integer,
  "비용메모"      text        not null default '',
  "고객청구액"    integer,
  "정산상태"      text        not null default '미정',  -- 고객 청구
  "지급상태"      text        not null default '미정',  -- 협력업체 지급

  "원접수id"      bigint references public."AS접수" (id) on delete set null,  -- 재발·재접수일 때 원래 접수
  "사진"          jsonb       not null default '[]'::jsonb,  -- [{"name","stored","size","uploadedAt","by","kind"}] kind: 접수/완료/증빙
  "등록자"        bigint,                               -- 권한.id
  "등록일시"      timestamptz not null default now(),
  "수정일시"      timestamptz
);

create index if not exists "AS접수_현장번호_idx" on public."AS접수" ("현장번호");
create index if not exists "AS접수_영업사원_idx" on public."AS접수" ("영업사원");
create index if not exists "AS접수_접수일_idx" on public."AS접수" ("접수일" desc);

-- 4. 방문 및 처리 이력
create table if not exists public."AS이력" (
  id          bigint generated always as identity primary key,
  "접수id"    bigint      not null references public."AS접수" (id) on delete cascade,
  "일시"      timestamp   not null,                     -- 한국 시간 그대로
  "구분"      text        not null default '',          -- 전화·문자·방문·원격확인·자재발주·기타
  "업체"      text        not null default '',          -- 담당자·업체
  "내용"      text        not null default '',          -- 확인 내용 · 조치 · 사용 자재
  "결과"      text        not null default '',          -- 결과·재방문
  "작성자"    text        not null default '',
  "등록자"    bigint,
  "등록일시"  timestamptz not null default now()
);

create index if not exists "AS이력_접수id_idx" on public."AS이력" ("접수id", "일시" desc);

alter table public."AS접수" enable row level security;
alter table public."AS이력" enable row level security;

notify pgrst, 'reload schema';

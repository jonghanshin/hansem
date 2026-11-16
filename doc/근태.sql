-- 근태관리(출근·퇴근 기록) 테이블 생성 스크립트
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 한 번 실행하세요.

create table if not exists public."근태" (
  id          bigint generated always as identity primary key,
  "사용자"    bigint      not null,              -- 권한.id
  "이름"      text        not null default '',   -- 기록 당시 사용자 이름
  "구분"      text        not null,              -- 출근 / 퇴근 / 출근예정(내일 출근 예정지)
  "장소구분"  text        not null,              -- 죽전사무실 / 죽전스타필드 / 현장 / 기타
  "장소"      text        not null,              -- 화면에 보이는 장소 (현장이면 '현장번호 고객명', 기타면 입력한 내용)
  "현장번호"  text,                              -- 현장 출근·퇴근일 때만
  "근무일"    date        not null,              -- 기록 시각의 한국 날짜 (출근예정은 다음 날)
  "기록일시"  timestamptz not null default now(),
  constraint "근태_구분_확인" check ("구분" in ('출근', '퇴근', '출근예정')),
  constraint "근태_장소구분_확인" check ("장소구분" in ('죽전사무실', '죽전스타필드', '현장', '기타'))
);

create index if not exists "근태_사용자_근무일_idx" on public."근태" ("사용자", "근무일" desc);

alter table public."근태" enable row level security;

-- (이미 테이블을 만든 경우) 구분에 '출근예정' 허용
alter table public."근태" drop constraint if exists "근태_구분_확인";
alter table public."근태" add constraint "근태_구분_확인" check ("구분" in ('출근', '퇴근', '출근예정'));

notify pgrst, 'reload schema';

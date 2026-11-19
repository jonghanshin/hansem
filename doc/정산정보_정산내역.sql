-- 정산내역: 정산결과 저장 때 계산한 상세 결과를 정산정보에 함께 저장한다
-- (정산 화면 > 정산내역에서 RD별로 지금까지 진행한 정산과 그때의 현장별 내역을 다시 본다)
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 한 번 실행하세요.

alter table public."정산정보" add column if not exists "현장ids" bigint[] not null default '{}'; -- 정산한 현장정보.id
alter table public."정산정보" add column if not exists "결과" jsonb;                              -- 저장 당시 정산결과 (현장별 내역·누적이월금·비율)

notify pgrst, 'reload schema';

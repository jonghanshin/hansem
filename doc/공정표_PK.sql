-- Supabase SQL Editor에서 실행합니다.
-- id 컬럼과 기본 키가 없는 공정표 테이블용입니다.
-- 기존 행에도 고유 번호를 채우며, 이후 추가되는 행은 자동으로 번호를 받습니다.
-- id 컬럼이나 기본 키가 이미 있으면 오류로 중단됩니다.

begin;

alter table public."공정표"
  add column id bigint generated always as identity primary key;

notify pgrst, 'reload schema';

commit;

-- 적용 결과 확인
select count(*) as "전체 행 수",
       count(distinct id) as "고유 id 수",
       count(*) filter (where id is null) as "id 누락 수"
from public."공정표";

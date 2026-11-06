-- Supabase 대시보드 > SQL Editor에서 실행하세요.
-- 기존 행에도 고유한 id가 채워지고, 이후 입력하는 행에는 자동으로 번호가 부여됩니다.
-- 기존 업무 데이터는 그대로 유지됩니다. id 컬럼이 이미 있으면 오류로 중단됩니다.

begin;

alter table public."공정별거래처"
  add column id bigint generated always as identity primary key;

-- API에 변경된 테이블 구조를 반영합니다.
notify pgrst, 'reload schema';

commit;

-- 적용 결과 확인: 전체 행 수와 고유 id 수가 같고, id 누락 수가 0이어야 합니다.
select count(*) as "전체 행 수",
       count(distinct id) as "고유 id 수",
       count(*) filter (where id is null) as "id 누락 수"
from public."공정별거래처";

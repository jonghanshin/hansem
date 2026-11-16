-- 근태관리 데이터 한 달치만 보관 (pg_cron)
-- 1) Supabase 대시보드 → Database → Extensions 에서 pg_cron 을 켭니다. (이미 켜져 있으면 생략)
-- 2) SQL Editor 에 붙여 넣고 한 번 실행하세요. 다시 실행해도 같은 이름의 작업이 갱신될 뿐 중복되지 않습니다.

-- 매일 새벽 3시 10분(KST) = 18:10 UTC 에 근무일이 한 달보다 지난 근태 기록 삭제
-- 예) 오늘이 2026-11-16 이면 근무일 2026-10-16 미만(10-15 이전) 기록을 지운다
select cron.schedule(
  '근태_한달_정리',
  '10 18 * * *',
  $$ delete from public."근태"
     where "근무일" < ((now() at time zone 'Asia/Seoul')::date - interval '1 month')::date $$
);

-- 근무일만으로 지우므로 근무일 인덱스 추가 (근태.sql 의 인덱스는 (사용자, 근무일) 복합)
create index if not exists "근태_근무일_idx" on public."근태" ("근무일");

-- 확인
-- select * from cron.job where jobname = '근태_한달_정리';
-- select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = '근태_한달_정리') order by start_time desc limit 10;

-- 지금 바로 한 번 지우기 (선택)
-- delete from public."근태" where "근무일" < ((now() at time zone 'Asia/Seoul')::date - interval '1 month')::date;

-- 해제
-- select cron.unschedule('근태_한달_정리');

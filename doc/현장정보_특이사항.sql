-- 현장정보: 특이사항 컬럼 추가 (현장 상세 화면에서 자유롭게 입력하는 메모)
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 한 번 실행하세요.

alter table public."현장정보" add column if not exists "특이사항" text;

-- 새 컬럼을 API가 바로 인식하도록 스키마 캐시 새로고침
notify pgrst, 'reload schema';

-- 현장정보: 참고파일 컬럼 추가 (현장 상세 화면에서 자재리스트 아래에 올리는 참고 문서 파일 정보 JSON)
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 한 번 실행하세요.

alter table public."현장정보" add column if not exists "참고파일" text;

-- 새 컬럼을 API가 바로 인식하도록 스키마 캐시 새로고침
notify pgrst, 'reload schema';

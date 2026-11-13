-- A/S 처리 협력업체를 입금 등록의 '거래처 정보'와 같은 방식(공정 → 공정별거래처 선택 또는 직접 입력)으로 저장한다.
-- 공정·세부공정·업체·담당자·연락처·계좌·업체비고를 JSON으로 저장하고,
-- 기존 "협력업체" 텍스트 컬럼에는 목록·검색용 요약(업체 / 담당자 / 연락처)을 함께 저장한다.
-- Supabase SQL Editor에서 한 번 실행한다.

alter table public."AS접수" add column if not exists "협력업체정보" jsonb;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';

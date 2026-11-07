-- 현장정보: 한샘 금액(한샘상품가액)을 한샘물대·한샘시공비로 나눠 저장
-- 새 현장/현장 상세 화면의 '한샘' 팝업에서 입력하며, 한샘상품가액 = 한샘상품물대 + 한샘상품시공비 로 저장된다.
-- (기존 한샘물대·한샘시공비 컬럼은 한샘주문진도정보에서 자동 계산되는 값이라 별도 컬럼을 쓴다)
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 한 번 실행하세요.

alter table public."현장정보" add column if not exists "한샘상품물대" bigint;
alter table public."현장정보" add column if not exists "한샘상품시공비" bigint;

-- 새 컬럼을 API가 바로 인식하도록 스키마 캐시 새로고침
notify pgrst, 'reload schema';

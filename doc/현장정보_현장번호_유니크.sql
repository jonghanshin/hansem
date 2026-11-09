-- 현장번호 중복을 DB에서도 막는다 (동시에 저장하는 경우까지 방지)
alter table public."현장정보" add constraint "현장정보_현장번호_key" unique ("현장번호");

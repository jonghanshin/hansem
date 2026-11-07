// 대시보드 합산 아래 입력 줄(BalanceRows) 설정.
// 서버 컴포넌트(page.tsx)에서도 값을 읽어야 하므로 "use client" 파일이 아닌 별도 모듈에 둔다.
// ("use client" 파일에서 import한 상수는 서버에서 실제 값이 아니라 클라이언트 참조가 되어 rowSpan 계산이 깨진다)

/** 예상공사비 기본 비율 (계약금 대비 %) */
export const DEFAULT_EXPECTED_RATE = 85;

/** BalanceRows가 그리는 행 수 (합산 칸 rowSpan 계산용) */
export const BALANCE_ROW_COUNT = 3;

// 입금(한샘 외 시공비) 영수증 파일: 서버와 화면이 함께 쓰는 정의

/** 파일 하나 최대 크기 */
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

/** 입금내역·승인필요입금내역의 영수증 컬럼에 JSON으로 저장하는 정보 */
export type ReceiptInfo = {
  /** 사용자가 올린 원래 파일 이름 */
  name: string;
  /** upload/receipt/ 아래 실제 저장 이름 */
  stored: string;
  size: number;
  uploadedAt: string;
};

/** 저장 이름 형식 (시각-임의값.확장자). 경로 조작을 막기 위해 이 형식만 허용한다 */
const STORED_NAME = /^\d{10,16}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,10})?$/;

export function isReceiptStoredName(value: string): boolean {
  return STORED_NAME.test(value);
}

/** 컬럼 값 → 영수증 정보 (비어 있거나 형식이 다르면 null) */
export function parseReceipt(value: unknown): ReceiptInfo | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const v = JSON.parse(value) as Partial<ReceiptInfo>;
    if (typeof v.name !== "string" || typeof v.stored !== "string" || !isReceiptStoredName(v.stored)) return null;
    return { name: v.name, stored: v.stored, size: Number(v.size) || 0, uploadedAt: String(v.uploadedAt ?? "") };
  } catch {
    return null;
  }
}

export function receiptDownloadUrl(info: ReceiptInfo): string {
  return `/deposits/receipts/${info.stored}`;
}

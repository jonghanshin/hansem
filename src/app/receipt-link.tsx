import { formatFileSize } from "@/lib/board-shared";
import { parseReceipt, receiptDownloadUrl } from "@/lib/receipt-files-shared";

/** 영수증 컬럼 값 → 내려받기 링크 (없거나 형식이 다르면 아무것도 안 보임) */
export function ReceiptLink({ value }: { value: string | null }) {
  const info = parseReceipt(value);
  if (!info) return null;
  return (
    <a href={receiptDownloadUrl(info)} className="font-medium text-blue-700 hover:underline" title={`${info.name} 내려받기`}>
      {info.name}
      <span className="ml-1 text-xs font-normal text-zinc-500">{formatFileSize(info.size)}</span>
    </a>
  );
}

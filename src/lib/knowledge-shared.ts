// 지식자산: 공정별거래처 / 타공정거래처 / 공정표 테이블 설정 (서버·브라우저 공용)
// 컬럼 이름은 Supabase 테이블의 실제 컬럼명과 같아야 한다. 여기에 없는 컬럼은 저장하지 않는다.

export type KnowledgeColumn = {
  key: string;
  /** int: 정수로 저장 (빈 값은 null) */
  type?: "text" | "int";
  /** 입력 화면에서 여러 줄 입력 + 두 칸 차지 */
  multiline?: boolean;
  /** 목록 표에서 칸 최대 폭 (기본 12rem) */
  width?: string;
};

export type KnowledgeTableConfig = {
  table: string;
  label: string;
  description: string;
  columns: KnowledgeColumn[];
  /** 정렬 순서 (마지막은 항상 id) */
  orderBy: string[];
};

/** 타공정거래처 컬럼 */
const OTHER_VENDOR_COLUMNS: KnowledgeColumn[] = [
  { key: "구분", width: "7rem" },
  { key: "공정", width: "8rem" },
  { key: "세부 업무", multiline: true, width: "14rem" },
  { key: "업체·소속", width: "11rem" },
  { key: "성함", width: "6rem" },
  { key: "직책", width: "5rem" },
  { key: "연락처", width: "9rem" },
  { key: "비고", multiline: true, width: "14rem" },
  { key: "은행", width: "6rem" },
  { key: "예금주", width: "6rem" },
  { key: "계좌번호", width: "10rem" },
];

export const KNOWLEDGE_TABLES = {
  vendors: {
    table: "공정별거래처",
    label: "공정별거래처",
    description: "공정별 거래처 연락처·계좌",
    columns: <KnowledgeColumn[]>[
      { key: "구분", width: "7rem" },
      { key: "공정", width: "8rem" },
      { key: "세부 업무", multiline: true, width: "14rem" },
      { key: "업체", width: "11rem" },
      { key: "업체담당자성함", width: "6rem" },
      { key: "직책", width: "5rem" },
      { key: "업체담당자연락처", width: "9rem" },
      { key: "업체비고", multiline: true, width: "14rem" },
      { key: "업체은행", width: "6rem" },
      { key: "업체예금주", width: "6rem" },
      { key: "업체계좌번호", width: "10rem" },
      { key: "대체계좌 은행", width: "6rem" },
      { key: "대체계좌 예금주", width: "6rem" },
      { key: "대체계좌 번호", width: "10rem" },
      { key: "계좌 사용 구분", width: "8rem" },
    ],
    orderBy: [],
  },
  others: {
    table: "타공정거래처",
    label: "타공정거래처",
    description: "기타 공정 거래처",
    columns: [...OTHER_VENDOR_COLUMNS, { key: "분류 기준 / 기존 공정 구분", multiline: true, width: "16rem" }],
    orderBy: [],
  },
  schedule: {
    table: "공정표",
    label: "공정표",
    description: "공정 순서·소요일수·담당 업체",
    columns: <KnowledgeColumn[]>[
      { key: "순서", type: "int", width: "4rem" },
      { key: "공정", width: "10rem" },
      { key: "주요 작업", multiline: true, width: "16rem" },
      { key: "소요일수", width: "6rem" },
      { key: "사장님·업체명", multiline: true, width: "16rem" },
      { key: "연락처", width: "9rem" },
      { key: "구분·진행 조건", multiline: true, width: "14rem" },
      { key: "비고", multiline: true, width: "18rem" },
    ],
    orderBy: ["순서"],
  },
} satisfies Record<string, KnowledgeTableConfig>;

export type KnowledgeTableKey = keyof typeof KNOWLEDGE_TABLES;
export const KNOWLEDGE_KEYS = Object.keys(KNOWLEDGE_TABLES) as KnowledgeTableKey[];

export function isKnowledgeKey(v: unknown): v is KnowledgeTableKey {
  return typeof v === "string" && Object.hasOwn(KNOWLEDGE_TABLES, v);
}

/** 한 행: id + 컬럼명 → 값 */
export type KnowledgeRow = { id: number } & Record<string, string | number | null>;

/** 입력 화면에서 주고받는 값 (모두 문자열) */
export type KnowledgeInput = Record<string, string>;

/** 입금 등록의 '거래처 정보 등록' 팝업용: 공정표의 공정 목록 + 공정별거래처 전체 */
export type VendorPickerData = {
  processes: { 공정: string; 주요작업: string | null }[];
  vendors: KnowledgeRow[];
};

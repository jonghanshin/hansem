import "server-only";

// 정산: 미정산 현장 목록과, 선택한 현장의 현장별 계약금(현장정보)·총입금액·총출금액(입금내역) 계산

import type { DataScope } from "@/lib/data-scope";
import { CONSTRUCTION_TYPE, depositCategoryOf, type Deposit } from "@/lib/deposits";
import { fetchAllDeposits, fetchSites } from "@/lib/sites-data";
import { fetchComputedSources } from "@/lib/site-totals";
import { normalizeSettlement, toMoney, withVat, type HansemOrderLine, type Site } from "@/lib/sites";
import { getSupabaseAdmin, HANSEM_EXTRA_COST_TABLE } from "@/lib/supabase-admin";

/** 한 번에 정산할 수 있는 현장 수 */
export const MAX_SETTLEMENT_SITES = 200;
/** 한샘 주문을 동시에 조회할 현장 수 (DB 요청이 몰리지 않게) */
const CONCURRENCY = 10;

export type SettlementCandidate = Pick<
  Site,
  "id" | "현장번호" | "고객명" | "영업사원" | "정산월" | "계약가" | "시공비" | "한샘상품가액" | "홈씨씨상품가액"
>;

/** 상세 팝업에 보여줄 입금내역 한 행 */
export type SettlementDeposit = {
  id: number;
  /** 출금 묶음 (settlementGroupOf): 홈씨씨 = 홈씨씨창호, 시공비 = 한샘 외 시공비, 그 외 = 기타 */
  묶음: string;
  날짜: string | null;
  입금구분: string | null;
  입금자: string | null;
  입금내용: string | null;
  업체: string | null;
  /** 금액 (숫자로 읽을 수 없으면 null, 원문은 금액원문) */
  금액: number | null;
  금액원문: string | null;
  /** 한샘 외 시공비의 부가세 포함 여부: 포함 / 미포함 (예전 내역은 비어 있음) */
  부가세포함: string | null;
};

export type SettlementLine = {
  id: number;
  현장번호: string;
  고객명: string | null;
  영업사원: string | null;
  영업사원ID: string | null;
  정산월: string | null;
  /** 현장정보.계약가 */
  계약금: number | null;
  /** 입금내역 중 입출금 = 입금 */
  총입금액: number;
  /** 한샘주문진도정보 확정 주문의 공급가(부가세 포함) + 한샘추가시공비 테이블 합계 + 입금내역 중 입출금 = 출금 */
  총출금액: number;
  입금내역: SettlementDeposit[];
  출금내역: SettlementDeposit[];
  한샘: SettlementHansem;
};

/** 한샘추가시공비 테이블의 한 행 */
export type SettlementExtraCost = {
  요청번호: number | null;
  시공시작일: string | null;
  시공유형: string | null;
  항목: string | null;
  수량: number | null;
  시공협력사명: string | null;
  청구처: string | null;
  확정여부: string | null;
  /** 숫자로 읽을 수 없으면 null, 원문은 시공비원문 */
  시공비: number | null;
  시공비원문: string | null;
};

/** 총출금액의 한샘 부분: 한샘주문진도정보의 확정 주문 공급가(부가세 포함) + 한샘추가시공비 테이블의 현장별 합계 */
export type SettlementHansem = {
  공급가: number;
  /** 주문별 부가세 포함 금액의 합 (상세 표의 세로 합계와 일치) */
  "공급가(부가세포함)": number;
  "공급가(HS)": number;
  "공급가(S1)": number;
  추가시공비: number;
  추가시공비내역: SettlementExtraCost[];
  주문: HansemOrderLine[];
};

type ExtraCostRecord = {
  요청번호: number | null;
  시공시작일: string | null;
  시공유형: string | null;
  "품목/추가시공비명": string | null;
  수량: number | null;
  시공협력사명: string | null;
  청구처: string | null;
  확정여부: string | null;
  시공비: string | null;
};

/** 현장코드가 일치하는 한샘추가시공비 행 */
async function fetchExtraCosts(siteNumber: string): Promise<SettlementExtraCost[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(HANSEM_EXTRA_COST_TABLE)
    .select("*")
    .eq("현장코드", siteNumber)
    .order("시공시작일", { ascending: true });
  if (error) throw new Error(`한샘추가시공비 조회 실패: ${error.message}`);
  return (data as unknown as ExtraCostRecord[]).map((r) => ({
    요청번호: r.요청번호,
    시공시작일: r.시공시작일,
    시공유형: r.시공유형,
    항목: r["품목/추가시공비명"],
    수량: r.수량,
    시공협력사명: r.시공협력사명,
    청구처: r.청구처,
    확정여부: r.확정여부,
    시공비: toMoney(r.시공비) ?? null,
    시공비원문: r.시공비,
  }));
}

export type SettlementResult = { lines: SettlementLine[]; warnings: string[] };

function isCandidate(site: Site): boolean {
  return normalizeSettlement(site.정산여부) === "미정산" && !!site.현장번호?.trim();
}

/** 정산여부가 미정산인 현장 */
export async function fetchSettlementCandidates(scope: DataScope): Promise<SettlementCandidate[]> {
  return (await fetchSites(scope)).filter(isCandidate).map((s) => ({
    id: s.id,
    현장번호: s.현장번호,
    고객명: s.고객명,
    영업사원: s.영업사원,
    정산월: s.정산월,
    계약가: s.계약가,
    시공비: s.시공비,
    한샘상품가액: s.한샘상품가액,
    홈씨씨상품가액: s.홈씨씨상품가액,
  }));
}

/** 정산 화면 총출금액의 묶음: 홈씨씨(홈씨씨창호), 시공비(한샘 외 시공비, 나비가 거래처에 지급), 그 외는 기타 */
function settlementGroupOf(d: Deposit): "홈씨씨" | "시공비" | "기타" {
  const category = depositCategoryOf(d);
  if (category === "홈씨씨창호") return "홈씨씨";
  if (category === CONSTRUCTION_TYPE) return "시공비";
  return "기타";
}

function toDetail(d: Deposit): SettlementDeposit {
  return {
    id: d.id,
    묶음: settlementGroupOf(d),
    날짜: d.dateIso ?? d.날짜,
    입금구분: d.입금구분,
    입금자: d.입금자,
    입금내용: d.입금내용,
    업체: d.업체,
    금액: d.amount,
    금액원문: d.입금액,
    부가세포함: d.부가세포함,
  };
}

const sum = (rows: SettlementDeposit[]) => rows.reduce((acc, r) => acc + (r.금액 ?? 0), 0);

/** 선택한 현장의 정산 내역 (미정산이 아닌 현장은 제외) */
export async function computeSettlement(ids: number[], scope: DataScope): Promise<SettlementResult> {
  const wanted = new Set(ids);
  const [sites, deposits] = await Promise.all([fetchSites(scope), fetchAllDeposits(scope)]);
  const targets = sites.filter((s) => wanted.has(s.id) && isCandidate(s));

  const byNumber = new Map<string, Deposit[]>();
  for (const s of targets) byNumber.set(s.현장번호!.trim(), []);
  for (const d of deposits) byNumber.get(d.현장번호?.trim() ?? "")?.push(d);

  // 현장별 확정 주문의 공급가 (현장정보.한샘공급가합계와 같은 기준)
  const hansem = new Map<string, SettlementHansem>();
  const numberList = [...byNumber.keys()];
  for (let i = 0; i < numberList.length; i += CONCURRENCY) {
    await Promise.all(
      numberList.slice(i, i + CONCURRENCY).map(async (no) => {
        const [source, 추가시공비내역] = await Promise.all([fetchComputedSources(no, "한샘공급가합계"), fetchExtraCosts(no)]);
        const 주문 = source.kind === "orders" ? source.rows : [];
        hansem.set(no, {
          공급가: source.total,
          "공급가(부가세포함)": 주문.reduce((acc, o) => acc + withVat(o.공급가 ?? 0), 0),
          "공급가(HS)": 주문.reduce((acc, o) => acc + (o["공급가(HS)"] ?? 0), 0),
          "공급가(S1)": 주문.reduce((acc, o) => acc + (o["공급가(S1)"] ?? 0), 0),
          추가시공비: 추가시공비내역.reduce((acc, r) => acc + (r.시공비 ?? 0), 0),
          추가시공비내역,
          주문,
        });
      }),
    );
  }

  const warnings: string[] = [];
  const lines = targets.map((s): SettlementLine => {
    const no = s.현장번호!.trim();
    const rows = byNumber.get(no) ?? [];
    for (const d of rows) {
      if (d.amount === null && (d.입출금 === "입금" || d.입출금 === "출금")) {
        warnings.push(`${no}: ${d.입출금}액 "${d.입금액 ?? ""}"은(는) 숫자가 아니어서 합계에서 제외했습니다`);
      }
    }
    const 입금내역 = rows.filter((d) => d.입출금 === "입금").map(toDetail);
    const 출금내역 = rows.filter((d) => d.입출금 === "출금").map(toDetail);
    const 한샘 = hansem.get(no) ?? { 공급가: 0, "공급가(부가세포함)": 0, "공급가(HS)": 0, "공급가(S1)": 0, 추가시공비: 0, 추가시공비내역: [], 주문: [] };
    for (const r of 한샘.추가시공비내역) {
      if (r.시공비 === null && r.시공비원문) {
        warnings.push(`${no}: 추가시공비 "${r.시공비원문}"은(는) 숫자가 아니어서 합계에서 제외했습니다`);
      }
    }
    return {
      id: s.id,
      현장번호: no,
      고객명: s.고객명,
      영업사원: s.영업사원,
      영업사원ID: s.영업사원ID,
      정산월: s.정산월,
      계약금: s.계약가,
      총입금액: sum(입금내역),
      총출금액: 한샘["공급가(부가세포함)"] + 한샘.추가시공비 + sum(출금내역),
      입금내역,
      출금내역,
      한샘,
    };
  });
  return { lines, warnings };
}

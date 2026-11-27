import { formatMonth, formatWon, type Deductions, type Earnings } from "@/lib/payroll-shared";

// 급여 지급명세서 (월급명세서 PDF와 같은 모양). 관리자 작성 화면의 미리보기와 나의정보 > 급여명세서에서 함께 쓴다.

export type PayslipViewData = {
  귀속월: string;
  이름: string;
  직급: string;
  입사일: string | null;
  부서: string | null;
  호봉: string | null;
  지급일: string | null;
  지급: Earnings;
  공제: Deductions;
  지급액계: number;
  공제액계: number;
  차인지급액: number;
};

export const COMPANY_NAME = "나비아키텍쳐";

const EARNING_ROWS = ["기본급", "직책수당", "차량유지비", "식대", "성과급", "최소실적지원금"] as const;
const DEDUCTION_ROWS = ["국민연금", "건강보험", "장기요양보험료", "고용보험", "소득세", "지방소득세"] as const;

const CELL = "border border-zinc-800 px-2 py-1.5";

export function PayslipView({
  slip,
  bonusSlot,
}: {
  slip: PayslipViewData;
  /** 성과급 칸에 넣을 내용 (정산 상세 보기 버튼 등). 없으면 '성과급' 글자만 */
  bonusSlot?: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl bg-white text-zinc-900">
      <h2 className="text-center text-base font-semibold sm:text-lg">{formatMonth(slip.귀속월)}분 지급명세서</h2>
      <div className="mt-4 mb-1 flex justify-between gap-2 text-sm">
        <span>회사명 : {COMPANY_NAME}</span>
        <span className="tabular-nums">지급일 : {slip.지급일 ?? ""}</span>
      </div>
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[30%]" />
          <col className="w-[20%]" />
          <col className="w-[30%]" />
          <col className="w-[20%]" />
        </colgroup>
        <tbody>
          <tr className="bg-zinc-200">
            <td className={`${CELL} border-r-0 text-center`} colSpan={2}>
              사원명 : {slip.이름}
            </td>
            <td className={`${CELL} border-l-0 text-center tabular-nums`} colSpan={2}>
              입사일 : {slip.입사일 ?? ""}
            </td>
          </tr>
          <tr className="bg-zinc-200">
            <td className={`${CELL} border-r-0`}>부서 {slip.부서 ?? ""}</td>
            <td className={`${CELL} border-x-0`}>직위 : {slip.직급}</td>
            <td className={`${CELL} border-l-0 text-center`} colSpan={2}>
              호봉 {slip.호봉 ?? ""}
            </td>
          </tr>
          <tr className="bg-zinc-200 font-medium">
            <td className={CELL}>지급내역</td>
            <td className={CELL}>지급액</td>
            <td className={CELL}>공제내역</td>
            <td className={CELL}>공제액</td>
          </tr>
          {EARNING_ROWS.map((e, i) => {
            const d = DEDUCTION_ROWS[i];
            return (
              <tr key={e}>
                <td className={CELL}>{e === "성과급" && bonusSlot ? bonusSlot : e}</td>
                <td className={`${CELL} text-right tabular-nums`}>{formatWon(slip.지급[e])}</td>
                <td className={CELL}>{d}</td>
                <td className={`${CELL} text-right tabular-nums`}>{formatWon(slip.공제[d])}</td>
              </tr>
            );
          })}
          <tr className="font-semibold">
            <td className={`${CELL} text-center font-normal`}>지급액계</td>
            <td className={`${CELL} text-right tabular-nums`}>{formatWon(slip.지급액계)}</td>
            <td className={`${CELL} text-center font-normal`}>공제액계</td>
            <td className={`${CELL} text-right tabular-nums`}>{formatWon(slip.공제액계)}</td>
          </tr>
          <tr>
            <td className={`${CELL} text-center`} colSpan={3}>
              차인지급액
            </td>
            <td className={`${CELL} text-right font-bold tabular-nums`}>{formatWon(slip.차인지급액)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

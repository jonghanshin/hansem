// 정산의견: RD게시 기간에 RD가 정산결과에 대한 의견을 남기고 관리자가 응답한다 (화면·서버 공용)

export const OPINION_MAX_LENGTH = 1000;

export type SettlementOpinion = {
  id: number;
  created_at: string;
  영업사원: string;
  정산월: string;
  /** RD = 의견, 관리자 = 응답 */
  구분: "RD" | "관리자";
  작성자: string;
  내용: string;
  /** 응답이면 대상 의견 id */
  부모id: number | null;
};

/** RD게시 현황 등에서 쓰는 키 */
export const opinionKey = (영업사원: string, 정산월: string) => `${영업사원.trim()}|${정산월.trim()}`;

/** 관리자 응답이 아직 없는 RD 의견 수 */
export function unansweredCount(opinions: Pick<SettlementOpinion, "id" | "구분" | "부모id">[]): number {
  const answered = new Set(opinions.filter((o) => o.구분 === "관리자" && o.부모id !== null).map((o) => o.부모id));
  return opinions.filter((o) => o.구분 === "RD" && o.부모id === null && !answered.has(o.id)).length;
}

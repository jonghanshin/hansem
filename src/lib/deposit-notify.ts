import "server-only";

// 입금 승인 요청·확인사항 요청과 답변을 카카오 알림톡으로 알린다.
// 알림은 부가 기능이므로 실패해도 입금 처리에 영향을 주지 않는다 (오류는 서버 로그에만 남긴다).

import { APPROVER_ROLES, PRIVATE_SITE_NUMBERS, SUPER_ADMIN_ROLE } from "@/lib/data-scope";
import type { DepositRow } from "@/lib/deposits";
import { KAKAO_TEMPLATES, sendAlimtalk } from "@/lib/kakao";
import { AUTH_TABLE, getSupabaseAdmin } from "@/lib/supabase-admin";

type Account = { id: number; 이름: string | null; 역할: string | null; 전화번호?: string | null };

async function fetchAccounts(): Promise<Account[]> {
  const { data, error } = await getSupabaseAdmin().from(AUTH_TABLE).select("*");
  if (error) throw new Error(`권한 조회 실패: ${error.message}`);
  return data as unknown as Account[];
}

type NotifyStatus = "승인요청" | "확인사항요청" | "확인사항답변";

/** 템플릿의 '구분'(#{입금구분}) 자리에 고객명·입금구분·진행 상태를 함께 넣어 보낸다 (예: 홍길동 계약금1 승인요청) */
async function sendToAll(row: DepositRow, recipients: Account[], status: NotifyStatus) {
  const label = status;
  const templateId = KAKAO_TEMPLATES.deposit();
  if (!templateId) {
    console.error(`[알림톡:${label}] SOLAPI_TEMPLATE_DEPOSIT이 설정되지 않았습니다`);
    return;
  }
  // 알림톡은 빈 변수를 받지 않으므로 값이 없으면 - 로 보낸다
  const value = (v: string | null | undefined) => v?.trim() || "-";
  const withPhone = recipients.filter((a) => a.전화번호?.trim());
  if (withPhone.length < recipients.length) {
    console.error(`[알림톡:${label}] 전화번호 번호가 없어 ${recipients.length - withPhone.length}명을 건너뜁니다`);
  }
  const results = await Promise.all(
    withPhone.map((a) =>
      sendAlimtalk({
        to: a.전화번호!,
        templateId,
        variables: {
          임직원: value(a.이름),
          고객명: value(row.고객명),
          RD: value(row.영업사원),
          현장번호: value(row.현장번호),
          금액: value(row.입금액),
          입금구분: [row.고객명?.trim(), row.입금구분?.trim(), status].filter(Boolean).join(" "),
        },
      }),
    ),
  );
  for (const r of results) if (!r.ok) console.error(`[알림톡:${label}] ${r.error}`);
}

/** 승인 권한자에게 알린다 (작성한 본인 제외, 비공개 현장은 슈퍼관리자에게만) */
async function notifyApprovers(row: DepositRow, excludeId: number, status: NotifyStatus): Promise<void> {
  try {
    const isPrivate = PRIVATE_SITE_NUMBERS.includes(row.현장번호 ?? "");
    const recipients = (await fetchAccounts()).filter((a) => {
      const role = a.역할?.trim() ?? "";
      return a.id !== excludeId && (isPrivate ? role === SUPER_ADMIN_ROLE : APPROVER_ROLES.includes(role));
    });
    await sendToAll(row, recipients, status);
  } catch (e) {
    console.error(`[알림톡:${status}]`, e);
  }
}

/** 승인 요청: 승인 권한자에게 알린다 */
export function notifyDepositRequested(row: DepositRow, requesterId: number): Promise<void> {
  return notifyApprovers(row, requesterId, "승인요청");
}

/** 확인사항 답변: 요청자가 의견을 남기면 승인 권한자에게 알린다 */
export function notifyCommentToApprovers(row: DepositRow, authorId: number): Promise<void> {
  return notifyApprovers(row, authorId, "확인사항답변");
}

/** 확인사항 요청: 관리자가 의견을 남기면 승인 요청을 한 사람에게 알린다 */
export async function notifyCommentToRequester(row: DepositRow, requesterId: number | null): Promise<void> {
  try {
    if (requesterId == null) return;
    const recipients = (await fetchAccounts()).filter((a) => a.id === requesterId);
    await sendToAll(row, recipients, "확인사항요청");
  } catch (e) {
    console.error("[알림톡:확인사항요청]", e);
  }
}

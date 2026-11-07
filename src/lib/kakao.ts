import "server-only";

import { MessageNotReceivedError, SolapiMessageService } from "solapi";

// SOLAPI(솔라피)로 카카오 알림톡을 보낸다. 서버에서만 사용한다 (API 키가 브라우저로 나가지 않게).
//
// 환경 변수 (.env.local / 운영 서버 환경 변수)
//   SOLAPI_API_KEY          솔라피 콘솔 > 개발/연동 > API Key
//   SOLAPI_API_SECRET       위 API Key의 Secret
//   SOLAPI_SENDER           솔라피에 등록·승인된 발신번호 (알림톡 실패 시 문자 대체발송에도 사용). 예: 0212345678
//   SOLAPI_KAKAO_PFID       카카오 채널 연동 후 받은 채널 ID (pfId, "KA01PF..." 형식)
//   SOLAPI_TEST_RECIPIENT   (선택) 값이 있으면 모든 메시지를 이 번호로만 보낸다. 개발 중 실제 고객에게 나가지 않게 반드시 설정
//   SOLAPI_TEMPLATE_DEPOSIT 알림톡 템플릿 '입금 관련 알림' ID (변수: 임직원, 고객명, RD, 현장번호, 금액, 입금구분)
//
// 알림톡은 카카오 검수를 통과한 템플릿으로만 보낼 수 있다. 템플릿 ID와 변수는 솔라피 콘솔에서 확인한다.

const ENV_KEYS = ["SOLAPI_API_KEY", "SOLAPI_API_SECRET", "SOLAPI_SENDER", "SOLAPI_KAKAO_PFID"] as const;

type KakaoConfig = {
  apiKey: string;
  apiSecret: string;
  sender: string;
  pfId: string;
  /** 설정되어 있으면 모든 수신번호를 이 번호로 바꾼다 (개발·테스트용) */
  testRecipient: string | null;
};

/** 설정되지 않은 환경 변수 이름 목록 (모두 있으면 빈 배열) */
export function missingKakaoEnv(): string[] {
  return ENV_KEYS.filter((k) => !process.env[k]?.trim());
}

export function isKakaoConfigured(): boolean {
  return missingKakaoEnv().length === 0;
}

function config(): KakaoConfig {
  const missing = missingKakaoEnv();
  if (missing.length) throw new Error(`카카오 알림톡 설정이 없습니다: ${missing.join(", ")}`);
  return {
    apiKey: process.env.SOLAPI_API_KEY!.trim(),
    apiSecret: process.env.SOLAPI_API_SECRET!.trim(),
    sender: normalizePhone(process.env.SOLAPI_SENDER!) ?? process.env.SOLAPI_SENDER!.trim(),
    pfId: process.env.SOLAPI_KAKAO_PFID!.trim(),
    testRecipient: normalizePhone(process.env.SOLAPI_TEST_RECIPIENT ?? ""),
  };
}

let service: SolapiMessageService | null = null;
function solapi(cfg: KakaoConfig) {
  service ??= new SolapiMessageService(cfg.apiKey, cfg.apiSecret);
  return service;
}

/** "010-1234-5678", "010 1234 5678" → "01012345678". 숫자가 아니면 null */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/[\s()-]/g, "");
  return /^0\d{8,10}$/.test(digits) ? digits : null;
}

/** 알림톡 템플릿 ID (환경 변수). 없으면 null */
export const KAKAO_TEMPLATES = {
  /** 입금 관련 알림 — 변수: 임직원, 고객명, RD, 현장번호, 금액, 입금구분 */
  deposit: () => process.env.SOLAPI_TEMPLATE_DEPOSIT?.trim() || null,
} as const;

export type AlimtalkRequest = {
  /** 고객 휴대폰 번호 (하이픈 있어도 됨) */
  to: string;
  /** 솔라피 콘솔에 등록·검수 완료된 알림톡 템플릿 ID */
  templateId: string;
  /** 템플릿 변수. 키는 "고객명" 또는 "#{고객명}" 모두 가능 (SDK가 #{ }를 붙인다) */
  variables?: Record<string, string>;
  /** true면 알림톡 실패 시 문자(SMS/LMS)로 대체 발송하지 않는다. 기본 false(대체 발송) */
  disableSms?: boolean;
};

export type AlimtalkResult =
  | { ok: true; groupId: string; to: string; redirectedFrom: string | null }
  | { ok: false; error: string };

/**
 * 알림톡 1건 발송. 발송 '접수' 결과를 돌려준다 (실제 도착 여부는 솔라피 콘솔 > 발송 내역에서 확인).
 * SOLAPI_TEST_RECIPIENT가 있으면 수신번호를 그 번호로 바꿔 보낸다.
 */
export async function sendAlimtalk(req: AlimtalkRequest): Promise<AlimtalkResult> {
  let cfg: KakaoConfig;
  try {
    cfg = config();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const original = normalizePhone(req.to);
  if (!original) return { ok: false, error: `휴대폰 번호 형식이 올바르지 않습니다: ${req.to}` };
  const to = cfg.testRecipient ?? original;

  try {
    const res = await solapi(cfg).send({
      to,
      from: cfg.sender,
      kakaoOptions: {
        pfId: cfg.pfId,
        templateId: req.templateId,
        variables: req.variables ?? {},
        disableSms: req.disableSms ?? false,
      },
    });
    const failed = res.failedMessageList[0];
    if (failed) return { ok: false, error: `발송 접수 실패 (${failed.statusCode}): ${failed.statusMessage}` };
    return { ok: true, groupId: res.groupInfo.groupId, to, redirectedFrom: cfg.testRecipient ? original : null };
  } catch (e) {
    if (e instanceof MessageNotReceivedError) {
      const f = e.failedMessageList[0];
      return { ok: false, error: f ? `발송 접수 실패 (${f.statusCode}): ${f.statusMessage}` : e.message };
    }
    console.error("[sendAlimtalk]", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

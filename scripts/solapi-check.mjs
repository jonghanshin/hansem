// SOLAPI(카카오 알림톡) 연동 점검 스크립트. 앱과 별개로 .env.local 값만 읽어 실행한다.
//
//   npm run solapi:check
//     → 잔액, 연동된 카카오 채널(pfId), 알림톡 템플릿(ID·상태·변수) 목록 출력
//
//   npm run solapi:send -- <템플릿ID> [변수=값 ...]
//     → SOLAPI_TEST_RECIPIENT 번호로 테스트 알림톡 1건 발송 (실제 고객에게는 보내지 않음)
//     예) npm run solapi:send -- KA01TP1234 고객명=홍길동 현장번호=261019C02228

import { SolapiMessageService } from "solapi";

const env = (k) => process.env[k]?.trim() ?? "";
const missing = ["SOLAPI_API_KEY", "SOLAPI_API_SECRET"].filter((k) => !env(k));
if (missing.length) {
  console.error(`.env.local에 ${missing.join(", ")}가 없습니다.`);
  process.exit(1);
}
const svc = new SolapiMessageService(env("SOLAPI_API_KEY"), env("SOLAPI_API_SECRET"));
const [cmd = "check", ...args] = process.argv.slice(2);

if (cmd === "check") {
  const balance = await svc.getBalance();
  console.log(`잔액: ${balance.balance ?? "-"}원 · 포인트: ${balance.point ?? "-"}`);

  const { channelList } = await svc.getKakaoChannels();
  console.log(`\n카카오 채널 ${channelList.length}개`);
  for (const c of channelList) {
    const mark = c.channelId === env("SOLAPI_KAKAO_PFID") ? "  ← SOLAPI_KAKAO_PFID" : "";
    console.log(`  ${c.channelId}  ${c.searchId ?? ""}${mark}`);
  }

  const { templateList } = await svc.getKakaoAlimtalkTemplates({ limit: 100 });
  console.log(`\n알림톡 템플릿 ${templateList.length}개 (APPROVED만 발송 가능)`);
  for (const t of templateList) {
    const vars = [...new Set((t.content ?? "").match(/#\{[^}]+\}/g) ?? [])].join(" ");
    console.log(`  ${t.templateId}  [${t.status}]  ${t.name}${vars ? `  변수: ${vars}` : ""}`);
  }

  const notSet = ["SOLAPI_SENDER", "SOLAPI_KAKAO_PFID", "SOLAPI_TEST_RECIPIENT"].filter((k) => !env(k));
  if (notSet.length) console.log(`\n아직 비어 있는 설정: ${notSet.join(", ")}`);
} else if (cmd === "send") {
  const [templateId, ...pairs] = args;
  const to = env("SOLAPI_TEST_RECIPIENT").replace(/-/g, "");
  if (!templateId) throw new Error("템플릿 ID를 넣어 주세요: npm run solapi:send -- <템플릿ID> [변수=값 ...]");
  if (!to) throw new Error("테스트 발송은 SOLAPI_TEST_RECIPIENT 번호로만 보냅니다. .env.local에 설정해 주세요.");
  for (const k of ["SOLAPI_SENDER", "SOLAPI_KAKAO_PFID"]) if (!env(k)) throw new Error(`.env.local에 ${k}가 없습니다.`);
  const variables = Object.fromEntries(pairs.map((p) => p.split(/=(.*)/s).slice(0, 2)));
  const res = await svc.send({
    to,
    from: env("SOLAPI_SENDER").replace(/-/g, ""),
    kakaoOptions: { pfId: env("SOLAPI_KAKAO_PFID"), templateId, variables },
  });
  console.log(`접수 완료 · groupId ${res.groupInfo.groupId} · 수신 ${to}`);
  if (res.failedMessageList.length) console.log("실패:", res.failedMessageList);
} else {
  console.error(`알 수 없는 명령: ${cmd} (check | send)`);
  process.exit(1);
}

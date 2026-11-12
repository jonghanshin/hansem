"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { deleteAsAction, updateAsAction } from "@/app/as-actions";
import {
  AS_BILLING_STATES,
  AS_CHARGES,
  AS_CHECK_METHODS,
  AS_CUSTOMER_CHECKS,
  AS_LONG_TEXT_MAX,
  AS_PAY_STATES,
  AS_RECURRENCES,
  AS_RESULTS,
  AS_ROUTES,
  AS_STATES,
  AS_TRADES,
  AS_URGENCIES,
  asCheckOf,
  checkBadge,
  tradesOf,
  costTotal,
  urgencyBadge,
  warrantyInfo,
  type AsCase,
  type AsMember,
} from "@/lib/as-shared";
import { formatDate } from "@/lib/consult-shared";

import { WarrantyNote } from "./as-new-form";

const INPUT =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-zinc-100";
const BUTTON = "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100";

const TABS = [
  { key: "info", label: "접수정보" },
  { key: "symptom", label: "증상" },
  { key: "plan", label: "처리계획" },
  { key: "history", label: "이력" },
  { key: "done", label: "완료·확인" },
  { key: "cost", label: "비용" },
  { key: "photos", label: "사진" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

type Step = "visit" | "done" | "confirm";

type Props = {
  c: AsCase;
  members: AsMember[];
  today: string;
  /** 같은 현장(또는 같은 고객)의 다른 A/S */
  related: { id: number; 접수번호: string; 접수일: string; 공종: string; 고객요청: string; 진행상태: string }[];
  history: React.ReactNode;
  historyCount: number;
  photos: React.ReactNode;
};

export function AsForm({ c, members, today, related, history, historyCount, photos }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("info");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [step, setStep] = useState<Step | null>(null);
  const [pending, startTransition] = useTransition();

  // 이력·진행 버튼 등으로 서버 값이 바뀌면 입력칸을 새 값으로 다시 그린다
  const version = c.수정일시 ?? c.등록일시;
  const [shownVersion, setShownVersion] = useState(version);
  if (shownVersion !== version) {
    setShownVersion(version);
    setDirty(false);
  }

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const check = asCheckOf(c, today);
  const closed = check === "종결" || check === "취소";
  const warranty = warrantyInfo(c.공사완료일, c.접수일);
  const outsideForm = tab === "history" || tab === "photos";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await updateAsAction(c.id, form);
      if (!res.ok) return setError(res.error);
      setDirty(false);
      setSaved(true);
    });
  }

  function remove() {
    if (!confirm(`${c.접수번호} (${c.고객명}) A/S와 처리 이력·사진을 모두 삭제할까요?`)) return;
    startTransition(async () => {
      const res = await deleteAsAction(c.id);
      if (!res.ok) return setError(res.error);
      setDirty(false);
      router.push("/as");
    });
  }

  const show = (key: TabKey) => tab === key;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-3 p-4 pb-24 sm:p-6 sm:pb-24">
      <Link href="/as" className="text-sm text-zinc-500 hover:text-zinc-800 hover:underline">
        ← A/S 목록
      </Link>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm text-zinc-400 tabular-nums">{c.접수번호}</span>
        <h1 className="text-xl font-semibold text-zinc-900">{c.고객명}</h1>
        {c.긴급도 !== "일반" && <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${urgencyBadge(c.긴급도)}`}>{c.긴급도}</span>}
        {c.공종 && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700">{c.공종}</span>}
        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${checkBadge(check)}`}>{check}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {c.현장번호 && (
            <Link href={`/sites?site=${encodeURIComponent(c.현장번호)}`} className={`${BUTTON} py-1`}>
              현장 {c.현장번호} →
            </Link>
          )}
          <button type="button" onClick={remove} disabled={pending} className="rounded-md px-2.5 py-1 text-sm text-red-600 hover:bg-red-50">
            삭제
          </button>
        </div>
      </div>
      <p className="text-sm text-zinc-700">{c.고객요청}</p>

      <Progress c={c} closed={closed} onStep={(s) => (dirty ? setError("저장하지 않은 변경이 있습니다. 먼저 저장하세요.") : setStep(s))} />

      <nav
        className="sticky top-11 z-20 -mx-4 flex gap-1 overflow-x-auto border-b border-zinc-200 bg-zinc-50/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:bg-white sm:px-2"
        aria-label="A/S 상세노트 영역"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${tab === t.key ? "bg-zinc-900 font-semibold text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            {t.label}
            {t.key === "history" && historyCount > 0 && <Count n={historyCount} />}
            {t.key === "photos" && c.사진.length > 0 && <Count n={c.사진.length} />}
          </button>
        ))}
      </nav>

      <form
        key={version}
        onSubmit={submit}
        onChange={() => {
          setDirty(true);
          setSaved(false);
        }}
        className={outsideForm ? "hidden" : "space-y-3"}
      >
        <Section title="1. 접수 및 고객·현장 정보" hidden={!show("info")}>
          <Grid>
            <Field label="현장번호">
              {c.현장번호 ? (
                <Link
                  href={`/sites?site=${encodeURIComponent(c.현장번호)}`}
                  className="block rounded-md border border-zinc-300 bg-zinc-50 px-2.5 py-1.5 text-sm font-semibold text-blue-700 tabular-nums hover:bg-zinc-100"
                >
                  {c.현장번호} →
                </Link>
              ) : (
                <p className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm text-zinc-500">현장정보 연결 없음 (직접 입력)</p>
              )}
            </Field>
            <Field label="고객명" required>
              <input name="고객명" defaultValue={c.고객명} required maxLength={50} className={INPUT} />
            </Field>
            <Field label="연락처">
              <span className="flex gap-1.5">
                <input name="연락처" type="tel" defaultValue={c.연락처} maxLength={50} className={INPUT} />
                {c.연락처 && (
                  <a href={`tel:${c.연락처.replace(/[^\d+]/g, "")}`} className={`${BUTTON} shrink-0`} aria-label="전화 걸기">
                    📞
                  </a>
                )}
              </span>
            </Field>
            <Field label="현장명·주소" wide>
              <input name="현장주소" defaultValue={c.현장주소} maxLength={200} className={INPUT} />
            </Field>
            <Field label="공사 완료일">
              <input type="date" name="공사완료일" defaultValue={c.공사완료일 ?? ""} className={INPUT} />
            </Field>
            <Field label="고객번호">
              <input name="고객번호" defaultValue={c.고객번호} maxLength={50} className={INPUT} />
            </Field>
            <Field label="접수일">
              <input type="date" name="접수일" defaultValue={c.접수일} required className={INPUT} />
            </Field>
            <Field label="담당자">
              <MemberSelect name="담당자" value={c.담당자} members={members} />
            </Field>
            <Field label="처리 협력업체" hint="이름 / 연락처" wide>
              <textarea name="협력업체" defaultValue={c.협력업체} rows={2} maxLength={300} className={INPUT} placeholder="예: 박현도배 / 010-0000-0000" />
            </Field>
          </Grid>
          <Chips label="접수 경로" name="접수경로" options={AS_ROUTES} value={c.접수경로} allowEmpty />
          <p className="text-xs text-zinc-500">담당 RD: {c.영업사원 ?? "미지정"}</p>
          <WarrantyNote warranty={warranty} />
          {related.length > 0 && (
            <div className="rounded-md bg-zinc-50 p-3">
              <p className="mb-1 text-xs font-medium text-zinc-600">같은 {c.현장번호 ? "현장" : "고객"}의 다른 A/S {related.length}건</p>
              <ul className="space-y-0.5 text-sm">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/as/${r.id}`} className="text-blue-700 hover:underline">
                      {r.접수번호}
                    </Link>{" "}
                    <span className="text-zinc-600">
                      {formatDate(r.접수일)} · {r.공종 || "-"} · {r.고객요청.slice(0, 40)} ({r.진행상태})
                    </span>
                    {r.id === c.원접수id && <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">원 접수</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section title="2. 접수 증상 및 확인 내용" hidden={!show("symptom")}>
          <CheckChips label="공종 (여러 개 선택 가능)" name="공종" options={AS_TRADES} values={tradesOf(c.공종)} />
          <Grid>
            <Field label="발생 위치">
              <input name="발생위치" defaultValue={c.발생위치} maxLength={200} className={INPUT} />
            </Field>
            <Field label="발생·인지일">
              <input type="date" name="발생일" defaultValue={c.발생일 ?? ""} className={INPUT} />
            </Field>
          </Grid>
          <Chips label="긴급도" name="긴급도" options={AS_URGENCIES} value={c.긴급도} />
          <Long label="증상·요청 내용 (목록에 보이는 요약)" name="고객요청" value={c.고객요청} />
          <Long label="증상·재현 조건" name="증상" value={c.증상} />
          <Long label="초기 확인·원인" name="초기원인" value={c.초기원인} />
        </Section>

        <Section title="3. 방문 및 처리 계획" hidden={!show("plan")}>
          <Grid>
            <Field label="방문 예정일시">
              <input type="datetime-local" name="방문예정일시" defaultValue={c.방문예정일시 ?? ""} className={INPUT} />
            </Field>
            <Field label="처리 기한">
              <input type="date" name="처리기한" defaultValue={c.처리기한 ?? ""} className={INPUT} />
            </Field>
            <Field label="진행 상태">
              <select name="진행상태" defaultValue={c.진행상태} className={INPUT}>
                {AS_STATES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="최근 고객안내일" hint="이력에서 '고객 안내'를 체크하면 자동">
              <input type="date" name="최근안내일" defaultValue={c.최근안내일 ?? ""} className={INPUT} />
            </Field>
            <Field label="고객과 협의일">
              <input type="date" name="협의일" defaultValue={c.협의일 ?? ""} className={INPUT} />
            </Field>
          </Grid>
          <Chips label="유·무상 구분" name="유무상" options={AS_CHARGES} value={c.유무상} />
          <WarrantyNote warranty={warranty} />
          <Long label="유·무상 판단 근거" name="유무상근거" value={c.유무상근거} />
          <Long label="처리 계획·자재" name="처리계획" value={c.처리계획} />
          <Long label="고객 안내·협의" name="고객안내" value={c.고객안내} />
        </Section>

        <Section title="5. 완료 및 고객 확인" hidden={!show("done")}>
          <Grid>
            <Field label="처리 완료일">
              <input type="date" name="처리완료일" defaultValue={c.처리완료일 ?? ""} className={INPUT} />
            </Field>
            <Field label="고객 확인일">
              <input type="date" name="고객확인일" defaultValue={c.고객확인일 ?? ""} className={INPUT} />
            </Field>
          </Grid>
          <Chips label="처리 결과" name="처리결과" options={AS_RESULTS} value={c.처리결과} allowEmpty />
          <Chips label="고객 확인" name="고객확인" options={AS_CUSTOMER_CHECKS} value={c.고객확인} />
          <Chips label="확인 방법" name="확인방법" options={AS_CHECK_METHODS} value={c.확인방법} allowEmpty />
          <Chips label="재발 여부" name="재발여부" options={AS_RECURRENCES} value={c.재발여부} />
          <Long label="최종 조치 내용" name="최종조치" value={c.최종조치} />
          <Long label="고객 확인·추가 요청" name="추가요청" value={c.추가요청} />
          <Long label="재방문·추적 계획" name="추적계획" value={c.추적계획} />
          <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            종결 조건: 진행 상태 &apos;처리완료&apos; + 처리 완료일 + 고객 확인 &apos;확인완료&apos; + 고객 확인일. 지금: <b>{check}</b>
          </p>
        </Section>

        <Section title="6. 비용 및 증빙" hidden={!show("cost")}>
          <CostFields c={c} />
        </Section>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 px-4 py-2.5 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-sm" role="status">
              {error ? (
                <span className="text-red-600">{error}</span>
              ) : dirty ? (
                <span className="text-amber-700">저장하지 않은 변경이 있습니다</span>
              ) : saved ? (
                <span className="text-emerald-700">저장했습니다</span>
              ) : null}
            </p>
            <button
              type="submit"
              disabled={pending || !dirty}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </form>

      {tab === "history" && (
        <Section title="4. 방문 및 처리 이력">
          {dirty && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">다른 탭에 저장하지 않은 변경이 있습니다. 이력을 남기기 전에 먼저 저장하세요.</p>}
          {history}
        </Section>
      )}
      {tab === "photos" && <Section title="사진·증빙 (접수 사진 · 완료 사진 · 영수증 등)">{photos}</Section>}

      {step && <StepDialog c={c} step={step} members={members} today={today} onClose={() => setStep(null)} />}
    </div>
  );
}

// ---------- 진행 단계 ----------

const FLOW = ["접수", "방문·처리", "처리완료", "고객확인", "종결"] as const;

function flowIndex(c: AsCase): number {
  if (c.진행상태 === "처리완료") {
    if (c.고객확인 === "확인완료" && c.고객확인일 && c.처리완료일) return 4;
    return 2;
  }
  if (["일정조율", "방문예정", "처리중", "자재대기"].includes(c.진행상태)) return 1;
  return 0;
}

function Progress({ c, closed, onStep }: { c: AsCase; closed: boolean; onStep: (s: Step) => void }) {
  const at = flowIndex(c);
  const off = c.진행상태 === "보류" || c.진행상태 === "취소";
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <ol className="flex items-center gap-1 overflow-x-auto text-xs">
        {FLOW.map((f, i) => (
          <li key={f} className="flex shrink-0 items-center gap-1">
            <span
              className={`rounded-full px-2.5 py-1 font-medium ${
                off ? "bg-zinc-100 text-zinc-400" : i < at ? "bg-emerald-100 text-emerald-800" : i === at ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {i < at && !off ? "✓ " : ""}
              {f}
            </span>
            {i < FLOW.length - 1 && <span className="text-zinc-300">›</span>}
          </li>
        ))}
        {off && <li className="ml-2 shrink-0 rounded bg-zinc-200 px-2 py-0.5 font-semibold text-zinc-700">{c.진행상태}</li>}
      </ol>
      {!closed && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => onStep("visit")} className={BUTTON}>
            📅 방문 일정 잡기
          </button>
          <button type="button" onClick={() => onStep("done")} className={BUTTON}>
            🔧 처리 완료
          </button>
          {c.진행상태 === "처리완료" && (
            <button type="button" onClick={() => onStep("confirm")} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">
              ✅ 고객 확인 → 종결
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 진행 버튼 창: 그 단계에 필요한 값만 묻고 저장한다 */
function StepDialog({ c, step, members, today, onClose }: { c: AsCase; step: Step; members: AsMember[]; today: string; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const title = step === "visit" ? "방문 일정 잡기" : step === "done" ? "처리 완료" : "고객 확인";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (step === "visit" && !form.get("방문예정일시")) return setError("방문 예정일시를 입력하세요");
    if (step === "done" && !form.get("처리완료일")) return setError("처리 완료일을 입력하세요");
    if (step === "confirm" && form.get("고객확인") === "확인완료" && !form.get("고객확인일")) return setError("고객 확인일을 입력하세요");
    setError(null);
    startTransition(async () => {
      const res = await updateAsAction(c.id, form);
      if (!res.ok) return setError(res.error);
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onClick={(e) => e.target === e.currentTarget && !pending && onClose()}
      onKeyDown={(e) => e.key === "Escape" && !pending && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-xl bg-white shadow-xl">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <div className="border-b border-zinc-200 px-5 py-3">
            <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          </div>
          <div className="space-y-3 overflow-y-auto px-5 py-4">
            {step === "visit" && (
              <>
                <input type="hidden" name="진행상태" value="방문예정" />
                <Field label="방문 예정일시" required>
                  <input type="datetime-local" name="방문예정일시" defaultValue={c.방문예정일시 ?? `${today}T10:00`} className={INPUT} autoFocus />
                </Field>
                <Field label="처리 협력업체" hint="이름 / 연락처">
                  <textarea name="협력업체" defaultValue={c.협력업체} rows={2} maxLength={300} className={INPUT} />
                </Field>
                <Field label="처리 기한">
                  <input type="date" name="처리기한" defaultValue={c.처리기한 ?? ""} className={INPUT} />
                </Field>
                <Field label="담당자">
                  <MemberSelect name="담당자" value={c.담당자} members={members} />
                </Field>
                <p className="text-xs text-zinc-500">진행 상태가 &apos;방문예정&apos;으로 바뀝니다.</p>
              </>
            )}
            {step === "done" && (
              <>
                <input type="hidden" name="진행상태" value="처리완료" />
                <Field label="처리 완료일" required>
                  <input type="date" name="처리완료일" defaultValue={c.처리완료일 ?? today} className={INPUT} />
                </Field>
                <Chips label="처리 결과" name="처리결과" options={AS_RESULTS} value={c.처리결과 || "해결"} />
                <Long label="최종 조치 내용" name="최종조치" value={c.최종조치} />
                <p className="text-xs text-zinc-500">완료 사진은 &apos;사진&apos; 탭에서 올리세요. 다음은 고객 확인입니다.</p>
              </>
            )}
            {step === "confirm" && (
              <>
                <Chips label="고객 확인" name="고객확인" options={["확인완료", "추가조치요청"]} value="확인완료" />
                <Field label="고객 확인일">
                  <input type="date" name="고객확인일" defaultValue={c.고객확인일 ?? today} className={INPUT} />
                </Field>
                <Chips label="확인 방법" name="확인방법" options={AS_CHECK_METHODS} value={c.확인방법 || "전화"} />
                <Chips label="재발 여부" name="재발여부" options={AS_RECURRENCES} value={c.재발여부 === "미확인" ? "재발없음" : c.재발여부} />
                <Long label="고객 확인·추가 요청" name="추가요청" value={c.추가요청} />
                <p className="text-xs text-zinc-500">&apos;확인완료&apos;로 저장하면 종결됩니다.</p>
              </>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3">
            <button type="button" onClick={onClose} disabled={pending} className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100">
              취소
            </button>
            <button type="submit" disabled={pending} className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {pending ? "저장 중…" : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- 비용 ----------

function CostFields({ c }: { c: AsCase }) {
  const [v, setV] = useState({ 자재비: c.자재비, 인건비: c.인건비, 기타비용: c.기타비용 });
  const total = costTotal(v);
  const num = (s: string) => {
    const n = Number(s.replace(/[,\s]/g, ""));
    return s.trim() && Number.isFinite(n) ? n : null;
  };
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        {(["자재비", "인건비", "기타비용"] as const).map((k) => (
          <Field key={k} label={k === "기타비용" ? "기타 비용" : k} hint="원">
            <input
              name={k}
              inputMode="numeric"
              defaultValue={c[k] ?? ""}
              onChange={(e) => setV((p) => ({ ...p, [k]: num(e.target.value) }))}
              className={`${INPUT} text-right tabular-nums`}
            />
          </Field>
        ))}
        <div>
          <span className="mb-1 block text-xs font-medium text-zinc-700">처리비용 합계</span>
          <p className="rounded-md bg-zinc-100 px-2.5 py-1.5 text-right text-sm font-semibold tabular-nums">{total === null ? "-" : `${total.toLocaleString()}원`}</p>
        </div>
      </div>
      <Long label="업체·증빙·비고" name="비용메모" value={c.비용메모} />
      <Chips label="협력업체 지급 상태" name="지급상태" options={AS_PAY_STATES} value={c.지급상태} />
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="고객 청구액" hint="원">
          <input name="고객청구액" inputMode="numeric" defaultValue={c.고객청구액 ?? ""} className={`${INPUT} text-right tabular-nums`} />
        </Field>
      </div>
      <Chips label="고객 청구 정산 상태" name="정산상태" options={AS_BILLING_STATES} value={c.정산상태} />
      <p className="text-xs text-zinc-500">처리비용은 회사가 지출한 비용, 고객 청구액은 고객에게 청구할 금액입니다.</p>
    </>
  );
}

// ---------- 공통 ----------

function Count({ n }: { n: number }) {
  return <span className="ml-1 rounded-full bg-zinc-200 px-1.5 text-[11px] font-semibold text-zinc-700 tabular-nums">{n}</span>;
}

function Section({ title, hidden, children }: { title: string; hidden?: boolean; children: React.ReactNode }) {
  return (
    <section hidden={hidden} className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function Field({ label, hint, required, wide, children }: { label: string; hint?: string; required?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs font-medium text-zinc-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
        {hint && <span className="ml-1.5 font-normal text-zinc-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Long({ label, name, value }: { label: string; name: string; value: string }) {
  return (
    <Field label={label}>
      <textarea name={name} defaultValue={value} rows={3} maxLength={AS_LONG_TEXT_MAX} className={INPUT} />
    </Field>
  );
}

function Chips({ label, name, options, value, allowEmpty }: { label: string; name: string; options: readonly string[]; value: string; allowEmpty?: boolean }) {
  const all = allowEmpty ? ["", ...options] : options;
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 block text-xs font-medium text-zinc-700">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {all.map((o) => (
          <label
            key={o || "none"}
            className="cursor-pointer rounded-full border border-zinc-300 px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 has-checked:border-blue-600 has-checked:bg-blue-600 has-checked:text-white has-checked:hover:bg-blue-600"
          >
            <input type="radio" name={name} value={o} defaultChecked={value === o} className="sr-only" />
            {o || "없음"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** 여러 개를 고르는 체크 칩. "공종표시"를 함께 보내 모두 해제한 경우도 저장되게 한다 */
function CheckChips({ label, name, options, values }: { label: string; name: string; options: readonly string[]; values: string[] }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 block text-xs font-medium text-zinc-700">{label}</legend>
      <input type="hidden" name={`${name}표시`} value="1" />
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label
            key={o}
            className="cursor-pointer rounded-full border border-zinc-300 px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 has-checked:border-blue-600 has-checked:bg-blue-600 has-checked:text-white has-checked:hover:bg-blue-600"
          >
            <input type="checkbox" name={name} value={o} defaultChecked={values.includes(o)} className="sr-only" />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** 담당자 선택. 목록에 없는 예전 이름도 그대로 보이게 둔다 */
function MemberSelect({ name, value, members }: { name: string; value: string; members: AsMember[] }) {
  const known = !value || members.some((m) => m.이름 === value);
  return (
    <select name={name} defaultValue={value} className={INPUT}>
      <option value="">미지정</option>
      {!known && <option value={value}>{value}</option>}
      {members.map((m) => (
        <option key={m.이름} value={m.이름}>
          {m.이름}
          {m.역할 ? ` (${m.역할})` : ""}
        </option>
      ))}
    </select>
  );
}


"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";

import { AddressInput } from "@/app/address-input";
import { createConsultAction, deleteConsultAction, updateConsultAction } from "@/app/consult-actions";
import {
  AMOUNT_KINDS,
  CONSULT_KINDS,
  CONTACT_METHODS,
  CONTACT_STATES,
  DEFAULT_WORKS,
  ESTIMATE_INCLUDES,
  LONG_TEXT_MAX,
  MEETING_PLACES,
  PRIORITIES,
  STAGES,
  stageBadge,
  TODO_STATES,
  VISIT_STATES,
  WORK_ITEMS_MAX,
  TODO_ITEMS_MAX,
  type Consult,
  type ConsultMember,
  type TodoItem,
  type WorkItem,
} from "@/lib/consult-shared";

import { SiteLink } from "./consult-site-link";

const INPUT =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-zinc-100 disabled:text-zinc-500";
const BUTTON = "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100";

const TABS = [
  { key: "basic", label: "기본정보" },
  { key: "schedule", label: "일정" },
  { key: "works", label: "희망공사" },
  { key: "estimate", label: "견적·상담핵심" },
  { key: "todo", label: "할 일" },
  { key: "records", label: "연락기록" },
  { key: "files", label: "첨부" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

type Props = {
  /** null이면 새 상담 */
  consult: Consult | null;
  members: ConsultMember[];
  me: { name: string; sid: string };
  /** RD는 담당 RD를 바꿀 수 없다 (항상 본인) */
  isRd: boolean;
  today: string;
  /** 연락기록 탭 내용 (상세 화면) */
  records?: React.ReactNode;
  recordCount?: number;
  /** 첨부 탭 내용 (상세 화면) */
  files?: React.ReactNode;
};

export function ConsultForm({ consult, members, me, isRd, today, records, recordCount = 0, files }: Props) {
  const router = useRouter();
  const isNew = consult === null;
  const [tab, setTab] = useState<TabKey>("basic");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /** 저장은 됐지만 캘린더 등록 등이 실패했을 때 */
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 연락 기록 등으로 서버 값이 바뀌면 입력칸을 새 값으로 다시 그린다
  const version = consult?.수정일시 ?? consult?.등록일시 ?? "new";
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

  const changed = () => {
    setDirty(true);
    setSaved(false);
  };

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = consult ? await updateConsultAction(consult.id, form) : await createConsultAction(form);
      if (!res.ok) return setError(res.error);
      setDirty(false);
      setWarning(res.data.warning);
      if (isNew) router.push(`/consult/${res.data.id}`);
      else setSaved(true);
    });
  }

  function remove() {
    if (!consult || !confirm(`${consult.고객명} 고객의 상담노트와 연락 기록을 모두 삭제할까요?`)) return;
    startTransition(async () => {
      const res = await deleteConsultAction(consult.id);
      if (!res.ok) return setError(res.error);
      setDirty(false);
      router.push("/consult");
    });
  }

  const show = (key: TabKey) => isNew || tab === key;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-3 p-4 pb-24 sm:p-6 sm:pb-24">
      <Link href="/consult" className="text-sm text-zinc-500 hover:text-zinc-800 hover:underline">
        ← 상담 목록
      </Link>

      {consult ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h1 className="text-xl font-semibold text-zinc-900">{consult.고객명} 고객</h1>
          <span className="text-sm text-zinc-400 tabular-nums">{consult.고객번호}</span>
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${stageBadge(consult.진행단계)}`}>
            {consult.진행단계}
          </span>
          <span className="text-sm text-zinc-500">담당 {consult.영업사원 ?? "미지정"}</span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <SiteLink consult={consult} today={today} dirty={dirty} onWarning={setWarning} />
            <a href={`/consult/${consult.id}/export`} className={`${BUTTON} py-1`} title="지금 쓰는 상담노트 엑셀 양식으로 내려받기">
              엑셀
            </a>
            <button type="button" onClick={remove} disabled={pending} className="rounded-md px-2.5 py-1 text-sm text-red-600 hover:bg-red-50">
              삭제
            </button>
          </div>
        </div>
      ) : (
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">새 상담</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            고객명·연락처만 입력해도 저장됩니다. 나머지는 상담 후 상세 화면에서 채우세요.
          </p>
        </div>
      )}

      {consult && (
        <nav
          className="sticky top-11 z-20 -mx-4 flex gap-1 overflow-x-auto border-b border-zinc-200 bg-zinc-50/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:bg-white sm:px-2"
          aria-label="상담노트 영역"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${
                tab === t.key ? "bg-zinc-900 font-semibold text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {t.label}
              {t.key === "works" && consult.공사항목.length > 0 && <Count n={consult.공사항목.length} />}
              {t.key === "todo" && <Count n={consult.할일.filter((x) => x.상태 !== "완료").length} />}
              {t.key === "records" && <Count n={recordCount} />}
              {t.key === "files" && <Count n={consult.첨부.length} />}
            </button>
          ))}
        </nav>
      )}

      <form key={version} onSubmit={submit} onChange={changed} className={(tab === "records" || tab === "files") && !isNew ? "hidden" : "space-y-3"}>
        <Section title="1. 고객 및 현장 정보" hidden={!show("basic")}>
          <BasicFields consult={consult} members={members} me={me} isRd={isRd} today={today} />
        </Section>

        {!isNew && (
          <Section title="2. 연락 및 방문 일정" hidden={!show("schedule")}>
            <ScheduleFields consult={consult} />
          </Section>
        )}

        <Section title="3. 희망 공사 및 검토 항목" hidden={!show("works")}>
          <WorkEditor initial={consult?.공사항목 ?? []} quick={isNew} onChange={changed} />
        </Section>

        {isNew ? (
          <Section title="상담 메모">
            <Field label="상담 핵심" hint="고객 요청·예산·특이사항 등">
              <textarea name="상담핵심" rows={4} maxLength={LONG_TEXT_MAX} className={INPUT} />
            </Field>
            <Field label="다음 연락일">
              <input type="date" name="다음연락일" className={`${INPUT} sm:max-w-48`} />
            </Field>
          </Section>
        ) : (
          <>
            <Section title="4. 견적 안내 및 상담 핵심" hidden={!show("estimate")}>
              <EstimateFields consult={consult} />
            </Section>
            <Section title="5. 후속 진행 및 담당 일정" hidden={!show("todo")}>
              <TodoEditor initial={consult.할일} me={me.name} members={members} onChange={changed} />
            </Section>
          </>
        )}

        {/* 저장 바 */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 px-4 py-2.5 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-sm" role="status">
              {error ? (
                <span className="text-red-600">{error}</span>
              ) : dirty ? (
                <span className="text-amber-700">저장하지 않은 변경이 있습니다</span>
              ) : saved ? (
                <span className={warning ? "text-amber-700" : "text-emerald-700"}>저장했습니다{warning && ` · ${warning}`}</span>
              ) : null}
            </p>
            <button
              type="submit"
              disabled={pending || (!isNew && !dirty)}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "저장 중…" : isNew ? "상담 등록" : "저장"}
            </button>
          </div>
        </div>
      </form>

      {consult && tab === "records" && (
        <Section title="6. 추가 상담 및 연락 기록">
          {dirty && (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              다른 탭에 저장하지 않은 변경이 있습니다. 기록을 남기기 전에 먼저 저장하세요 (기록을 남기면 화면이 새 값으로
              바뀝니다).
            </p>
          )}
          {records}
        </Section>
      )}

      {consult && tab === "files" && <Section title="첨부파일 (상담 자료·사진·도면)">{files}</Section>}

      {consult && warning && !saved && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
          {warning}
        </p>
      )}
    </div>
  );
}

function Count({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className="ml-1 rounded-full bg-zinc-200 px-1.5 text-[11px] font-semibold text-zinc-700 tabular-nums">{n}</span>;
}

// ---------- 레이아웃 ----------

function Section({ title, hidden, children }: { title: string; hidden?: boolean; children: React.ReactNode }) {
  return (
    <section hidden={hidden} className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-zinc-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
        {hint && <span className="ml-1.5 font-normal text-zinc-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

/** 버튼처럼 보이는 단일 선택 (radio). allowEmpty면 '선택 안 함'도 둔다 */
function Chips({
  label,
  name,
  options,
  defaultValue,
  allowEmpty,
}: {
  label: string;
  name: string;
  options: readonly string[];
  defaultValue: string;
  allowEmpty?: boolean;
}) {
  const all = allowEmpty ? ["", ...options] : options;
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 block text-xs font-medium text-zinc-700">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {all.map((o) => (
          <label
            key={o || "none"}
            className="cursor-pointer rounded-full border border-zinc-300 px-2.5 py-1 text-sm text-zinc-700 has-checked:border-blue-600 has-checked:bg-blue-600 has-checked:text-white hover:bg-zinc-100 has-checked:hover:bg-blue-600"
          >
            <input type="radio" name={name} value={o} defaultChecked={defaultValue === o} className="sr-only" />
            {o || "없음"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Select({ name, options, defaultValue }: { name: string; options: readonly string[]; defaultValue: string }) {
  return (
    <select name={name} defaultValue={defaultValue} className={INPUT}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

// ---------- 1. 기본정보 ----------

function BasicFields({
  consult: c,
  members,
  me,
  isRd,
  today,
}: {
  consult: Consult | null;
  members: ConsultMember[];
  me: { name: string; sid: string };
  isRd: boolean;
  today: string;
}) {
  // 새 상담은 로그인한 사람이 담당 RD (관리자 이상은 바꿀 수 있다)
  const rdSid = c ? (c.영업사원ID ?? "") : members.some((m) => m.영업사원ID === me.sid) ? me.sid : "";
  return (
    <>
      <Grid>
        <Field label="고객명" required>
          <input name="고객명" required maxLength={50} defaultValue={c?.고객명} className={INPUT} autoFocus={!c} />
        </Field>
        <Field label="연락처" required>
          <input
            name="연락처"
            required
            type="tel"
            inputMode="tel"
            maxLength={50}
            defaultValue={c?.연락처}
            placeholder="010-0000-0000"
            className={INPUT}
          />
        </Field>
        <Field label="담당 RD">
          {isRd ? (
            <input value={me.name} disabled className={INPUT} />
          ) : (
            <select name="영업사원ID" defaultValue={rdSid} className={INPUT}>
              <option value="">미지정</option>
              {members.map((m) => (
                <option key={m.영업사원ID} value={m.영업사원ID}>
                  {m.이름}
                  {m.역할 && m.역할 !== "RD" ? ` (${m.역할})` : ""}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="상담일">
          <input type="date" name="상담일" defaultValue={c?.상담일 ?? today} required className={INPUT} />
        </Field>
      </Grid>
      <Chips label="만난 장소" name="만난장소" options={MEETING_PLACES} defaultValue={c?.만난장소 ?? ""} allowEmpty />
      <Grid>
        <Field label="매장·지점명">
          <input name="매장지점" maxLength={100} defaultValue={c?.매장지점} className={INPUT} />
        </Field>
        <Field label="현장명·주소">
          <AddressInput
            name="현장주소"
            maxLength={200}
            defaultValue={c?.현장주소}
            placeholder="예: 동탄역 포레너스 101동"
            className={INPUT}
          />
        </Field>
        <Field label="평형" hint="평">
          <input name="평형" inputMode="decimal" defaultValue={c?.평형 ?? ""} className={INPUT} />
        </Field>
        <Field label="주택 유형">
          <input
            name="주택유형"
            maxLength={200}
            defaultValue={c?.주택유형}
            placeholder="예: 확장형 (안방만 발코니 있음)"
            className={INPUT}
          />
        </Field>
        <Field label="예산" hint="만원">
          <input name="예산" inputMode="numeric" defaultValue={c?.예산 ?? ""} placeholder="예: 3000" className={INPUT} />
        </Field>
        <Field label="시공 예정월">
          <input type="month" name="시공예정월" defaultValue={c?.시공예정월} className={INPUT} />
        </Field>
        <Field label="진행 단계">
          <Select name="진행단계" options={STAGES} defaultValue={c?.진행단계 ?? STAGES[0]} />
        </Field>
      </Grid>
      <Chips label="상담 구분" name="상담구분" options={CONSULT_KINDS} defaultValue={c?.상담구분 ?? CONSULT_KINDS[0]} />
    </>
  );
}

// ---------- 2. 일정 ----------

function ScheduleFields({ consult: c }: { consult: Consult }) {
  return (
    <>
      <Chips label="연락 상태" name="연락상태" options={CONTACT_STATES} defaultValue={c.연락상태} />
      <Grid>
        <Field label="최근 연락일" hint="연락 기록을 남기면 자동으로 바뀝니다">
          <input type="date" name="최근연락일" defaultValue={c.최근연락일 ?? ""} className={INPUT} />
        </Field>
        <Field label="다음 연락일">
          <input type="date" name="다음연락일" defaultValue={c.다음연락일 ?? ""} className={INPUT} />
        </Field>
      </Grid>
      <Chips label="연락 방법" name="연락방법" options={CONTACT_METHODS} defaultValue={c.연락방법} allowEmpty />
      <div className="grid gap-3 rounded-md bg-zinc-50 p-3 sm:grid-cols-2">
        <Field label="다음 미팅 일시">
          <input type="datetime-local" name="다음미팅일시" defaultValue={c.다음미팅일시 ?? ""} className={INPUT} />
        </Field>
        <Field label="미팅 장소">
          <input name="미팅장소" maxLength={200} defaultValue={c.미팅장소} className={INPUT} />
        </Field>
        <div className="sm:col-span-2">
          <Chips label="미팅 상태" name="미팅상태" options={VISIT_STATES} defaultValue={c.미팅상태} />
        </div>
      </div>
      <div className="grid gap-3 rounded-md bg-zinc-50 p-3 sm:grid-cols-2">
        <Field label="실측 일시">
          <input type="datetime-local" name="실측일시" defaultValue={c.실측일시 ?? ""} className={INPUT} />
        </Field>
        <div className="sm:col-span-2">
          <Chips label="실측 상태" name="실측상태" options={VISIT_STATES} defaultValue={c.실측상태} />
        </div>
      </div>
      <Field label="일정 메모">
        <textarea name="일정메모" rows={3} maxLength={LONG_TEXT_MAX} defaultValue={c.일정메모} className={INPUT} />
      </Field>
    </>
  );
}

// ---------- 3. 희망 공사 ----------

const EMPTY_WORK: WorkItem = { 항목: "", 상세: "", 우선순위: "", 견적반영: "" };

function WorkEditor({ initial, quick, onChange }: { initial: WorkItem[]; quick: boolean; onChange: () => void }) {
  const [items, setItems] = useState<WorkItem[]>(initial);
  const listId = useId();
  const update = (next: WorkItem[]) => {
    setItems(next);
    onChange();
  };
  const set = (i: number, patch: Partial<WorkItem>) => update(items.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const has = (name: string) => items.some((w) => w.항목 === name);
  const toggle = (name: string) => {
    const i = items.findIndex((w) => w.항목 === name);
    if (i < 0) return update([...items, { ...EMPTY_WORK, 항목: name }]);
    // 내용을 적은 항목은 실수로 지워지지 않게 칩으로는 빼지 않는다
    if (!items[i].상세) update(items.filter((_, j) => j !== i));
  };
  const full = items.length >= WORK_ITEMS_MAX;

  return (
    <>
      <input type="hidden" name="공사항목" value={JSON.stringify(items)} />
      <div>
        <p className="mb-1 text-xs text-zinc-500">{quick ? "누르면 선택됩니다" : "누르면 아래 목록에 추가됩니다"}</p>
        <div className="flex flex-wrap gap-1.5">
          {DEFAULT_WORKS.map((name) => {
            const on = has(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => (quick ? toggle(name) : !on && !full && update([...items, { ...EMPTY_WORK, 항목: name }]))}
                aria-pressed={on}
                disabled={!quick && on}
                className={`rounded-full border px-2.5 py-1 text-sm ${
                  on ? "border-blue-600 bg-blue-600 text-white" : "border-zinc-300 text-zinc-700 hover:bg-zinc-100"
                } disabled:cursor-default`}
              >
                {on && "✓ "}
                {name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => !full && update([...items, { ...EMPTY_WORK }])}
            disabled={full}
            className="rounded-full border border-dashed border-zinc-400 px-2.5 py-1 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-40"
          >
            + 직접 입력
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <ol className="space-y-2">
          <datalist id={listId}>
            {DEFAULT_WORKS.map((w) => (
              <option key={w} value={w} />
            ))}
          </datalist>
          {items.map((w, i) => (
            <li key={i} className="rounded-md border border-zinc-200 p-2.5">
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-xs text-zinc-400 tabular-nums">{i + 1}</span>
                <input
                  value={w.항목}
                  onChange={(e) => set(i, { 항목: e.target.value })}
                  list={listId}
                  maxLength={100}
                  placeholder="공사 항목"
                  aria-label={`${i + 1}번 공사 항목`}
                  className={`${INPUT} font-medium sm:max-w-56`}
                />
                <button
                  type="button"
                  onClick={() => update(items.filter((_, j) => j !== i))}
                  className="ml-auto shrink-0 rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`${i + 1}번 공사 항목 삭제`}
                >
                  ✕
                </button>
              </div>
              <textarea
                value={w.상세}
                onChange={(e) => set(i, { 상세: e.target.value })}
                rows={2}
                maxLength={1000}
                placeholder="상세 요청 및 범위 (예: 기존 강화마루 철거 후 강마루 시공)"
                aria-label={`${i + 1}번 상세 요청`}
                className={`${INPUT} mt-2`}
              />
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <Toggle label="우선순위" options={PRIORITIES} value={w.우선순위} onChange={(v) => set(i, { 우선순위: v })} />
                <Toggle
                  label="견적 반영"
                  options={ESTIMATE_INCLUDES}
                  value={w.견적반영}
                  onChange={(v) => set(i, { 견적반영: v })}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

/** 작은 단일 선택 버튼 묶음. 같은 값을 다시 누르면 선택 해제 */
function Toggle({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const tone = (o: string) =>
    o === "필수" || o === "포함"
      ? "bg-emerald-600 text-white border-emerald-600"
      : o === "제외"
        ? "bg-zinc-500 text-white border-zinc-500"
        : "bg-amber-500 text-white border-amber-500";
  return (
    <span className="flex items-center gap-1">
      <span className="mr-0.5 text-xs text-zinc-500">{label}</span>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(value === o ? "" : o)}
          aria-pressed={value === o}
          className={`rounded border px-1.5 py-0.5 text-xs ${value === o ? tone(o) : "border-zinc-300 text-zinc-600 hover:bg-zinc-100"}`}
        >
          {o}
        </button>
      ))}
    </span>
  );
}

// ---------- 4. 견적·상담핵심 ----------

function EstimateFields({ consult: c }: { consult: Consult }) {
  const listId = useId();
  return (
    <>
      <Grid>
        <Field label="전체공사 예상금액" hint="만원">
          <input name="전체공사" inputMode="numeric" defaultValue={c.전체공사 ?? ""} placeholder="예: 5000" className={INPUT} />
        </Field>
        <Field label="금액 구분">
          <input name="금액구분" list={listId} maxLength={50} defaultValue={c.금액구분} className={INPUT} />
          <datalist id={listId}>
            {AMOUNT_KINDS.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </Field>
      </Grid>
      {c.예산 !== null && c.전체공사 !== null && c.전체공사 > c.예산 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          예상금액이 예산({c.예산.toLocaleString()}만원)보다 {(c.전체공사 - c.예산).toLocaleString()}만원 많습니다. 우선순위로
          범위 조정을 검토하세요.
        </p>
      )}
      <Field label="예산별 제안">
        <textarea name="예산별제안" rows={3} maxLength={LONG_TEXT_MAX} defaultValue={c.예산별제안} className={INPUT} />
      </Field>
      <Field label="견적·자재 안내">
        <textarea name="견적자재안내" rows={3} maxLength={LONG_TEXT_MAX} defaultValue={c.견적자재안내} className={INPUT} />
      </Field>
      <Field label="상담 핵심">
        <textarea name="상담핵심" rows={4} maxLength={LONG_TEXT_MAX} defaultValue={c.상담핵심} className={INPUT} />
      </Field>
    </>
  );
}

// ---------- 5. 할 일 ----------

function TodoEditor({
  initial,
  me,
  members,
  onChange,
}: {
  initial: TodoItem[];
  me: string;
  members: ConsultMember[];
  onChange: () => void;
}) {
  const [items, setItems] = useState<TodoItem[]>(initial);
  const listId = useId();
  const update = (next: TodoItem[]) => {
    setItems(next);
    onChange();
  };
  const set = (i: number, patch: Partial<TodoItem>) => update(items.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const full = items.length >= TODO_ITEMS_MAX;
  const names = [...new Set([me, ...members.map((m) => m.이름)])];

  return (
    <>
      <input type="hidden" name="할일" value={JSON.stringify(items)} />
      <datalist id={listId}>
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {items.length === 0 && <p className="text-sm text-zinc-500">후속으로 할 일을 추가하세요. (예: 1차 견적 산출, 자재 제안)</p>}
      <ol className="space-y-2">
        {items.map((t, i) => {
          const done = t.상태 === "완료";
          return (
            <li key={i} className={`rounded-md border p-2.5 ${done ? "border-zinc-100 bg-zinc-50" : "border-zinc-200"}`}>
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(e) => set(i, { 상태: e.target.checked ? "완료" : "미착수" })}
                  className="mt-2 size-4 shrink-0 accent-blue-600"
                  aria-label={`${i + 1}번 완료`}
                />
                <input
                  value={t.내용}
                  onChange={(e) => set(i, { 내용: e.target.value })}
                  maxLength={500}
                  placeholder="할 일"
                  aria-label={`${i + 1}번 할 일`}
                  className={`${INPUT} ${done ? "text-zinc-400 line-through" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => update(items.filter((_, j) => j !== i))}
                  className="shrink-0 rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`${i + 1}번 할 일 삭제`}
                >
                  ✕
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 pl-6">
                <input
                  value={t.담당자}
                  onChange={(e) => set(i, { 담당자: e.target.value })}
                  list={listId}
                  maxLength={50}
                  placeholder="담당자"
                  aria-label={`${i + 1}번 담당자`}
                  className={INPUT}
                />
                <input
                  type="date"
                  value={t.예정일}
                  onChange={(e) => set(i, { 예정일: e.target.value })}
                  aria-label={`${i + 1}번 예정일`}
                  className={INPUT}
                />
                <select
                  value={t.상태}
                  onChange={(e) => set(i, { 상태: e.target.value })}
                  aria-label={`${i + 1}번 진행 상태`}
                  className={INPUT}
                >
                  {TODO_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() => !full && update([...items, { 내용: "", 담당자: me, 예정일: "", 상태: TODO_STATES[0] }])}
        disabled={full}
        className={`${BUTTON} w-full`}
      >
        + 할 일 추가
      </button>
    </>
  );
}

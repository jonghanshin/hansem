"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { AddressInput } from "@/app/address-input";
import { createAsAction, searchAsSitesAction } from "@/app/as-actions";
import {
  AS_LONG_TEXT_MAX,
  AS_ROUTES,
  AS_TRADES,
  AS_URGENCIES,
  WARRANTY_YEARS,
  warrantyInfo,
  type AsMember,
  type AsSiteHit,
} from "@/lib/as-shared";
import { formatDate } from "@/lib/consult-shared";

const INPUT =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-zinc-100";
const BUTTON = "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100";

type Symptom = { key: number; 공종: string[]; 고객요청: string; 발생위치: string; 긴급도: string };
type Customer = { 고객명: string; 연락처: string; 현장주소: string; 공사완료일: string; 고객번호: string };

const EMPTY_CUSTOMER: Customer = { 고객명: "", 연락처: "", 현장주소: "", 공사완료일: "", 고객번호: "" };

/** A/S 접수: 현장 검색(또는 직접 입력) → 접수 정보 → 증상(여러 개면 증상마다 접수 1건) */
export function AsNewForm({
  members,
  isRd,
  me,
  today,
  defaultManager,
}: {
  members: AsMember[];
  isRd: boolean;
  me: string;
  today: string;
  /** 기본 담당자 (관리자 역할) */
  defaultManager: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<AsSiteHit[] | null>(null);
  const [site, setSite] = useState<AsSiteHit | null>(null);
  const [direct, setDirect] = useState(false);
  const [customer, setCustomer] = useState<Customer>(EMPTY_CUSTOMER);
  const [received, setReceived] = useState(today);
  const nextKey = useRef(1);
  const [list, setList] = useState<Symptom[]>([{ key: 0, 공종: [], 고객요청: "", 발생위치: "", 긴급도: "일반" }]);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [pending, startTransition] = useTransition();

  const chosen = site !== null || direct;
  const warranty = warrantyInfo(customer.공사완료일 || null, received || today);
  const rds = members.filter((m) => m.역할 === "RD");

  function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setError(null);
    startSearch(async () => {
      const res = await searchAsSitesAction(q);
      if (res.ok) setHits(res.data);
      else setError(res.error);
    });
  }

  function pick(hit: AsSiteHit) {
    setSite(hit);
    setDirect(false);
    setCustomer({
      고객명: hit.고객명,
      연락처: hit.연락처,
      현장주소: hit.현장주소,
      공사완료일: hit.공사완료일 ?? "",
      고객번호: hit.고객번호,
    });
  }

  function startDirect() {
    setSite(null);
    setDirect(true);
    setCustomer({ ...EMPTY_CUSTOMER, 고객명: /\d{3,}/.test(q) ? "" : q.trim() });
  }

  function reset() {
    setSite(null);
    setDirect(false);
    setCustomer(EMPTY_CUSTOMER);
  }

  const setC = (k: keyof Customer, v: string) => setCustomer((c) => ({ ...c, [k]: v }));
  const setS = (key: number, patch: Partial<Symptom>) => setList((l) => l.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("증상목록", JSON.stringify(list.map((s) => ({ 공종: s.공종, 고객요청: s.고객요청, 발생위치: s.발생위치, 긴급도: s.긴급도 }))));
    setError(null);
    startTransition(async () => {
      const res = await createAsAction(form);
      if (!res.ok) return setError(res.error);
      const { ids } = res.data;
      router.push(ids.length === 1 ? `/as/${ids[0]}` : `/as?q=${encodeURIComponent(customer.고객명)}`);
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 p-4 pb-24 sm:p-6 sm:pb-24">
      <Link href="/as" className="text-sm text-zinc-500 hover:text-zinc-800 hover:underline">
        ← A/S 목록
      </Link>
      <h1 className="text-xl font-semibold text-zinc-900">A/S 접수</h1>

      {/* 1. 현장 찾기 */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">1. 고객·현장 찾기</h2>
        {!chosen ? (
          <>
            <form onSubmit={search} className="flex gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="현장번호 · 고객명 · 전화번호 · 주소"
                className={INPUT}
                autoFocus
                enterKeyHint="search"
              />
              <button type="submit" disabled={searching || !q.trim()} className="shrink-0 rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                {searching ? "찾는 중…" : "찾기"}
              </button>
            </form>
            {hits !== null && (
              <div className="mt-3 space-y-2">
                {hits.length === 0 && <p className="text-sm text-zinc-500">현장정보에서 찾지 못했습니다.</p>}
                {hits.map((h) => (
                  <SiteHitCard key={h.현장번호} hit={h} today={today} onPick={() => pick(h)} />
                ))}
              </div>
            )}
            <button type="button" onClick={startDirect} className={`${BUTTON} mt-3 w-full border-dashed`}>
              현장정보에 없는 고객 → 직접 입력
            </button>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {site ? (
              <span className="rounded bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">현장 {site.현장번호} 연결 · 담당 RD {site.영업사원 ?? "미지정"}</span>
            ) : (
              <span className="rounded bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">직접 입력 (현장정보 연결 없음)</span>
            )}
            <button type="button" onClick={reset} className="text-blue-600 hover:underline">
              다시 찾기
            </button>
          </div>
        )}
      </section>

      {chosen && (
        <form onSubmit={submit} className="space-y-3">
          <input type="hidden" name="현장번호" value={site?.현장번호 ?? ""} />

          <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900">고객 정보 {site && <span className="font-normal text-zinc-500">(현장정보에서 가져옴 · 고칠 수 있음)</span>}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="현장번호">
                <input
                  value={site?.현장번호 ?? ""}
                  readOnly
                  disabled
                  placeholder="현장정보 연결 없음 (직접 입력)"
                  className={`${INPUT} font-semibold tabular-nums`}
                  aria-label="현장번호"
                />
              </Field>
              <Field label="고객명" required>
                <input name="고객명" value={customer.고객명} onChange={(e) => setC("고객명", e.target.value)} required maxLength={50} className={INPUT} />
              </Field>
              <Field label="연락처">
                <input name="연락처" type="tel" value={customer.연락처} onChange={(e) => setC("연락처", e.target.value)} maxLength={50} className={INPUT} />
              </Field>
              <Field label="현장명·주소" wide>
                <AddressInput name="현장주소" value={customer.현장주소} onChange={(e) => setC("현장주소", e.target.value)} maxLength={200} className={INPUT} />
              </Field>
              <Field label="공사 완료일">
                <input type="date" name="공사완료일" value={customer.공사완료일} onChange={(e) => setC("공사완료일", e.target.value)} className={INPUT} />
              </Field>
              <Field label="고객번호">
                <input name="고객번호" value={customer.고객번호} onChange={(e) => setC("고객번호", e.target.value)} maxLength={50} className={INPUT} />
              </Field>
              {direct && !isRd && (
                <Field label="담당 RD" hint="RD가 이 A/S를 볼 수 있게">
                  <select name="영업사원" defaultValue="" className={INPUT}>
                    <option value="">미지정 (관리자만 봄)</option>
                    {rds.map((m) => (
                      <option key={m.이름} value={m.이름}>
                        {m.이름}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <WarrantyNote warranty={warranty} />
            {site && site.previous.length > 0 && (
              <Field label={`이 현장의 이전 A/S ${site.previous.length}건 — 재발·재접수면 원 접수를 고르세요`}>
                <select name="원접수id" defaultValue="" className={INPUT}>
                  <option value="">새 증상 (원 접수 없음)</option>
                  {site.previous.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.접수번호} · {p.공종 || "공종 미정"} · {p.고객요청.slice(0, 30)} ({p.진행상태})
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </section>

          <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900">2. 접수 정보</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="접수일">
                <input type="date" name="접수일" value={received} onChange={(e) => setReceived(e.target.value)} required className={INPUT} />
              </Field>
              <Field label="담당자" hint="기본: 관리자">
                <select name="담당자" defaultValue={defaultManager || me} className={INPUT}>
                  <option value="">미지정</option>
                  {members.map((m) => (
                    <option key={m.이름} value={m.이름}>
                      {m.이름}
                      {m.역할 ? ` (${m.역할})` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="처리 기한">
                <input type="date" name="처리기한" className={INPUT} />
              </Field>
            </div>
            <RadioChips label="접수 경로" name="접수경로" options={AS_ROUTES} defaultValue="전화" />
          </section>

          <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900">
              3. 증상 {list.length > 1 && <span className="font-normal text-zinc-500">— 증상마다 접수번호가 따로 붙습니다</span>}
            </h2>
            {list.map((s, i) => (
              <div key={s.key} className="space-y-2 rounded-md border border-zinc-200 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-500">증상 {i + 1}</span>
                  {list.length > 1 && (
                    <button type="button" onClick={() => setList((l) => l.filter((x) => x.key !== s.key))} className="ml-auto text-sm text-zinc-400 hover:text-red-600">
                      빼기
                    </button>
                  )}
                </div>
                <MultiChips
                  label="공종 (여러 개 선택 가능)"
                  options={AS_TRADES}
                  values={s.공종}
                  onChange={(v) => setS(s.key, { 공종: v })}
                />
                <Field label="증상·요청 내용" required>
                  <textarea
                    value={s.고객요청}
                    onChange={(e) => setS(s.key, { 고객요청: e.target.value })}
                    rows={3}
                    maxLength={AS_LONG_TEXT_MAX}
                    placeholder="예: 안방 진입 공간 벽면·천장 도배가 벌어짐"
                    className={INPUT}
                  />
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="발생 위치">
                    <input value={s.발생위치} onChange={(e) => setS(s.key, { 발생위치: e.target.value })} maxLength={200} placeholder="예: 드레스룸 문짝" className={INPUT} />
                  </Field>
                  <ToggleChips label="긴급도" options={AS_URGENCIES} value={s.긴급도} onChange={(v) => setS(s.key, { 긴급도: v || "일반" })} />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setList((l) => [...l, { key: nextKey.current++, 공종: [], 고객요청: "", 발생위치: "", 긴급도: "일반" }])}
              disabled={list.length >= 10}
              className={`${BUTTON} w-full`}
            >
              + 증상 추가 (같은 고객의 다른 증상)
            </button>
          </section>

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 px-4 py-2.5 backdrop-blur">
            <div className="mx-auto flex max-w-3xl items-center gap-3">
              <p className="min-w-0 flex-1 text-sm text-red-600" role="status">
                {error}
              </p>
              <button type="submit" disabled={pending} className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {pending ? "접수 중…" : list.length > 1 ? `${list.length}건 접수` : "접수"}
              </button>
            </div>
          </div>
        </form>
      )}
      {!chosen && error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function SiteHitCard({ hit, today, onPick }: { hit: AsSiteHit; today: string; onPick: () => void }) {
  const w = warrantyInfo(hit.공사완료일, today);
  return (
    <div className="rounded-md border border-zinc-200 p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums">현장 {hit.현장번호}</span>
        <span className="font-semibold text-zinc-900">{hit.고객명}</span>
        {w && (
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${w.inWarranty ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>
            {w.inWarranty ? `무상 D-${w.days}` : `무상 기간 지남`}
          </span>
        )}
        {hit.previous.length > 0 && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">이전 A/S {hit.previous.length}건</span>}
        <button type="button" onClick={onPick} className="ml-auto rounded-md bg-blue-600 px-3 py-1 text-sm font-semibold text-white hover:bg-blue-700">
          이 현장으로 접수
        </button>
      </div>
      <p className="mt-1 text-sm text-zinc-700">{hit.현장주소 || "-"}</p>
      <p className="text-xs text-zinc-500">
        {hit.연락처 || "연락처 없음"} · 완료일 {hit.공사완료일 ? formatDate(hit.공사완료일) : "미입력"} · 담당 RD {hit.영업사원 ?? "미지정"}
      </p>
      {hit.previous.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 border-t border-zinc-100 pt-1.5 text-xs text-zinc-600">
          {hit.previous.slice(0, 3).map((p) => (
            <li key={p.id} className="truncate">
              {p.접수번호} · {p.공종 || "-"} · {p.고객요청} <span className="text-zinc-400">({p.진행상태})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function WarrantyNote({ warranty }: { warranty: ReturnType<typeof warrantyInfo> }) {
  if (!warranty) return <p className="text-xs text-zinc-500">공사 완료일을 넣으면 무상 A/S 기간({WARRANTY_YEARS}년)을 계산합니다.</p>;
  return (
    <p className={`rounded-md px-3 py-2 text-sm ${warranty.inWarranty ? "bg-emerald-50 text-emerald-800" : "bg-zinc-100 text-zinc-700"}`}>
      🛡 무상 A/S 기간 {formatDate(warranty.end)}까지 ·{" "}
      {warranty.inWarranty ? <b>접수일 기준 무상 기간 (D-{warranty.days})</b> : <b>접수일 기준 무상 기간 {-warranty.days}일 지남</b>}
      <span className="ml-1 text-xs opacity-80">(유·무상은 원인·계약을 확인해 직접 정합니다)</span>
    </p>
  );
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

function RadioChips({ label, name, options, defaultValue }: { label: string; name: string; options: readonly string[]; defaultValue: string }) {
  return (
    <fieldset>
      <legend className="mb-1 block text-xs font-medium text-zinc-700">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label
            key={o}
            className="cursor-pointer rounded-full border border-zinc-300 px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 has-checked:border-blue-600 has-checked:bg-blue-600 has-checked:text-white"
          >
            <input type="radio" name={name} value={o} defaultChecked={o === defaultValue} className="sr-only" />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** 여러 개를 고르는 칩 (누를 때마다 선택·해제) */
function MultiChips({ label, options, values, onChange }: { label: string; options: readonly string[]; values: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 block text-xs font-medium text-zinc-700">
        {label}
        {values.length > 0 && <span className="ml-1.5 font-normal text-blue-700">{values.length}개 선택</span>}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = values.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(on ? values.filter((x) => x !== o) : [...values, o])}
              aria-pressed={on}
              className={`rounded-full border px-2.5 py-1 text-sm ${on ? "border-blue-600 bg-blue-600 text-white" : "border-zinc-300 text-zinc-700 hover:bg-zinc-100"}`}
            >
              {on && "✓ "}
              {o}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** 상태로 관리하는 단일 선택 칩 (같은 값을 다시 누르면 해제) */
function ToggleChips({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string; onChange: (v: string) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 block text-xs font-medium text-zinc-700">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(value === o ? "" : o)}
            aria-pressed={value === o}
            className={`rounded-full border px-2.5 py-1 text-sm ${
              value === o ? (o === "긴급" ? "border-red-600 bg-red-600 text-white" : "border-blue-600 bg-blue-600 text-white") : "border-zinc-300 text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

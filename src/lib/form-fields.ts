// FormData 값 읽기·검사 도우미 (Server Action에서 사용). 잘못된 값이면 FormError를 던진다.

export class FormError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** 문자열 (앞뒤 공백 제거, 줄바꿈 통일, 길이 제한) */
export function text(form: FormData, name: string, max: number, label = name): string {
  const v = String(form.get(name) ?? "").replace(/\r\n/g, "\n").trim();
  if (v.length > max) throw new FormError(`${label}은(는) ${max.toLocaleString()}자 이내로 입력하세요`);
  return v;
}

/** 선택값 (비어 있으면 fallback) */
export function choice(form: FormData, name: string, options: readonly string[], fallback: string, label = name): string {
  const v = text(form, name, 100, label);
  if (!v) return fallback;
  if (!options.includes(v)) throw new FormError(`${label} 값이 올바르지 않습니다`);
  return v;
}

export function date(form: FormData, name: string, label = name): string | null {
  const v = text(form, name, 10, label);
  if (!v) return null;
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v))) throw new FormError(`${label}을(를) 확인하세요`);
  return v;
}

export function dateTime(form: FormData, name: string, label = name): string | null {
  const v = text(form, name, 16, label);
  if (!v) return null;
  if (!DATETIME_RE.test(v) || Number.isNaN(Date.parse(v))) throw new FormError(`${label}을(를) 확인하세요`);
  return v;
}

/** 0 이상의 정수 (쉼표 허용, 비어 있으면 null) */
export function integer(form: FormData, name: string, label = name): number | null {
  const v = text(form, name, 20, label).replace(/[,\s]/g, "");
  if (!v) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 2_000_000_000) throw new FormError(`${label}은(는) 0 이상의 숫자로 입력하세요`);
  return n;
}

/** 오늘 (한국 시간) */
export function todayKorea(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

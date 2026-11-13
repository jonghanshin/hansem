"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// 주소 입력칸 + '주소 검색' 버튼. 검색은 카카오(다음) 우편번호 서비스(키 불필요)를 창 안에 띄워서 한다.
// 고른 주소는 입력칸에 넣고 커서를 끝에 두어 동·호수 같은 상세 주소를 이어서 적게 한다.
// 입력칸에 실제 input 이벤트를 보내므로 제어(value/onChange)·비제어(defaultValue) 입력칸 모두에서 동작한다.

const POSTCODE_SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

type PostcodeData = {
  zonecode: string;
  address: string;
  roadAddress: string;
  jibunAddress: string;
  userSelectedType: "R" | "J";
  buildingName: string;
  apartment: "Y" | "N";
  bname: string;
};

type PostcodeCtor = new (options: {
  oncomplete: (data: PostcodeData) => void;
  width?: string;
  height?: string;
}) => { embed: (el: HTMLElement, options?: { q?: string; autoClose?: boolean }) => void };

declare global {
  interface Window {
    daum?: { Postcode?: PostcodeCtor };
  }
}

let loading: Promise<PostcodeCtor> | null = null;

function loadPostcode(): Promise<PostcodeCtor> {
  if (window.daum?.Postcode) return Promise.resolve(window.daum.Postcode);
  loading ??= new Promise<PostcodeCtor>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = POSTCODE_SRC;
    s.async = true;
    s.onload = () => (window.daum?.Postcode ? resolve(window.daum.Postcode) : reject(new Error("load")));
    s.onerror = () => reject(new Error("load"));
    document.head.appendChild(s);
  }).catch((e) => {
    loading = null; // 다음에 다시 시도
    throw e;
  });
  return loading;
}

/** 선택한 주소 → 입력칸에 넣을 문자열: 도로명(또는 지번) 주소 + (법정동, 건물명) */
function formatAddress(d: PostcodeData): string {
  const base = d.userSelectedType === "R" ? d.roadAddress || d.address : d.jibunAddress || d.address;
  if (d.userSelectedType !== "R") return base;
  const extra = [/[동로가]$/.test(d.bname) ? d.bname : "", d.apartment === "Y" ? d.buildingName : ""].filter(Boolean);
  return extra.length ? `${base} (${extra.join(", ")})` : base;
}

/** React가 입력 변경으로 알아차리도록 값을 넣고 input 이벤트를 보낸다 */
function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export function AddressInput({ className, ...props }: InputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  /** 열려 있으면 검색창에 미리 넣을 검색어 (닫혀 있으면 null) */
  const [query, setQuery] = useState<string | null>(null);
  const locked = props.readOnly || props.disabled;

  function pick(address: string) {
    setQuery(null);
    const input = inputRef.current;
    if (!input) return;
    const value = `${address} `;
    setNativeValue(input, value);
    // 상세 주소(동·호수)를 바로 이어 적을 수 있게
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(value.length, value.length);
    });
  }

  return (
    <>
      <span className="flex gap-1.5">
        <input ref={inputRef} type="text" {...props} className={`min-w-0 ${className ?? ""}`} />
        {!locked && (
          <button
            type="button"
            onClick={() => setQuery(inputRef.current?.value.trim() ?? "")}
            className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            주소 검색
          </button>
        )}
      </span>
      {query !== null &&
        createPortal(
          <AddressSearchDialog query={query} onPick={pick} onClose={() => setQuery(null)} />,
          document.body,
        )}
    </>
  );
}

function AddressSearchDialog({ query, onPick, onClose }: { query: string; onPick: (address: string) => void; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [initialQuery] = useState(query);

  useEffect(() => {
    let alive = true;
    loadPostcode()
      .then((Postcode) => {
        if (!alive || !boxRef.current) return;
        new Postcode({
          oncomplete: (d) => onPick(formatAddress(d)),
          width: "100%",
          height: "100%",
        }).embed(boxRef.current, { q: initialQuery || undefined, autoClose: false });
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
    // onPick은 열려 있는 동안 바뀌지 않는다고 보고 처음 한 번만 띄운다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-900/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation(); // 뒤에 열린 창까지 닫히지 않게
        onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="주소 검색" className="flex h-[min(560px,85dvh)] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-base font-semibold text-zinc-900">주소 검색</h2>
          <button type="button" onClick={onClose} autoFocus className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" aria-label="닫기">
            <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
        {error ? (
          <p className="m-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            주소 검색 서비스를 불러오지 못했습니다. 인터넷 연결을 확인하거나 주소를 직접 입력해 주세요.
          </p>
        ) : (
          <div ref={boxRef} className="min-h-0 flex-1 overflow-hidden rounded-b-xl" />
        )}
      </div>
    </div>
  );
}

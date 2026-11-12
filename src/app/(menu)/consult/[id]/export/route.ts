import path from "node:path";

import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import { fetchConsult, fetchConsultRecords } from "@/lib/consult";
import type { Consult, ConsultRecord } from "@/lib/consult-shared";
import { canUseConsult, RESTRICTED_ROLE } from "@/lib/data-scope";
import { exclusionFor } from "@/lib/excluded-users";

// 상담노트를 지금 쓰는 엑셀 양식(doc/상담노트.xlsx의 '상담노트 서식' 시트) 그대로 채워 내려받는다.
// 양식 파일: templates/consult-note-template.xlsx (서식 시트만 들어 있음)

const TEMPLATE = path.join(process.cwd(), "templates", "consult-note-template.xlsx");
const WORK_ROWS = { first: 25, count: 12 };
const TODO_ROWS = { first: 46, count: 7 };
const RECORD_ROWS = { first: 56, count: 8 };

/** "2026-10-30" / "2026-10-30T14:00" → 엑셀 날짜 (시간대 없이 그대로) */
function excelDate(v: string | null | undefined): Date | null {
  const m = v && /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0))) : null;
}

function fill(ws: ExcelJS.Worksheet, c: Consult, records: ConsultRecord[]) {
  const set = (addr: string, value: ExcelJS.CellValue | undefined) => {
    ws.getCell(addr).value = value === undefined || value === "" ? null : value;
  };

  ws.getCell("C4").value = `${c.고객명} 고객 상담 기록`;

  // 1. 고객 및 현장 정보
  set("B7", c.고객명);
  set("F7", c.영업사원);
  set("B8", c.연락처);
  set("F8", excelDate(c.상담일));
  set("B9", c.만난장소);
  set("F9", c.매장지점);
  set("B10", c.현장주소);
  set("F10", c.평형);
  set("B11", c.주택유형);
  set("F11", excelDate(c.시공예정월 ? `${c.시공예정월}-01` : null));
  set("B12", c.예산);
  set("F12", c.진행단계);
  set("B13", c.고객번호);
  set("F13", c.상담구분);

  // 2. 연락 및 방문 일정
  set("B16", c.연락상태);
  set("F16", excelDate(c.최근연락일));
  set("B17", excelDate(c.다음연락일));
  set("F17", c.연락방법);
  set("B18", excelDate(c.다음미팅일시));
  set("F18", c.미팅장소);
  set("B19", c.미팅상태);
  set("F19", excelDate(c.실측일시));
  set("B20", c.실측상태);
  set("F20", c.일정메모);

  // 3. 희망 공사 (12줄. 넘치면 마지막 줄에 나머지를 모은다)
  const works = c.공사항목;
  for (let i = 0; i < WORK_ROWS.count; i++) {
    const r = WORK_ROWS.first + i;
    const last = i === WORK_ROWS.count - 1 && works.length > WORK_ROWS.count;
    const w = works[i];
    set(`B${r}`, last ? "외" : w?.항목);
    set(
      `D${r}`,
      last
        ? works
            .slice(i)
            .map((x) => `${x.항목}${x.상세 ? `: ${x.상세}` : ""}`)
            .join(" / ")
        : w?.상세,
    );
    set(`G${r}`, last ? null : w?.우선순위);
    set(`H${r}`, last ? null : w?.견적반영);
  }

  // 4. 견적 안내 및 상담 핵심
  set("B39", c.전체공사);
  set("F39", c.금액구분);
  set("B40", c.예산별제안);
  set("B41", c.견적자재안내);
  set("B42", c.상담핵심);

  // 5. 후속 할 일 (7줄)
  for (let i = 0; i < TODO_ROWS.count; i++) {
    const r = TODO_ROWS.first + i;
    const t = c.할일[i];
    const more = i === TODO_ROWS.count - 1 && c.할일.length > TODO_ROWS.count ? ` (외 ${c.할일.length - TODO_ROWS.count}건)` : "";
    set(`B${r}`, t ? `${t.내용}${more}` : null);
    set(`F${r}`, t?.담당자);
    set(`G${r}`, excelDate(t?.예정일));
    set(`H${r}`, t?.상태);
  }

  // 6. 추가 상담 및 연락 기록 (최근 8건을 오래된 순으로)
  const recent = records.slice(0, RECORD_ROWS.count).reverse();
  for (let i = 0; i < RECORD_ROWS.count; i++) {
    const r = RECORD_ROWS.first + i;
    const rec = recent[i];
    set(`A${r}`, excelDate(rec?.기록일시));
    set(`B${r}`, rec?.연락방법);
    set(`C${r}`, rec?.담당자);
    set(`D${r}`, rec?.내용);
  }
  if (records.length > RECORD_ROWS.count) {
    set("A64", `연락 기록 ${records.length}건 중 최근 ${RECORD_ROWS.count}건만 표시 · 전체 기록은 시스템의 고객상담 > 연락기록에서 확인`);
  }
}

/** 시트 이름: 엑셀 금지 문자 제거, 31자 이내 */
function sheetName(c: Consult): string {
  return `${c.고객명} 상담노트`.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.mustChangePassword) return new Response("로그인이 필요합니다", { status: 401 });
  if (!canUseConsult(session)) return new Response("권한이 없습니다", { status: 403 });

  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return new Response("잘못된 요청입니다", { status: 400 });

  try {
    const exclusion = await exclusionFor(session.uid);
    const view = { ...exclusion, salesName: session.role.trim() === RESTRICTED_ROLE ? session.name : null };
    const consult = await fetchConsult(id, view);
    if (!consult) return new Response("상담을 찾을 수 없습니다", { status: 404 });
    const records = await fetchConsultRecords(id, exclusion);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(TEMPLATE);
    const ws = workbook.worksheets[0];
    ws.name = sheetName(consult);
    fill(ws, consult, records);

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `상담노트_${consult.고객명}_${consult.고객번호}.xlsx`.replace(/[\\/:*?"<>|]/g, "_");
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="consult-note.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[consult-export]", e);
    return new Response("엑셀 파일을 만들지 못했습니다", { status: 500 });
  }
}

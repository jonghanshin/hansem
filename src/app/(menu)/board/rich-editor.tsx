"use client";

import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRef, useState } from "react";

import { uploadBoardImageAction } from "@/app/board-actions";
import { BOARD_IMAGE_MAX_BYTES, BOARD_IMAGE_TYPES, formatFileSize } from "@/lib/board-shared";

// 게시판 서식 편집기 (Tiptap). 결과는 HTML 문자열로 onChange에 넘긴다.
// 본문 이미지는 서버에 먼저 올린 뒤 그 주소(/board/images/...)를 넣는다.

const TEXT_COLORS = ["#18181b", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#7c3aed", "#db2777", "#71717a"];
const HIGHLIGHTS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa", "#e4e4e7"];

export function RichEditor({
  initialHtml,
  onChange,
  onError,
}: {
  initialHtml: string;
  /** html과 내용이 비었는지 */
  onChange: (html: string, empty: boolean) => void;
  onError: (message: string | null) => void;
}) {
  const [uploading, setUploading] = useState(0);
  const editorRef = useRef<Editor | null>(null);

  const uploadImages = async (editor: Editor, files: File[], pos?: number) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    for (const file of images) {
      if (!BOARD_IMAGE_TYPES[file.type]) {
        onError(`${file.name}: PNG, JPG, GIF, WEBP 이미지만 넣을 수 있습니다`);
        continue;
      }
      if (file.size > BOARD_IMAGE_MAX_BYTES) {
        onError(`${file.name}: 이미지는 ${formatFileSize(BOARD_IMAGE_MAX_BYTES)}까지 넣을 수 있습니다`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const form = new FormData();
        form.set("image", file);
        const res = await uploadBoardImageAction(form);
        if (!res.ok) {
          onError(res.error);
          continue;
        }
        onError(null);
        const chain = editor.chain().focus();
        (pos === undefined ? chain : chain.setTextSelection(pos)).setImage({ src: res.data.url, alt: file.name }).run();
      } finally {
        setUploading((n) => n - 1);
      }
    }
    return images.length > 0;
  };

  const editor = useEditor({
    immediatelyRender: false, // 서버 렌더링 시 hydration 불일치 방지
    shouldRerenderOnTransaction: true, // 툴바 버튼의 선택 상태 표시
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TableKit.configure({ table: { resizable: false } }),
      Image.configure({ inline: false }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: { class: "board-content min-h-72 px-3 py-3 outline-none", "aria-label": "내용" },
      // 이미지 붙여넣기·끌어다 놓기 → 서버에 올린 뒤 삽입
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!files.some((f) => f.type.startsWith("image/")) || !editorRef.current) return false;
        void uploadImages(editorRef.current, files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (!files.some((f) => f.type.startsWith("image/")) || !editorRef.current) return false;
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void uploadImages(editorRef.current, files, pos);
        return true;
      },
    },
    onCreate: ({ editor }) => {
      editorRef.current = editor;
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.isEmpty),
  });

  return (
    <div className="rounded-md border border-zinc-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
      {editor ? (
        <>
          <Toolbar editor={editor} onImages={(files) => void uploadImages(editor, files)} />
          {uploading > 0 && <p className="border-b border-zinc-100 px-3 py-1 text-xs text-blue-600">이미지 올리는 중…</p>}
          <EditorContent editor={editor} />
        </>
      ) : (
        <div className="min-h-72 px-3 py-3 text-sm text-zinc-400">편집기를 불러오는 중…</div>
      )}
    </div>
  );
}

// ---------- 툴바 ----------

function Toolbar({ editor, onImages }: { editor: Editor; onImages: (files: File[]) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const inTable = editor.isActive("table");
  const c = () => editor.chain().focus();

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("링크 주소 (비우면 링크 해제)", prev ?? "https://");
    if (url === null) return;
    if (!url.trim() || url.trim() === "https://") c().extendMarkRange("link").unsetLink().run();
    else c().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div className="sticky top-11 z-10 flex flex-wrap items-center gap-0.5 rounded-t-md border-b border-zinc-200 bg-zinc-50 px-1.5 py-1">
      <Btn label="굵게" active={editor.isActive("bold")} onClick={() => c().toggleBold().run()}>
        <b>B</b>
      </Btn>
      <Btn label="기울임" active={editor.isActive("italic")} onClick={() => c().toggleItalic().run()}>
        <i className="font-serif">I</i>
      </Btn>
      <Btn label="밑줄" active={editor.isActive("underline")} onClick={() => c().toggleUnderline().run()}>
        <u>U</u>
      </Btn>
      <Btn label="취소선" active={editor.isActive("strike")} onClick={() => c().toggleStrike().run()}>
        <s>S</s>
      </Btn>
      <Sep />
      <Btn label="큰 제목" active={editor.isActive("heading", { level: 2 })} onClick={() => c().toggleHeading({ level: 2 }).run()}>
        H1
      </Btn>
      <Btn label="작은 제목" active={editor.isActive("heading", { level: 3 })} onClick={() => c().toggleHeading({ level: 3 }).run()}>
        H2
      </Btn>
      <Sep />
      <ColorMenu
        label="글자색"
        icon={<span className="border-b-[3px] px-0.5 leading-none" style={{ borderColor: editor.getAttributes("textStyle").color ?? "#18181b" }}>A</span>}
        colors={TEXT_COLORS}
        onPick={(color) => c().setColor(color).run()}
        onClear={() => c().unsetColor().run()}
      />
      <ColorMenu
        label="형광펜"
        icon={<span className="rounded-sm bg-yellow-200 px-1 leading-tight">A</span>}
        colors={HIGHLIGHTS}
        onPick={(color) => c().toggleHighlight({ color }).run()}
        onClear={() => c().unsetHighlight().run()}
      />
      <Sep />
      <Btn label="글머리 목록" active={editor.isActive("bulletList")} onClick={() => c().toggleBulletList().run()}>
        •≡
      </Btn>
      <Btn label="번호 목록" active={editor.isActive("orderedList")} onClick={() => c().toggleOrderedList().run()}>
        1.
      </Btn>
      <Btn label="인용" active={editor.isActive("blockquote")} onClick={() => c().toggleBlockquote().run()}>
        ❝
      </Btn>
      <Btn label="구분선" onClick={() => c().setHorizontalRule().run()}>
        ―
      </Btn>
      <Sep />
      <Btn label="왼쪽 정렬" active={editor.isActive({ textAlign: "left" })} onClick={() => c().setTextAlign("left").run()}>
        <AlignIcon lines={["w-4", "w-2.5", "w-3.5"]} align="items-start" />
      </Btn>
      <Btn label="가운데 정렬" active={editor.isActive({ textAlign: "center" })} onClick={() => c().setTextAlign("center").run()}>
        <AlignIcon lines={["w-4", "w-2.5", "w-3.5"]} align="items-center" />
      </Btn>
      <Btn label="오른쪽 정렬" active={editor.isActive({ textAlign: "right" })} onClick={() => c().setTextAlign("right").run()}>
        <AlignIcon lines={["w-4", "w-2.5", "w-3.5"]} align="items-end" />
      </Btn>
      <Sep />
      <Btn label="링크" active={editor.isActive("link")} onClick={setLink}>
        🔗
      </Btn>
      <Btn label="이미지 넣기" onClick={() => fileInput.current?.click()}>
        🖼
      </Btn>
      <input
        ref={fileInput}
        type="file"
        accept={Object.keys(BOARD_IMAGE_TYPES).join(",")}
        multiple
        hidden
        onChange={(e) => {
          onImages(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <Btn label="표 넣기" active={inTable} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        ▦
      </Btn>
      <Sep />
      <Btn label="실행 취소" disabled={!editor.can().undo()} onClick={() => c().undo().run()}>
        ↶
      </Btn>
      <Btn label="다시 실행" disabled={!editor.can().redo()} onClick={() => c().redo().run()}>
        ↷
      </Btn>

      {inTable && (
        <div className="flex w-full flex-wrap items-center gap-1 border-t border-zinc-200 pt-1 text-xs">
          <span className="px-1 text-zinc-500">표:</span>
          <TableBtn onClick={() => c().addRowAfter().run()}>행 추가</TableBtn>
          <TableBtn onClick={() => c().addColumnAfter().run()}>열 추가</TableBtn>
          <TableBtn onClick={() => c().deleteRow().run()}>행 삭제</TableBtn>
          <TableBtn onClick={() => c().deleteColumn().run()}>열 삭제</TableBtn>
          <TableBtn onClick={() => c().mergeOrSplit().run()}>셀 병합/분할</TableBtn>
          <TableBtn onClick={() => c().toggleHeaderRow().run()}>머리글 행</TableBtn>
          <TableBtn danger onClick={() => c().deleteTable().run()}>
            표 삭제
          </TableBtn>
        </div>
      )}
    </div>
  );
}

function Btn({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // 버튼을 눌러도 편집기 선택 영역이 풀리지 않게
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-sm disabled:opacity-30 ${
        active ? "bg-zinc-800 text-white" : "text-zinc-700 hover:bg-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function TableBtn({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded border px-2 py-0.5 ${
        danger ? "border-red-200 text-red-600 hover:bg-red-50" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-0.5 h-5 w-px bg-zinc-300" aria-hidden />;
}

function AlignIcon({ lines, align }: { lines: string[]; align: string }) {
  return (
    <span className={`flex flex-col gap-[3px] ${align}`} aria-hidden>
      {lines.map((w, i) => (
        <span key={i} className={`h-[2px] ${w} bg-current`} />
      ))}
    </span>
  );
}

function ColorMenu({
  label,
  icon,
  colors,
  onPick,
  onClear,
}: {
  label: string;
  icon: React.ReactNode;
  colors: string[];
  onPick: (color: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <Btn label={label} active={open} onClick={() => setOpen((v) => !v)}>
        {icon}
        <span className="ml-0.5 text-[9px]">▾</span>
      </Btn>
      {open && (
        <div className="absolute left-0 top-8 z-20 w-40 rounded-md border border-zinc-200 bg-white p-2 shadow-lg">
          <div className="grid grid-cols-5 gap-1.5">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                aria-label={`${label} ${color}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(color);
                  setOpen(false);
                }}
                className="size-6 rounded border border-zinc-200 hover:scale-110"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onClear();
              setOpen(false);
            }}
            className="mt-2 w-full rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
          >
            {label} 없애기
          </button>
        </div>
      )}
    </div>
  );
}

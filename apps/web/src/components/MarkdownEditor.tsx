import type { Attachment } from "@zhizhi/shared";
import { cn } from "@zhizhi/ui/lib/utils";
import { Eye, ImagePlus, Pencil } from "lucide-react";
import {
  forwardRef,
  type KeyboardEvent,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";
import { useWorkspace } from "@/stores/workspace";
import { AttachmentStrip, Markdown } from "./Markdown";

export interface MarkdownEditorHandle {
  focus: () => void;
}

const ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp,text/plain,application/json,application/zip";

/** 上传中的占位文本；完成后替换成真实引用，失败则删除。 */
const placeholder = (n: number) => `![上传中…](uploading-${n})`;
let uploadSeq = 0;

/**
 * Markdown 编辑器：写作 / 预览切换，支持粘贴截图、拖拽文件和按钮选择。
 * 上传完成后在光标处插入 `![](ATT-xxx)`，并通过 onAttach 把附件交给调用方绑定到任务。
 */
export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  {
    value: string;
    onChange: (v: string) => void;
    attachments: Attachment[];
    onAttach: (a: Attachment) => void;
    onRemoveAttachment?: (id: string) => void;
    placeholder?: string;
    minRows?: number;
    autoFocus?: boolean;
    onBlur?: () => void;
    onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
    className?: string;
    /** 紧凑模式用于评论框：工具栏更小，默认不显示附件条标题。 */
    compact?: boolean;
  }
>(function MarkdownEditor(
  {
    value,
    onChange,
    attachments,
    onAttach,
    onRemoveAttachment,
    placeholder: hint = "添加描述…支持 Markdown，可直接粘贴或拖入图片",
    minRows = 4,
    autoFocus,
    onBlur,
    onKeyDown,
    className,
    compact,
  },
  ref,
) {
  const slug = useWorkspace((s) => s.slug);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  // 上传是异步的，期间用户可能继续输入，用 ref 拿到最新正文再做替换。
  const latest = useRef(value);
  latest.current = value;

  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }));

  // 进入编辑态时直接把光标放到末尾，用户点哪里就从哪里接着写。
  useEffect(() => {
    if (!autoFocus) return;
    const el = area.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [autoFocus]);

  // 内容决定高度，自动撑开，避免出现内层滚动条。
  // biome-ignore lint/correctness/useExhaustiveDependencies: value 变化即需重算高度
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${Math.max(el.scrollHeight, minRows * 22)}px`;
  }, [value, minRows, mode]);

  const insertAt = (text: string) => {
    const el = area.current;
    const cur = latest.current;
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    const before = cur.slice(0, start);
    // 图片单独成行，渲染时不会挤在文字中间。
    const pad = before && !before.endsWith("\n") ? "\n" : "";
    const next = `${before}${pad}${text}\n${cur.slice(end)}`;
    // 同步更新 ref：上传回调可能在下一次渲染之前就读取它。
    latest.current = next;
    onChange(next);
    requestAnimationFrame(() => {
      const pos = before.length + pad.length + text.length + 1;
      el?.setSelectionRange(pos, pos);
    });
  };

  const upload = async (files: File[]) => {
    if (!slug || files.length === 0) return;
    setMode("write");
    for (const f of files) {
      const n = ++uploadSeq;
      const tag = placeholder(n);
      insertAt(tag);
      setBusy((b) => b + 1);
      try {
        const a = await api.upload(slug, f);
        onAttach(a);
        const image = a.mime.startsWith("image/");
        const name = (f.name || "截图").replace(/[[\]]/g, "");
        const md = image ? `![${name}](${a.id})` : `[${name}](${a.id})`;
        onChange(latest.current.replace(tag, md));
      } catch (e) {
        onChange(latest.current.replace(`${tag}\n`, "").replace(tag, ""));
        toast.error((e as Error).message);
      } finally {
        setBusy((b) => b - 1);
      }
    }
  };

  return (
    // 拖放上传是鼠标操作的补充，键盘用户可用「添加图片」按钮或直接粘贴。
    // biome-ignore lint/a11y/noStaticElementInteractions: 见上
    <div
      className={cn(
        "relative rounded-lg transition-[box-shadow,background-color] duration-150",
        dragging && "bg-accent-soft/60 ring-2 ring-accent/40",
        className,
      )}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        upload(Array.from(e.dataTransfer.files));
      }}
    >
      {mode === "write" ? (
        <textarea
          ref={area}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) {
              e.preventDefault();
              upload(files);
            }
          }}
          placeholder={hint}
          className="block w-full resize-none overflow-hidden bg-transparent text-[13.5px] leading-relaxed text-zinc-700 outline-none placeholder:text-zinc-400"
        />
      ) : (
        <div className="min-h-20 py-0.5">
          {value.trim() ? (
            <Markdown text={value} />
          ) : (
            <span className="text-[13px] text-zinc-400">没有可预览的内容</span>
          )}
        </div>
      )}

      {attachments.length > 0 && (
        <div className={cn("pt-2", compact && "pt-1.5")}>
          <AttachmentStrip items={attachments} onRemove={onRemoveAttachment} />
        </div>
      )}

      <div className={cn("flex items-center gap-1 pt-2", compact && "pt-1")}>
        <button
          type="button"
          onClick={() => file.current?.click()}
          className="press inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
        >
          <ImagePlus size={13} /> 添加图片
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "write" ? "preview" : "write")}
          className="press inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
        >
          {mode === "write" ? <Eye size={13} /> : <Pencil size={13} />}
          {mode === "write" ? "预览" : "编辑"}
        </button>
        {busy > 0 && (
          <span className="ml-1 inline-flex items-center gap-1.5 text-xs text-zinc-400">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" /> 正在上传 {busy}{" "}
            个文件
          </span>
        )}
        <input
          ref={file}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            upload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
});

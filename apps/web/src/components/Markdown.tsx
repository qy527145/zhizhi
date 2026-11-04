import type { Attachment } from "@zhizhi/shared";
import { cn } from "@zhizhi/ui/lib/utils";
import { CloseButton, useEscapeLayer } from "@zhizhi/ui/ui";
import { FileText, ImageOff } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { attachmentUrl } from "@/lib/api";

const isAttachment = (src: string | undefined) => !!src && /^ATT-[0-9a-zA-Z]+$/.test(src);

/** 把 ATT-xxx 解析成带鉴权取回的 blob URL；外链原样使用。 */
export function useAttachmentSrc(src: string | undefined) {
  const [url, setUrl] = useState<string | null>(isAttachment(src) ? null : (src ?? null));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!src || !isAttachment(src)) {
      setUrl(src ?? null);
      return;
    }
    let alive = true;
    setFailed(false);
    attachmentUrl(src)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [src]);
  return { url, failed };
}

/** 正文图片：加载中显示骨架，点击放大查看。 */
function Img({ src, alt }: { src?: string; alt?: string }) {
  const { url, failed } = useAttachmentSrc(src);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(false);
  if (failed) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-zinc-300 px-2 py-1 text-xs text-zinc-400">
        <ImageOff size={13} /> 图片无法加载{alt ? `：${alt}` : ""}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setZoom(true)}
        className="group relative block max-w-full cursor-zoom-in overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50"
      >
        {!loaded && <span className="skeleton block h-40 w-72 max-w-full" />}
        {url && (
          <img
            src={url}
            alt={alt ?? ""}
            onLoad={() => setLoaded(true)}
            className={cn(
              "max-h-[420px] max-w-full object-contain transition-opacity duration-200",
              loaded ? "opacity-100" : "absolute inset-0 opacity-0",
            )}
          />
        )}
      </button>
      {alt && <span className="mt-1 block text-xs text-zinc-400">{alt}</span>}
      {zoom && url && <Lightbox url={url} alt={alt} onClose={() => setZoom(false)} />}
    </>
  );
}

export function Lightbox({
  url,
  alt,
  onClose,
}: {
  url: string;
  alt?: string;
  onClose: () => void;
}) {
  useEscapeLayer(true, onClose);
  return createPortal(
    // 点击任意处关闭，Esc 同样关闭（见上）。
    // biome-ignore lint/a11y/noStaticElementInteractions: 见上
    <div
      className="fixed inset-0 z-[70] flex animate-fade cursor-zoom-out items-center justify-center bg-zinc-950/80 p-8 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={undefined}
    >
      <div className="absolute top-4 right-4 [&_button]:text-white/70 [&_button:hover]:bg-white/10 [&_button:hover]:text-white">
        <CloseButton onClick={onClose} />
      </div>
      <img
        src={url}
        alt={alt ?? ""}
        className="max-h-full max-w-full animate-in rounded-lg object-contain shadow-2xl"
      />
    </div>,
    document.body,
  );
}

const components: Components = {
  img: ({ src, alt }) => <Img src={typeof src === "string" ? src : undefined} alt={alt} />,
  a: ({ href, children }) => {
    // 非图片附件（日志、压缩包）渲染成文件卡片，点击下载。
    if (isAttachment(href)) return <FileLink id={href ?? ""}>{children}</FileLink>;
    return (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
};

function FileLink({ id, children }: { id: string; children: React.ReactNode }) {
  const download = async () => {
    const url = await attachmentUrl(id);
    const a = document.createElement("a");
    a.href = url;
    a.download = typeof children === "string" ? children : id;
    a.click();
  };
  return (
    <button
      type="button"
      onClick={download}
      className="press inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100"
    >
      <FileText size={12} /> {children}
    </button>
  );
}

/** Markdown 正文。不渲染原始 HTML（react-markdown 默认），避免 XSS。 */
export const Markdown = memo(function Markdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={cn("prose-zz", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});

/** 附件缩略图条：编辑器底部和详情侧栏共用。 */
export function AttachmentStrip({
  items,
  onRemove,
}: {
  items: Attachment[];
  onRemove?: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((a) => (
        <Thumb key={a.id} a={a} onRemove={onRemove} />
      ))}
    </div>
  );
}

function Thumb({ a, onRemove }: { a: Attachment; onRemove?: (id: string) => void }) {
  const image = a.mime.startsWith("image/");
  const { url } = useAttachmentSrc(image ? a.id : undefined);
  const [zoom, setZoom] = useState(false);
  return (
    <div className="group relative animate-in">
      <button
        type="button"
        onClick={() => (image ? setZoom(true) : undefined)}
        title={a.filename}
        className="press flex size-14 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-400"
      >
        {image ? (
          url ? (
            <img src={url} alt={a.filename} className="size-full object-cover" />
          ) : (
            <span className="skeleton size-full" />
          )
        ) : (
          <FileText size={18} />
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(a.id)}
          aria-label={`移除 ${a.filename}`}
          className="press absolute -top-1.5 -right-1.5 hidden size-4 items-center justify-center rounded-full bg-zinc-900 text-[10px] text-white group-hover:flex"
        >
          ×
        </button>
      )}
      {zoom && url && <Lightbox url={url} alt={a.filename} onClose={() => setZoom(false)} />}
    </div>
  );
}

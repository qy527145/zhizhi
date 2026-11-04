import { X } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "./lib/utils";

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-zinc-200 bg-zinc-50 px-1 font-sans text-[11px] text-zinc-500",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm",
  accent: "bg-accent text-white hover:bg-accent-ink shadow-sm shadow-accent/20",
  secondary: "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 shadow-xs",
  ghost: "text-zinc-600 hover:bg-zinc-100",
  danger: "bg-red-600 text-white hover:bg-red-500",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(function Button({ variant = "secondary", className, ...rest }, ref) {
  return (
    <button
      type="button"
      ref={ref}
      className={cn(
        // 只过渡颜色与按压缩放，避免 transition-all 带来的布局重算。
        "press inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-[background-color,color,border-color,box-shadow,transform] duration-150 disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-8 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-[13px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-zinc-400 focus:border-accent focus:ring-3 focus:ring-accent/10",
          className,
        )}
        {...rest}
      />
    );
  },
);

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    // children 通常是单个输入控件，label 包装即可建立关联，规则无法静态推断。
    // biome-ignore lint/a11y/noLabelWithoutControl: 见上
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-zinc-600">{label}</span>
      {children}
      {hint && <span className="block text-xs text-zinc-400">{hint}</span>}
    </label>
  );
}

/** 当前打开的弹层，后打开的在栈顶。 */
const escapeLayers: { current: () => void }[] = [];

function onEscapeKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  const top = escapeLayers.at(-1);
  if (!top) return;
  e.preventDefault();
  e.stopPropagation();
  top.current();
}

/**
 * 注册一层可被 Esc 关闭的弹层，一次按键只关闭最上面一层。
 * 全局只装一个监听器：如果每层各装一个，React 可能在两个监听器之间就刷新状态并让下一层
 * 变成栈顶，一次 Esc 会连关两层（比如在新建任务的选择器里按 Esc 把整个弹窗关掉）。
 */
export function useEscapeLayer(active: boolean, onClose: () => void) {
  const handler = useRef(onClose);
  useEffect(() => {
    handler.current = onClose;
  });
  useEffect(() => {
    if (!active) return;
    escapeLayers.push(handler);
    if (escapeLayers.length === 1) window.addEventListener("keydown", onEscapeKey, true);
    return () => {
      escapeLayers.splice(escapeLayers.indexOf(handler), 1);
      if (escapeLayers.length === 0) window.removeEventListener("keydown", onEscapeKey, true);
    };
  }, [active]);
}

/**
 * 居中弹层。Esc 关闭由各自的调用方通过 onClose 处理。
 * `instant` 用于命令面板这类高频、键盘唤起的弹层：不做进场动画，打开即可输入。
 */
export function Modal({
  open,
  onClose,
  children,
  className,
  top = "14vh",
  instant = false,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  top?: string;
  instant?: boolean;
}) {
  useEscapeLayer(open, onClose);

  if (!open) return null;
  return createPortal(
    // 点击遮罩关闭弹层；键盘用户用 Esc（见上方的 keydown 监听）。
    // biome-ignore lint/a11y/noStaticElementInteractions: 见上
    <div
      className={cn(
        "fixed inset-0 z-50 flex justify-center bg-zinc-950/25 px-4 backdrop-blur-[2px]",
        !instant && "animate-fade",
      )}
      style={{ paddingTop: top }}
      onMouseDown={onClose}
    >
      {/* 阻止弹层内部的点击冒泡到遮罩，避免误关闭。 */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "h-fit max-h-[80vh] w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-pop",
          !instant && "animate-in",
          className,
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function IconButton({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "press inline-flex size-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800",
        className,
      )}
      {...rest}
    />
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton onClick={onClick} aria-label="关闭">
      <X size={15} />
    </IconButton>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        // 转速稍快会让等待显得更短。
        "inline-block size-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700 [animation-duration:600ms]",
        className,
      )}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn("skeleton block rounded-md", className)} />;
}

export function Empty({
  icon,
  title,
  desc,
  action,
}: {
  icon: ReactNode;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 animate-rise flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-400 shadow-card">
        {icon}
      </div>
      <div>
        <div className="text-sm font-medium text-zinc-800">{title}</div>
        {desc && <div className="mt-1 text-[13px] text-zinc-500">{desc}</div>}
      </div>
      {action}
    </div>
  );
}

/** 分段控件：视图切换等互斥选项。选中块的位移只动 transform。 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; icon: ReactNode; label: string }[];
  onChange: (v: T) => void;
}) {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <div className="relative flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
      <span
        aria-hidden="true"
        className="absolute top-0.5 bottom-0.5 left-0.5 w-7 rounded-md bg-white shadow-card transition-transform duration-200 ease-[var(--ease-out)]"
        style={{ transform: `translateX(${idx * 28}px)` }}
      />
      {options.map((o) => (
        <button
          type="button"
          aria-pressed={o.value === value}
          key={o.value}
          title={o.label}
          aria-label={o.label}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative z-10 flex h-6 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors",
            o.value === value && "text-zinc-900",
          )}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

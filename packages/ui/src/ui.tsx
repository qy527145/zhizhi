import { X } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
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

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm",
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
        "inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
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
          "h-8 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-[13px] outline-none transition placeholder:text-zinc-400 focus:border-accent focus:ring-3 focus:ring-accent/10",
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

/** 居中弹层。Esc 关闭由各自的调用方通过 onClose 处理。 */
export function Modal({
  open,
  onClose,
  children,
  className,
  top = "14vh",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  top?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    // 点击遮罩关闭弹层；键盘用户用 Esc（见上方的 keydown 监听）。
    // biome-ignore lint/a11y/noStaticElementInteractions: 见上
    <div
      className="fixed inset-0 z-50 flex justify-center bg-zinc-900/20 px-4"
      style={{ paddingTop: top }}
      onMouseDown={onClose}
    >
      {/* 阻止弹层内部的点击冒泡到遮罩，避免误关闭。 */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 见上 */}
      <div
        className={cn(
          "h-fit w-full max-w-xl animate-in overflow-hidden rounded-xl bg-white shadow-pop",
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
        "inline-flex size-6 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800",
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

export function Spinner() {
  return (
    <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
  );
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
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl border border-zinc-200 text-zinc-400">
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

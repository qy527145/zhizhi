import { cn } from "@zhizhi/ui/lib/utils";
import { CircleAlert, CircleCheck } from "lucide-react";
import { toast, useToasts } from "@/stores/toast";

/** 右下角通知：进出场方向一致（自下而上进、向下淡出），出场比进场快。 */
export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col items-end gap-2"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex items-center gap-2.5 rounded-lg bg-zinc-900 py-2.5 pr-2.5 pl-3.5 text-[13px] text-white shadow-pop transition-[opacity,transform] duration-150 ease-[var(--ease-out)]",
            "starting:translate-y-2 starting:opacity-0",
            t.leaving && "translate-y-1 opacity-0",
          )}
        >
          {t.kind === "success" ? (
            <CircleCheck size={15} className="shrink-0 text-emerald-400" />
          ) : (
            <CircleAlert size={15} className="shrink-0 text-red-400" />
          )}
          <span className="pr-1">{t.text}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action?.run();
                toast.dismiss(t.id);
              }}
              className="press rounded-md bg-white/10 px-2 py-0.5 text-xs font-medium text-white hover:bg-white/20"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

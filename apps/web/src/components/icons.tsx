import type { Priority, StateGroup } from "@zhizhi/shared";
import { cn } from "@zhizhi/ui/lib/utils";

/** 状态图标：以圆环填充程度表达进度，延续 Plane / Linear 的视觉语言。 */
export function StateIcon({
  group,
  color,
  size = 14,
}: {
  group: StateGroup;
  color: string;
  size?: number;
}) {
  const r = 6;
  const c = 2 * Math.PI * 3;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0"
      aria-hidden="true"
    >
      {group === "backlog" && (
        <circle cx="8" cy="8" r={r} stroke={color} strokeWidth="1.5" strokeDasharray="2.2 2" />
      )}
      {group === "unstarted" && <circle cx="8" cy="8" r={r} stroke={color} strokeWidth="1.5" />}
      {group === "started" && (
        <>
          <circle cx="8" cy="8" r={r} stroke={color} strokeWidth="1.5" />
          <circle
            cx="8"
            cy="8"
            r="3"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={`${c / 2} ${c}`}
            transform="rotate(-90 8 8)"
          />
        </>
      )}
      {group === "completed" && (
        <>
          <circle cx="8" cy="8" r="7" fill={color} />
          <path
            d="M5 8.2l2 2 4-4.2"
            stroke="#fff"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {group === "cancelled" && (
        <>
          <circle cx="8" cy="8" r="7" fill={color} />
          <path
            d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"
            stroke="#fff"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

export function PriorityIcon({ priority, size = 14 }: { priority: Priority; size?: number }) {
  if (priority === "urgent") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className="shrink-0" aria-hidden="true">
        <rect x="1" y="1" width="14" height="14" rx="3.5" fill="#ef4444" />
        <path d="M8 4.2v4.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="8" cy="11.4" r="1.05" fill="#fff" />
      </svg>
    );
  }
  if (priority === "none") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        className="shrink-0 text-zinc-400"
        aria-hidden="true"
      >
        {[3, 7, 11].map((x) => (
          <rect key={x} x={x} y="7.25" width="2.2" height="1.5" rx="0.6" fill="currentColor" />
        ))}
      </svg>
    );
  }
  const level = { high: 3, medium: 2, low: 1 }[priority];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="shrink-0" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={2 + i * 4.3}
          y={10 - i * 3.5}
          width="3"
          height={4 + i * 3.5}
          rx="0.8"
          className={i < level ? "fill-zinc-700" : "fill-zinc-300"}
        />
      ))}
    </svg>
  );
}

const AVATAR_COLORS = [
  "#f97316",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#eab308",
  "#6366f1",
];

export function Avatar({
  name,
  size = 18,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  // 中文名取最后一个字（通常是名），英文名取首字母。
  const initial = /[一-龥]/.test(name) ? name.slice(-1) : name.charAt(0).toUpperCase();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: AVATAR_COLORS[h % AVATAR_COLORS.length],
      }}
    >
      {initial}
    </span>
  );
}

export function LabelDot({ color }: { color: string }) {
  return (
    <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: color }} />
  );
}

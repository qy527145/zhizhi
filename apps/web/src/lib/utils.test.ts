import { describe, expect, test } from "bun:test";

import { cn, formatDue, isOverdue } from "./utils";

describe("cn", () => {
  test("拼合非空类名", () => {
    expect(cn("p-2", false, undefined, "text-sm")).toBe("p-2 text-sm");
  });
});

describe("formatDue", () => {
  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  test("相对日期用中文", () => {
    expect(formatDue(day(0))).toBe("今天");
    expect(formatDue(day(1))).toBe("明天");
    expect(formatDue(day(-1))).toBe("昨天");
  });

  test("更远的日期带月份", () => {
    expect(formatDue(day(3))).toMatch(/^\d{1,2}月\d{1,2}日$/);
  });
});

describe("isOverdue", () => {
  test("没有截止日期不算逾期", () => {
    expect(isOverdue(null)).toBe(false);
  });

  test("过去的日期算逾期", () => {
    expect(isOverdue("2020-01-01")).toBe(true);
  });
});

import type { ViewKind } from "@zhizhi/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = ViewKind;
/** 任务属性选择器的类型，可由快捷键直接唤起 */
export type PickerKind = "state" | "priority" | "assignee" | "labels" | "due" | "start";

export const VIEW_ORDER: ViewMode[] = ["list", "board", "table", "calendar", "timeline"];

interface UiState {
  paletteOpen: boolean;
  createOpen: boolean;
  /** 新建任务时预设的状态（从分组的 + 按钮进入） */
  createStateId: string | null;
  helpOpen: boolean;
  /** 当前在侧边详情面板中打开的任务 */
  peekId: string | null;
  /** 列表中键盘高亮的任务 */
  focusedId: string | null;
  /** 刚创建的任务，列表里做一次性高亮 */
  flashId: string | null;
  picker: { kind: PickerKind; issueId: string } | null;
  viewMode: ViewMode;
  sidebarCollapsed: boolean;
  set: (p: Partial<Omit<UiState, "set">>) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      paletteOpen: false,
      createOpen: false,
      createStateId: null,
      helpOpen: false,
      peekId: null,
      focusedId: null,
      flashId: null,
      picker: null,
      viewMode: "list",
      sidebarCollapsed: false,
      set: (p) => set(p),
    }),
    {
      name: "zhizhi.ui",
      partialize: (s) => ({ viewMode: s.viewMode, sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
);

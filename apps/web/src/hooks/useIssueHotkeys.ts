import { useAuth } from "@/stores/auth";
import { useIssues } from "@/stores/issues";
import { useUi } from "@/stores/ui";
import { type HotkeyMap, useHotkeys } from "./useHotkeys";

/** 对当前选中任务（详情面板中的任务优先，否则为列表高亮项）的单键操作。 */
export function useIssueHotkeys(opts: { onEditTitle?: () => void } = {}) {
  const target = () => {
    const ui = useUi.getState();
    return ui.peekId ?? ui.focusedId;
  };
  const blocked = () => {
    const ui = useUi.getState();
    return ui.paletteOpen || ui.createOpen || ui.helpOpen || !!ui.picker;
  };
  const pick = (kind: "state" | "priority" | "assignee" | "labels" | "due") => () => {
    const id = target();
    if (id && !blocked()) useUi.getState().set({ picker: { kind, issueId: id } });
  };
  const map: HotkeyMap = {
    s: pick("state"),
    p: pick("priority"),
    a: pick("assignee"),
    l: pick("labels"),
    d: pick("due"),
    i: () => {
      const id = target();
      const me = useAuth.getState().user?.id;
      if (!id || !me || blocked()) return;
      const issue = useIssues.getState().byId[id];
      useIssues.getState().update(id, { assignee_id: issue?.assignee_id === me ? null : me });
    },
    "mod+Backspace": () => {
      const id = target();
      if (!id || blocked()) return;
      const issue = useIssues.getState().byId[id];
      if (issue && confirm(`确定删除任务「${issue.title}」？此操作不可撤销。`)) {
        useUi.getState().set({ peekId: null, focusedId: null });
        useIssues.getState().remove(id);
      }
    },
  };
  if (opts.onEditTitle) map.e = opts.onEditTitle;
  useHotkeys(map);
}

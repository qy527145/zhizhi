import { Spinner } from "@zhizhi/ui/ui";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { IssueDetail } from "@/components/IssueDetail";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useIssueHotkeys } from "@/hooks/useIssueHotkeys";
import { type ApiError, api } from "@/lib/api";
import { useIssues } from "@/stores/issues";
import { useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";

export function IssuePage() {
  const { slug, projectId, issueId } = useParams();
  const issue = useIssues((s) => (issueId ? s.byId[issueId] : undefined));
  const project = useWorkspace((s) => s.projects.find((p) => p.id === projectId));
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!issueId || !projectId) return;
    useUi.getState().set({ focusedId: issueId });
    const { loadMeta, upsert } = useIssues.getState();
    Promise.all([api.issue(issueId), loadMeta(projectId)])
      .then(([issue]) => upsert([issue]))
      .catch((e: ApiError) => setError(e.status === 404 ? "任务不存在或已被删除" : e.message));
    return () => useUi.getState().set({ focusedId: null });
  }, [issueId, projectId]);

  useIssueHotkeys({ onEditTitle: () => window.dispatchEvent(new Event("zhizhi:edit-title")) });
  useHotkeys({
    // biome-ignore lint/complexity/useLiteralKeys: 大写键名会被误判为组件定义
    ["Escape"]: () => !useUi.getState().picker && navigate(`/${slug}/projects/${projectId}`),
  });

  if (error) return <div className="p-10 text-zinc-500">{error}</div>;
  if (!issue) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-zinc-200/80 px-5 text-[13px]">
        <Link to={`/${slug}/projects/${projectId}`} className="text-zinc-500 hover:text-zinc-900">
          {project?.name}
        </Link>
        <ChevronRight size={13} className="text-zinc-300" />
        <span className="truncate font-medium">{issue.title}</span>
      </div>
      <div className="min-h-0 flex-1">
        <IssueDetail issueId={issue.id} mode="page" />
      </div>
    </div>
  );
}

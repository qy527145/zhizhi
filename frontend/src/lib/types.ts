export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none'
export type StateGroup = 'backlog' | 'unstarted' | 'started' | 'completed' | 'cancelled'

export interface User {
  id: string
  email: string
  name: string
  created_at: string
}

export interface Workspace {
  id: string
  name: string
  slug: string
  owner_id: string
  created_at: string
}

export interface Member {
  id: string
  email: string
  name: string
  role: 'owner' | 'admin' | 'member'
}

export interface Project {
  id: string
  workspace_id: string
  name: string
  identifier: string
  description: string
  created_at: string
}

export interface IssueState {
  id: string
  project_id: string
  name: string
  group: StateGroup
  color: string
  position: number
}

export interface Label {
  id: string
  project_id: string
  name: string
  color: string
}

export interface Issue {
  id: string
  project_id: string
  seq: number
  title: string
  description: string
  state_id: string
  priority: Priority
  assignee_id: string | null
  due_date: string | null
  sort_order: number
  created_by: string
  created_at: string
  updated_at: string
  label_ids: string[]
}

export interface Comment {
  id: string
  issue_id: string
  author_id: string
  body: string
  created_at: string
}

export interface Activity {
  id: string
  issue_id: string
  actor_id: string
  field: string
  old_value: string | null
  new_value: string | null
  created_at: string
}

export type IssuePatch = Partial<
  Pick<Issue, 'title' | 'description' | 'state_id' | 'priority' | 'assignee_id' | 'due_date' | 'label_ids' | 'sort_order'>
>

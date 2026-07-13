// Feature barrel — the team-todo feature is imported ONLY through this file
// (feature isolation, CLAUDE.md). Its route tier and components are gated by the
// `team_todo_mvp` flag at the mount site (see App.tsx). S1..S11 add the real
// screens here; this skeleton exposes the entry component the frontend-engineer
// builds out against the generated API client.
export { TeamTodoApp } from './TeamTodoApp'

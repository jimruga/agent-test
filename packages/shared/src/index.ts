// Framework-agnostic types shared between apps/api and apps/web.
// Feature isolation: consumers import from '@repo/shared', never deep paths.
export type { ApiErrorBody, ApiErrorCode, ApiErrorDetail } from './errors'
export type { CurrentUser, MembershipSummary, TeamRole } from './auth'

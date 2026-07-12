// The platform's single API error envelope. Every non-2xx response uses this
// exact shape so clients (and the generated client) have one error contract.
// Never leak stack traces, SQL, or the existence of another tenant's rows here
// (TDD §2.1, §4.4). `details` is for field-level validation feedback only.

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'unprocessable'
  | 'rate_limited'
  | 'internal'

export interface ApiErrorDetail {
  readonly field?: string
  readonly message: string
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: ApiErrorCode
    readonly message: string
    readonly details?: readonly ApiErrorDetail[]
  }
}

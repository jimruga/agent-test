import { describe, expect, it, vi } from 'vitest'
import { type OAuthClaims, createGoogleProvider } from './oauth-provider'

function fakeResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response
}

const verifiedClaims: OAuthClaims = {
  subject: 'sub-1',
  email: 'ada@example.com',
  emailVerified: true,
  nonce: 'issued-nonce',
}

interface CapturedRequest {
  url: string
  body: string
}

function recordingFetch(response: Response): {
  fetchImpl: typeof fetch
  requests: CapturedRequest[]
} {
  const requests: CapturedRequest[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), body: init?.body?.toString() ?? '' })
    return response
  }) as typeof fetch
  return { fetchImpl, requests }
}

function makeProvider(fetchImpl: typeof fetch, verify = vi.fn(async () => verifiedClaims)) {
  return {
    provider: createGoogleProvider({
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: 'client-id',
      redirectUri: 'https://app.test/api/auth/callback',
      scopes: ['openid', 'email'],
      resolveClientSecret: async () => 'resolved-secret',
      verifyIdToken: verify,
      fetchImpl,
    }),
    verify,
  }
}

describe('createGoogleProvider.buildAuthorizeUrl', () => {
  it('includes response_type, client_id, S256 challenge, state and nonce', () => {
    const { provider } = makeProvider((async () => fakeResponse({})) as typeof fetch)
    const url = new URL(
      provider.buildAuthorizeUrl({ state: 'st', nonce: 'no', codeChallenge: 'chal' }),
    )
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('client-id')
    expect(url.searchParams.get('code_challenge')).toBe('chal')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toBe('st')
    expect(url.searchParams.get('nonce')).toBe('no')
  })
})

describe('createGoogleProvider.exchangeCode', () => {
  it('exchanges the code with the resolved secret and returns verifier-validated claims', async () => {
    const { fetchImpl, requests } = recordingFetch(
      fakeResponse({ access_token: 'at', refresh_token: 'rt', id_token: 'idt', expires_in: 3600 }),
    )
    const { provider, verify } = makeProvider(fetchImpl)

    const result = await provider.exchangeCode({ code: 'auth-code', codeVerifier: 'verifier' })

    // The ID token is verified via the injected verifier — never trusted raw (A08).
    expect(verify).toHaveBeenCalledWith('idt')
    expect(result.tokens.accessToken).toBe('at')
    expect(result.claims.subject).toBe('sub-1')

    // The resolved client secret + PKCE verifier are sent in the token request.
    const sent = requests[0]?.body ?? ''
    expect(sent).toContain('client_secret=resolved-secret')
    expect(sent).toContain('code_verifier=verifier')
    expect(sent).toContain('grant_type=authorization_code')
  })

  it('throws when the token endpoint returns a non-2xx response', async () => {
    const { provider } = makeProvider((async () => fakeResponse({}, false, 401)) as typeof fetch)
    await expect(provider.exchangeCode({ code: 'c', codeVerifier: 'v' })).rejects.toThrow(
      /token exchange failed/,
    )
  })

  it('rejects when verifyIdToken throws — an unverified token never yields claims (A08, F3)', async () => {
    const { fetchImpl } = recordingFetch(
      fakeResponse({ access_token: 'at', refresh_token: 'rt', id_token: 'idt', expires_in: 3600 }),
    )
    const failingVerify = vi.fn(async () => {
      throw new Error('id token verification failed: signature')
    })
    const { provider } = makeProvider(fetchImpl, failingVerify)
    await expect(provider.exchangeCode({ code: 'auth-code', codeVerifier: 'v' })).rejects.toThrow(
      /verification failed/,
    )
  })
})

describe('createGoogleProvider.revoke', () => {
  it('posts the refresh token to the revoke endpoint (best-effort)', async () => {
    const { fetchImpl, requests } = recordingFetch(fakeResponse({}))
    const { provider } = makeProvider(fetchImpl)
    await provider.revoke('refresh-tok')
    expect(requests[0]?.url).toContain('revoke')
    expect(requests[0]?.body).toContain('token=refresh-tok')
  })
})

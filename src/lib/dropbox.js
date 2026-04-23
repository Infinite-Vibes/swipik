const APP_KEY         = import.meta.env.VITE_DROPBOX_APP_KEY      || ''
const EXPLICIT_REDIRECT = import.meta.env.VITE_DROPBOX_REDIRECT_URI || ''

// ── PKCE helpers ──

function generateVerifier() {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function generateChallenge(verifier) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function redirectUri() {
  if (EXPLICIT_REDIRECT) return EXPLICIT_REDIRECT
  // Android uses a custom URL scheme so the OS routes the callback back into the app
  if (window.Capacitor?.getPlatform() === 'android') return 'com.swipik.app://auth'
  return 'http://localhost:5299/swipik.html'
}

export const hasAppKey = () => !!APP_KEY

// ── Auth ──

/**
 * Start Dropbox OAuth.
 * - In Electron: opens a popup BrowserWindow, returns a promise that resolves
 *   when the user completes auth (tokens stored in sessionStorage).
 * - In browser: navigates the page to Dropbox (app must call handleCallback()
 *   on the next load when ?code= is present in the URL).
 */
export async function startDropboxAuth() {
  if (!APP_KEY) throw new Error('VITE_DROPBOX_APP_KEY is not set. Add it to your .env file.')

  const verifier  = generateVerifier()
  const challenge = await generateChallenge(verifier)
  sessionStorage.setItem('dbx_v', verifier)

  const params = new URLSearchParams({
    client_id:             APP_KEY,
    response_type:         'code',
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    redirect_uri:          redirectUri(),
    token_access_type:     'offline',
  })
  const authUrl = `https://www.dropbox.com/oauth2/authorize?${params}`

  if (window.electronAPI) {
    // Electron: intercept redirect in a popup, get code here
    const code = await window.electronAPI.dropboxAuthStart(authUrl)
    await _exchangeCode(code)
  } else if (window.Capacitor?.getPlatform() === 'android') {
    // Android: open Chrome Custom Tab, wait for OS to route com.swipik.app://auth back
    const { Browser } = await import('@capacitor/browser')
    const { App }     = await import('@capacitor/app')
    await new Promise((resolve, reject) => {
      const sub = App.addListener('appUrlOpen', async ({ url }) => {
        sub.then(h => h.remove())
        await Browser.close().catch(() => {})
        const code = new URL(url).searchParams.get('code')
        const error = new URL(url).searchParams.get('error')
        if (error) { reject(Object.assign(new Error(`Dropbox: ${error}`), { name: 'AbortError' })); return }
        if (!code) { reject(new Error('No code in callback URL')); return }
        await _exchangeCode(code)
        resolve()
      })
      Browser.open({ url: authUrl, presentationStyle: 'popover' }).catch(reject)
    })
  } else {
    // Browser: full-page redirect; handleCallback() picks up ?code= on return
    window.location.href = authUrl
  }
}

async function _exchangeCode(code) {
  const verifier = sessionStorage.getItem('dbx_v')
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      grant_type:    'authorization_code',
      client_id:     APP_KEY,
      code_verifier: verifier,
      redirect_uri:  redirectUri(),
    }),
  })
  sessionStorage.removeItem('dbx_v')
  if (!res.ok) {
    const detail = await res.text().catch(() => res.status)
    throw new Error(`Dropbox token exchange failed (${res.status}): ${detail}`)
  }
  const d = await res.json()
  sessionStorage.setItem('dbx_token', d.access_token)
  if (d.refresh_token) sessionStorage.setItem('dbx_rt', d.refresh_token)
}

/** Called on page load in browser mode to exchange the ?code= callback. */
export async function handleCallback() {
  const code     = new URLSearchParams(window.location.search).get('code')
  const verifier = sessionStorage.getItem('dbx_v')
  if (!code || !verifier) return false
  if (sessionStorage.getItem('dbx_exchanging')) return false
  sessionStorage.setItem('dbx_exchanging', '1')
  try {
    await _exchangeCode(code)
    window.history.replaceState({}, '', window.location.pathname)
    return true
  } finally {
    sessionStorage.removeItem('dbx_exchanging')
  }
}

export const isAuthed = () => !!sessionStorage.getItem('dbx_token')

export function logout() {
  sessionStorage.removeItem('dbx_token')
  sessionStorage.removeItem('dbx_rt')
}

// ── Core API call ──

async function api(endpoint, body, retry = true) {
  const token = sessionStorage.getItem('dbx_token')
  const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (res.status === 401 && retry) {
    if (await tryRefresh()) return api(endpoint, body, false)
    const err = new Error('Auth expired — please reconnect Dropbox')
    err.code = 'AUTH_EXPIRED'
    throw err
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.status)
    throw new Error(`Dropbox error ${res.status}: ${text}`)
  }
  return res.json()
}

async function tryRefresh() {
  const rt = sessionStorage.getItem('dbx_rt')
  if (!rt || !APP_KEY) return false
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: APP_KEY }),
  })
  if (!res.ok) return false
  sessionStorage.setItem('dbx_token', (await res.json()).access_token)
  return true
}

// ── File operations ──

export async function listFolder(path) {
  let r = await api('files/list_folder', { path: path || '', limit: 2000, include_media_info: true })
  const entries = [...r.entries]
  while (r.has_more) {
    r = await api('files/list_folder/continue', { cursor: r.cursor })
    entries.push(...r.entries)
  }
  return entries
}

export async function moveFile(fromPath, toPath) {
  return api('files/move_v2', { from_path: fromPath, to_path: toPath, autorename: true })
}

export async function renameFile(fromPath, newName) {
  const dir = fromPath.split('/').slice(0, -1).join('/')
  return moveFile(fromPath, `${dir || ''}/${newName}`)
}

export async function ensureFolder(path) {
  try {
    await api('files/create_folder_v2', { path })
  } catch (e) {
    if (!e.message.startsWith('Dropbox error 409')) throw e
  }
}

export async function getTempLink(path) {
  const d = await api('files/get_temporary_link', { path })
  return d.link
}

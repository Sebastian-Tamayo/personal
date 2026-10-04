/** Keep in sync with index.html meta familia-build + vite PWA cache bump. */
export const FAMILIA_BUILD_ID = 'rutinas-digest-time-v20261004b'

export const FAMILIA_VERSION_URL = `${import.meta.env.BASE_URL}familia-version.json`

export function readDomFamiliaBuild(): string {
  return (
    document.querySelector('meta[name="familia-build"]')?.getAttribute('content')?.trim() ||
    FAMILIA_BUILD_ID
  )
}

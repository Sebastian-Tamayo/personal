/** Keep in sync with index.html meta familia-build + vite PWA cache bump. */
export const FAMILIA_BUILD_ID = 'tarea-lead-visible-v20261004g'

export const FAMILIA_VERSION_URL = `${import.meta.env.BASE_URL}familia-version.json`

export function readDomFamiliaBuild(): string {
  return (
    document.querySelector('meta[name="familia-build"]')?.getAttribute('content')?.trim() ||
    FAMILIA_BUILD_ID
  )
}

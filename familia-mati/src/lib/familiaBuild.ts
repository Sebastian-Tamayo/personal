/** Keep in sync with index.html meta familia-build + vite PWA cache bump. */
export const FAMILIA_BUILD_ID = 'actualizar-reload-fix-v20261003m'

export const FAMILIA_VERSION_URL = `${import.meta.env.BASE_URL}familia-version.json`

export function readDomFamiliaBuild(): string {
  return (
    document.querySelector('meta[name="familia-build"]')?.getAttribute('content')?.trim() ||
    FAMILIA_BUILD_ID
  )
}

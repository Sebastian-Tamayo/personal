/** Keep in sync with index.html meta finanzas-build + vite PWA cache bump. */
export const FINANZAS_BUILD_ID = 'actualizar-overlay-v20261013b'

export const FINANZAS_VERSION_URL = `${import.meta.env.BASE_URL}finanzas-version.json`

export function readDomFinanzasBuild(): string {
  return (
    document.querySelector('meta[name="finanzas-build"]')?.getAttribute('content')?.trim() ||
    FINANZAS_BUILD_ID
  )
}

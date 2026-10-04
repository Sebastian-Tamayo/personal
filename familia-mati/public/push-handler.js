/* Service worker push handlers — imported by Workbox generateSW.
 * Runs even when the PWA is closed (home-screen install required on iOS). */
/* eslint-disable no-undef */
self.addEventListener('push', (event) => {
  let data = {
    title: 'Hellen y Mati',
    body: 'Hay un aviso de la agenda para ti.',
    url: '/personal/familia/',
    tag: 'familia-agenda',
  }
  try {
    if (event.data) {
      const parsed = event.data.json()
      data = { ...data, ...parsed }
    }
  } catch {
    try {
      const text = event.data && event.data.text()
      if (text) data.body = text
    } catch {
      /* ignore */
    }
  }

  const title = data.title || 'Hellen y Mati'
  const body = data.body || ''
  const url = data.url || '/personal/familia/'
  const tag = data.tag || 'familia-agenda'

  // Sound: never silent. Prefer platform default alert sound.
  // iOS: sound only for Home Screen PWA + granted permission; custom sound URLs
  // are unreliable on iOS Web Push — do not set `sound`.
  // Avoid requireInteraction (previously broke iOS showNotification).
  event.waitUntil(
    (async () => {
      const base = {
        body,
        icon: '/personal/familia/icons/pwa-192.png',
        badge: '/personal/familia/icons/pwa-192.png',
        data: { url },
        lang: 'es',
        tag,
        renotify: true,
        silent: false,
      }
      try {
        await self.registration.showNotification(title, {
          ...base,
          // Android may vibrate; iOS ignores unknown/unsupported fields safely.
          vibrate: [180, 80, 180],
        })
      } catch {
        try {
          await self.registration.showNotification(title, {
            body,
            data: { url },
            tag,
            silent: false,
          })
        } catch {
          await self.registration.showNotification(title, { body, data: { url }, tag })
        }
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/personal/familia/'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            try {
              await client.navigate(target)
            } catch {
              /* ignore */
            }
          }
          return
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target)
    })(),
  )
})

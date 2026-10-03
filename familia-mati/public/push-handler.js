/* Service worker push handlers — imported by Workbox generateSW.
 * Runs even when the PWA is closed (home-screen install required on iOS). */
/* eslint-disable no-undef */
self.addEventListener('push', (event) => {
  let data = {
    title: 'Familia Hellen y Mati',
    body: 'Tienes un aviso de la agenda.',
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

  const title = data.title || 'Familia Hellen y Mati'
  const body = data.body || ''
  const url = data.url || '/personal/familia/'
  const tag = data.tag || 'familia-agenda'

  // iOS Web Push is picky: prefer a minimal option set that always shows a banner.
  // (requireInteraction / exotic fields have caused silent showNotification failures.)
  event.waitUntil(
    (async () => {
      try {
        await self.registration.showNotification(title, {
          body,
          icon: '/personal/familia/icons/pwa-192.png',
          badge: '/personal/familia/icons/pwa-192.png',
          data: { url },
          lang: 'es',
          tag,
          renotify: true,
        })
      } catch {
        await self.registration.showNotification(title, {
          body,
          data: { url },
          tag,
        })
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

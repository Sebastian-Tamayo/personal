/* Service worker push handlers — imported by Workbox generateSW.
 * Runs even when the PWA is closed (home-screen install required on iOS). */
/* eslint-disable no-undef */
self.addEventListener('push', (event) => {
  let data = {
    title: 'Familia Hellen y Mati',
    body: 'Tienes un aviso de la agenda.',
    url: '/personal/familia/',
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

  event.waitUntil(
    self.registration.showNotification(data.title || 'Familia Hellen y Mati', {
      body: data.body || '',
      icon: '/personal/familia/icons/pwa-192.png',
      badge: '/personal/familia/icons/pwa-192.png',
      data: { url: data.url || '/personal/familia/' },
      lang: 'es',
      tag: data.tag || 'familia-agenda',
      renotify: true,
    }),
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

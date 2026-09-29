# Finanzas Mati (Vite + Firebase)

SPA de finanzas compartidas para Sebas y Lore.

**Repo:** https://github.com/Sebastian-Tamayo/personal  
**Ruta:** `finanzas-mati-web/`

- React + Vite + TypeScript
- Firebase Auth (email/contraseña) + Firestore (plan Spark)
- Zustand (caché local + actualizaciones optimistas)
- Tailwind CSS + Lucide React
- Interfaz en español, mobile-first

## Desarrollo rápido

```bash
cd finanzas-mati-web
cp .env.example .env
# Completa VITE_FIREBASE_* desde la consola de Firebase (no inventar keys)
npm install
npm run dev
```

Build de producción (estático en `dist/`):

```bash
npm run build
npm run preview
```

## Reglas de negocio

- Gastos compartidos por defecto: Internet 40, Luz 75, Comida 200, Gasolina 100, Matías 100, Alquiler 480
- **Ahorro individual (opcional):** por defecto 500 € c/u; se puede apagar o editar el monto por mes
- Aporte: `compartido ÷ 2` si el ahorro está apagado; `(compartido ÷ 2) + ahorro` si está activo
- Estado del mes: `Pagado` / `Pendiente`

## Archivos clave

- `.env.example` — plantilla (nunca commits `.env`)
- `firestore.rules` — solo autenticados
- `firebase.json` — apunta a las rules

Guía completa: Context/`docs/setup-finanzas-mati-vite-firebase.md`.

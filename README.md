# iberapp-games

Proyecto separado para desarrollar los minijuegos de la sección *Aprender jugando* de IberAPP (`Z:\IberAPP`) con Phaser 3. Es una mini app Next 16.3.6 con la misma raíz, versiones y configuración que la landing, para que el código se mueva **sin cambiar ni un import**.

## Qué hay

| Tipo | Qué | Destino |
| --- | --- | --- |
| **Se mueve a la landing** | `lib/games/`, `components/games/`, `lib/storage/game-progress.ts`, `public/games/` | Mismas rutas en la landing |
| **Espejo** | Copias de la landing (lista en [`MIRROR.md`](MIRROR.md)) | No se editan acá ni se mueven |
| **Andamio** | Todo lo demás: `app/page.tsx` y los bancos de prueba, `playwright.config.ts`, `package.json`, `next.config.ts` | Se descarta. De `package.json` solo pasa la dependencia `phaser` |

## Desarrollo

```bash
npm ci
npm run dev -- -p 3006   # 3006 para poder correr la landing en 3005 al mismo tiempo
npm run lint
npm run build
npm run test:e2e         # Playwright (tests/e2e)
```

Este proyecto usa una versión de Next.js con cambios incompatibles: ante cualquier duda, leé `node_modules/next/dist/docs/` (ver `AGENTS.md`).

# Espejos de la landing

Estos archivos son **copias byte a byte** de `Z:\IberAPP` en el commit `45ac53a` (rama `main`). Están acá para que el código de los juegos compile, se vea y se comporte igual que en la landing.

**Regla: no se editan acá.** Si alguno tiene que cambiar, se cambia en la landing y se vuelve a copiar. Nunca al revés. Tampoco se mueven a la landing al integrar: ya están ahí.

| Archivo | Para qué |
| --- | --- |
| `tsconfig.json` | Mismo compilador, `strict` y alias `@/*` |
| `eslint.config.mjs` | Mismas reglas de lint |
| `postcss.config.mjs` | Tailwind 4 por PostCSS |
| `.gitignore` | Mismos ignorados |
| `AGENTS.md` | Aviso de Next 16 para agentes |
| `CLAUDE.md` | Incluye `AGENTS.md` |
| `app/globals.css` | Tokens de diseño, tema y utilidades |
| `app/layout.tsx` | Fuentes (`next/font`), `ThemeScript` y metadatos |
| `app/favicon.ico` | Ícono |
| `components/theme/ThemeScript.tsx` | Aplica el tema guardado antes del primer pintado |
| `components/theme/ThemeToggle.tsx` | Botón de cambio de tema |
| `hooks/useTheme.ts` | Tema actual y cambio en vivo |
| `components/ui/Icon.tsx` | Íconos (lo importa `types/game.ts`) |
| `types/portal.ts` | `GameId`, `Portal` |
| `types/game.ts` | `Game` |
| `lib/data/games.ts` | `GAMES` |
| `lib/data/portals.ts` | `PORTALS`, `getPortal` |
| `lib/storage/local-store.ts` | Almacenamiento en `localStorage` |

Para verificar que siguen idénticos (desde la raíz de este proyecto, en Git Bash):

```bash
for f in $(sed -n 's/^| `\([^`]*\)`.*/\1/p' MIRROR.md); do
  [ "$(sha256sum < "$f")" = "$(sha256sum < "/z/IberAPP/$f")" ] && echo "OK   $f" || echo "DIFF $f"
done
```

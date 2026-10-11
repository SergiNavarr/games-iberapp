# Suite de conformidad (juez)

Solo la edita el juez. Verifica los criterios escritos del plan; no aprueba ni rechaza por nada que no esté en ellos.

## T2 · spike (S1–S10)

| ID | Dónde | Cómo se corre |
| --- | --- | --- |
| S1, S10 | `scripts/check-spike.mjs` | `node scripts/check-spike.mjs [--informe <ruta a informe/index.md>]` |
| S2 | comandos directos | `npm run lint` y `npm run build` (salida 0) |
| S3–S7 | `tests/conformance/spike/s3…s7-*.spec.ts` | proyecto `dev` (`next dev` en el puerto 3007) |
| S8 | `spike/s8-no-webgl.spec.ts` | proyecto `no-webgl` (Chromium con `--disable-webgl --disable-3d-apis`) |
| S9 | `spike/s9-initial-bundle.spec.ts` | proyecto `start` (`next start` en el puerto 3008, sobre el build de S2) |

```bash
npx playwright install chromium        # una vez
npm run lint && npm run build          # S2 (y el build que usa S9)
node scripts/check-spike.mjs           # S1 y S10
npx playwright test -c playwright.conformance.config.ts
```

- Antes de correr: ningún otro `next dev` vivo en este directorio (Next 16 bloquea `.next/dev`).
- Navegador: `channel: "chromium"` (headless nuevo, con GPU). El headless shell usa SwiftShader, que escribe solo advertencias `[.WebGL-…]` en la consola y haría fallar S5 por el entorno. Los tests `control de entorno` comprueban que el navegador no emite mensajes WebGL por sí solo, que sí detecta una fuga y que los flags de S8 apagan WebGL.
- Los pasos `[control]` validan el mecanismo de prueba, no el código: si fallan, el resultado no es un rechazo sino un problema de verificación.
- `@c09-c12-extra`: partes de C09–C12 que el resumen de S6 en el ticket no enumera (búsqueda `addKeys\(.*true`, Escape, rueda fuera del canvas, `touchAction`). **Cuentan para el veredicto** (confirmado por el coordinador el 11/10/2026: S6 = C09–C12 completos).
- S5 usa la redacción corregida el 11/10/2026: solo cuentan los mensajes de consola de tipo `warning` o `error` y los `pageerror` que contengan `WebGL` o `context lost`, sin distinguir mayúsculas. El banner de Phaser (`console.log`) no cuenta.
- Resultados en `tests/.results/conformance/` (ignorado por git).

## T3 + T4 · contrato, wrapper y dummy (checklist §2.6, ítems W)

Contra `/conformance/_dummy` (C31 contra `dark-sky` y `night-voices`), con la interfaz fija del ticket T3+T4 y sus "Precisiones de interfaz". También vuelve a correr la suite de T2 (regresión).

| ID | Dónde | Cómo se corre |
| --- | --- | --- |
| C01 | comandos directos | `npm run lint`, `npm run build` y después `npx tsc --noEmit` (salida 0) |
| C03(a), C04, C09(a), C13(a), C14(a), C15, C17(a), C20(a) | `contract/c00-static.spec.ts` | búsquedas literales de §2.6 sobre `lib/games/_dummy/` y `lib/games/shared/` (C20 a: solo `_dummy/`) |
| C02, C31 | `contract/c02-…`, `contract/c31-…` | proyecto `contract-start` (`next start`, 3008): buscan Phaser en el cuerpo de las respuestas JS |
| Resto de los W | `contract/c03…c32-*.spec.ts` | proyecto `contract-dev` (`next dev`, 3007) |

- Los módulos del codificador (`contract.ts`, `_dummy/meta.ts`, `game-progress.ts`) se cargan en tiempo de ejecución con `require` por ruta (Playwright los transpila y resuelve `@/`). No hay imports estáticos: si cambia un export, no se rompe el `tsc` ni el build (C01).
- **C06/S4:** cada caso en frío y con el módulo precargado (`raw.importOnly()`). "Ningún callback después de `destroy()`" se mide desde el último `destroyed` posterior a la llamada. Los callbacks son `ready`, `progress`, `announce`, `complete` y `error`.
- **C08b/C08c:** la ventana de 1 s arranca 250 ms después del disparo. Las capturas del canvas se toman por CDP (`captureBeyondViewport`), así que funcionan con el escenario fuera del viewport sin hacer scroll. Ojo: esa captura puede agrandar el viewport un instante. Mi prueba con un IntersectionObserver suelto no lo detectó, pero el codificador lo midió en el wrapper (T3+T4); por eso el wrapper ignora cambios de visibilidad de menos de 150 ms. Antes de cada pausa, un `[control]` comprueba que sin pausa el canvas se mueve. La pestaña oculta se simula redefiniendo `document.visibilityState`/`hidden` y despachando `visibilitychange`.
- **C21, C23, C23b:** los assets "presentes" son WebP reales generados con el encoder del navegador, con las medidas exactas del manifiesto, servidos con `route.fulfill`. Las texturas se leen con `debugTextures()`: `source` es `file` si el asset está presente, `placeholder` si falta y `scaled` si tiene otras medidas.
- **C30:** (a) una entrada sembrada con menos aciertos queda reemplazada; (b) en un empate gana el último; (c) `pickBest` en Node conserva un resultado mejor ya guardado (el dummy no puede terminar con menos aciertos).
- **Validación de la suite (11/10/2026):** contra un doble de la interfaz fija (fuera del repo), la versión correcta pasa los 65 tests de `contract/`. De 32 defectos inyectados se detectan 31. El que no se detecta es "destroy no quita el canvas": C08 no lo ve porque desmontar el `GameStage` se lleva el escenario, pero lo detecta C05 por el camino `raw`.

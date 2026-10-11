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

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
### E1 · enmienda del contrato (recorrido y revisión)

La suite W corre **una vez por variante** del dummy, con la opción de proyecto `variant` (`contract/variants.ts`): `contract-dev`/`contract-start` con `_dummy` (sin recorrido) y `contract-run-dev`/`contract-run-start` con `_dummy-run` (recorrido + revisión). Cada spec omite (`skip`) lo que no aplica a su variante. Por eso aparecen omitidos en el reporte:

| Corre una sola vez, en el proyecto de `_dummy` | Solo `_dummy` | Solo `_dummy-run` |
| --- | --- | --- |
| `c00-static` (las búsquedas cubren `_dummy`, `_dummy-run` y `shared/`), C08 (alterna las dos variantes con `setGameId`), C30(c) (`pickBest` en Node), C31 | C26 por acierto y "después ningún input" por el camino `raw`, C28 marcador por acierto | C26 por fase, C28 selector de dificultad, marcadores de recorrido y revisión, texto con `total` 0, C12 (el jugador no se mueve), C24, C25, C33–C36 |

- `_dummy-run` a ×10 cuando solo importa llegar al final; a ×1 cuando se juega el recorrido con el bot (`steerRun`: teclado, mouse o toque hacia el próximo objeto de `debugRun().items`, con las posiciones de `debugTargets()`). C24/C25 a ×1, como se acordó.
- Respuestas correctas de la revisión: `debugRun().items[].answer`, capturadas mientras se juega y mapeadas por `review-item[data-item-id]`.
- C34 y C36 corren por el camino `raw`, cuyo handle sigue vivo después de `run-end`.
- `JUDGE_MODULES_ROOT` cambia de dónde se leen `meta`, manifiestos, `contract.ts` y `game-progress.ts`. Sirve solo para validar la suite contra un doble; el veredicto siempre usa el repo.
- **Validación (11/10/2026):** contra un doble con las dos variantes (fuera del repo), la versión correcta pasa todo en las dos. Los 18 defectos inyectados del camino nuevo se detectan, cada uno en su criterio. Lo que corregí en mis tests por esa validación: el bot de puntero centra el canvas antes de dirigir, y C12 desliza lejos del jugador para que un gesto vertical tomado como dirección se note.

- **Validación de la suite (11/10/2026):** contra un doble de la interfaz fija (fuera del repo), la versión correcta pasa los 65 tests de `contract/`. De 32 defectos inyectados se detectan 31. El que no se detecta es "destroy no quita el canvas": C08 no lo ve porque desmontar el `GameStage` se lleva el escenario, pero lo detecta C05 por el camino `raw`.

## G1 · clean-channels (checklist §2.6, ítems J, con E1)

La suite corre también con la variante `clean-channels` (proyectos `contract-cc-dev` y `contract-cc-start`), además de la regresión completa (T2, `_dummy` y `_dummy-run`). Las propiedades de cada juego están en `contract/variants.ts`: escala del bot (×3, acordada), `hasBuildRun`, si tiene efecto ambiental y los anchos de C19 (1280 y 390 px).

| ID | Dónde | Cómo se corre |
| --- | --- | --- |
| C22 | `scripts/check-assets.mjs` | `node scripts/check-assets.mjs clean-channels`: compara el manifiesto con el bloque ```json aprobado del artefacto G1 y lee formato y medidas de cada archivo de `public/games/clean-channels/` desde su cabecera (WebP VP8/VP8L/VP8X, PNG) |
| C37 | `contract/c37-c39-game.spec.ts` | `buildRun` en Node: 200 semillas × 3 dificultades × 2 diseños. Composición de la tabla de la especificación, N2 con 0,7 y 0,6 s, y todo objeto con `arriveAt − visibleMs ≥ 0` y `arriveAt ≤ durationMs` |
| C38 | ídem | `debugRun().items` = `buildRun()` (`id`, `kind`, `type`, `x`, `arriveAt`, `answer`), semillas 1, 7 y 42, a 1280 px (`landscape`) y 390 px (`portrait`) |
| C39 | ídem | (a) las 3 dificultades, todo recolectado y bien clasificado: el máximo se calcula desde `buildRun` con los puntos de la especificación y tiene que dar 165 / 195 / 250; (b) todo mal; (c) nada recolectado, con la semilla elegida en Node y `ArrowLeft` sostenida |

- **C36:** con `buildRun`, el test busca en Node (semillas 1–1000; dificultades `fast`, `normal`, `calm`) dos obstáculos que llegan a menos de 500 ms, dentro del rango del kayak y a menos de `pickupHalfWidth` entre sí. El bot estaciona el kayak en el punto medio (camino `raw`, ×3) y choca los dos sin moverse. Si no hay ninguna semilla, el test falla con "escalar": lo acordado es no cambiar la redacción por cuenta propia.
- **C20(b):** clean-channels no tiene efecto ambiental. Como acordamos, el `[control]` provoca un choque: el bot dirige hacia un obstáculo, suelta las teclas y muestrea `debugMotion()` alrededor del choque. Con `reducedMotion`, el mismo choque tiene que dar 0 activos.
- **C28 y C39(c), `total` 0:** `result-score` no se muestra (decisión del usuario en G1, vale para todos los juegos), y `result-title` y `result-empty` muestran `meta.emptyResult`.
- **C34:** a ×1 mide `calm` y `fast` (75 y 60 s), compara el cronograma de ×10 con el de ×1 en `calm`, y corre la dificultad más corta sin `testHooks`. Timeout de 8 min.
- **Validación (12/10/2026):** contra un doble de clean-channels con un `buildRun` propio compartido entre Node y navegador, la versión correcta pasa. Por esa validación corregí dos cosas en mis tests: el plan de C36 (el bot ahora estaciona el kayak en vez de perseguir dos obstáculos a menos de 500 ms) y el lector de cabeceras VP8L de `check-assets.mjs`.

## E2 · enmienda aditiva del wrapper (`_dummy-scene`)

E2 se juzga con dos partes. Las dos se corren en cada corrida del veredicto, y además C01:

1. **C43 (aditividad) y regresión:** la suite de `166332f` congelada, sin tocar un byte, corrida contra el árbol de E2.
2. **Suite E2:** la variante `_dummy-scene`, más las búsquedas estáticas y las pruebas de Node.

| Parte | Comando |
| --- | --- |
| (1) C43 | `node scripts/check-c43.mjs` |
| (2) E2 | `npx playwright test -c playwright.conformance.config.ts --project contract-scene-dev --project contract-scene-start` |

Qué hace `check-c43.mjs`:

- extrae con `git archive` `tests/conformance`, la config y `scripts/` de `166332f` a una carpeta temporal fuera del repo;
- corre `check-spike.mjs` y `check-assets.mjs clean-channels` congelados;
- corre todos los proyectos de la config congelada, con el repo como directorio de trabajo.

En la suite E2:

- La variante nueva vive en `contract/variants.ts` (`scene: true`, `stillWithoutInput: true`, C19 a 1280 y 390 px).
- Las pruebas que cubren todos los juegos de una vez corren desde su proyecto (`ONCE_VARIANT`): búsquedas estáticas sobre las cuatro carpetas y `shared/`, C08 alternando los cuatro juegos, C30(c) y C31.
- Los helpers de la escena están en `contract/support.ts`: `debugScene`, `moveCrosshair`, `markZone`, `playScene` y `loadSceneData`. `finishGame` marca todas las señales y contesta la revisión.

| ID | Dónde | Cómo se verifica (lecturas acordadas con el coordinador) |
| --- | --- | --- |
| C08b, C08c | `contract/c08b-pause.spec.ts` | Con `meta.stillWithoutInput`, el `[control]` es una flecha que cambia el canvas. En la ventana quieta: otra flecha, ≤ 2 rAF, capturas idénticas y `debugMotion().created` sin cambios. Al reanudar: > 30 rAF y una flecha **nueva** cambia el canvas (no se exige procesar la que quedó en cola). Lo mismo en C08c (a) y (b) |
| C20(b) | `contract/c19-c20-theme-motion.spec.ts` | El `[control]` es marcar un señuelo. El muestreo de `debugMotion()` corre dentro de la página cada ~10 ms y arranca antes de Enter. La ventana es 1 s desde el evento `counter` de la marca. Sin `reducedMotion`: `created` + 1 y alguna muestra activa. Con `reducedMotion`: todas las muestras en 0 |
| C24, C25, C33, C35 | `contract/c24-c35-scene.spec.ts` | Teclado: la mira con flechas sueltas, leyendo `debugScene().crosshair`, y Enter. Mouse y toque: sobre los `debugTargets()` de las señales. En los dos, la revisión con el mismo medio y `result` = `scoreOf(señales)`. C33: 0 canvas en `review` y `result`. C35: `debugScene().difficulty` y `marksLeft` = `MARKS[d]` |
| C26 | `contract/c26-c32-contract.spec.ts` | Partida parcial que gasta las marcas de `calm` alternando señuelos y señales. El oráculo es el `kind` de `data.ts`. Señal: 1 `progress` (+1) y ≥ 1 `announce`. Señuelo: 0 y ≥ 1. Revisión: 0 `progress` y ≥ 1 `announce`, en dos partidas (respuesta acertada y errada). `complete` 1 vez, igual a `{ completed: true, total, ...scoreOf(marcadas) }` en las dos |
| C28 | ídem | Ver la lista de abajo |
| genérico | `contract/c00-static.spec.ts` | `rg -i "water-signs"` en `components/games/GameStage.tsx` y `lib/games/shared/` → 0 |

C28 en la suite E2:

- **Marcador:** `hits / total` después de cada acierto del canvas, y se conserva en la revisión, también después de contestar bien.
- **Panel:** `text-panel` visible, con el texto del último `announce` (con trim), en `playing` y en `review`.
- **Contador:** `counter` contiene `valor / máximo`, con `counterLabel` en su línea.
- **Resultado vacío:** con `emptyResult.when: "hits"` (`fast` + 3 señuelos), título y texto de `meta`, sin `result-score`. Sin la condición, `result-score` con el score y sin `result-empty`.
- **El panel no tapa el escenario:** su rectángulo no se cruza con el de `stage`, a 1280 y a 390 px.

**Validación (12–13/10/2026):** contra un doble de `_dummy-scene` (fuera del repo):

- La versión correcta pasa los 79 tests que aplican.
- Los 21 defectos inyectados se detectan todos, cada uno con su test:
  - teclas que redibujan en pausa;
  - efectos creados en pausa;
  - flecha muerta al reanudar;
  - `reducedMotion` ignorado y transición ausente;
  - `progress` en señuelos;
  - señal sin `announce` y revisión sin `announce`;
  - `hits` derivados de la revisión;
  - marcador reiniciado en la revisión;
  - panel con el primer texto y panel congelado en la revisión;
  - contador congelado e invertido;
  - condición de vacío ignorada y `result-score` con la condición cumplida;
  - panel encima del escenario;
  - Enter muerto y toque muerto;
  - dificultad ignorada;
  - canvas que sobrevive a la revisión.

## G2 · water-signs (checklist §2.6, ítems J, con E1 y E2)

La suite corre con la variante `water-signs` (proyectos `contract-water-dev` y `contract-water-start`). Es un juego de escena como `_dummy-scene` y corren los mismos criterios.

En `contract/variants.ts`:

- `sceneModule: "hotspots.ts"`: el cargador traduce `distractor` → `decoy`, toma los puntos de `POINTS` y la `QUESTION` de `meta.ts`.
- `sceneFullDifficulty: "fast"`: C24 y C25 se juegan en Atento, con 8 marcas exactas.
- `sceneEmptyInBrowser: false`: el resultado vacío por `hits` no se puede producir como partida y se verifica en Node.

| ID | Dónde | Cómo se verifica (lecturas acordadas con el coordinador) |
| --- | --- | --- |
| C22 | `scripts/check-assets.mjs` | `node scripts/check-assets.mjs water-signs`, contra el bloque aprobado del artefacto G2 |
| C40 | `contract/c40-c42-water.spec.ts` (Node) | 15 zonas sin repetir. Los ids y los `kind` coinciden con las tablas de la especificación. El círculo entero queda dentro de 720 × 900. `r ≥ 48`. Entre los bordes de cada par de zonas, ≥ 16 |
| C41 | ídem | Node: `POINTS` de cada señal = tabla de la especificación; `scoreOf` de las 8 señales = 8 y 185; `scoreOf` de los distractores (los 7 juntos y cada uno solo) = 0 y 0. Navegador: en `calm`, `normal` y `fast`, las 8 señales con mouse dan `{ completed: true, hits: 8, total: 8, score: 185 }` |
| C42 | ídem | Ver la lista de abajo |
| C28 (vacío) | `contract/c26-c32-contract.spec.ts` (Node) | `meta.emptyResult.when === "hits"` |

C42 en detalle:

- **Medios:** teclado con Enter y con Espacio, mouse y toque, sobre dos puntos de agua vacía: uno lejos de toda zona y otro justo afuera de una.
- **Qué se exige:** después de cada input, 500 ms sin eventos de callback y con las mismas marcas.
- **`[control]`:** el mismo medio sí marca un distractor.
- **Agregados acordados:**
  - otra vez sobre el elemento ya marcado: nada;
  - un deslizamiento vertical que empieza sobre una zona, a 390 px, scrollea la página y no marca.

**Coordenadas provisorias:** C40, C24, C25, C41 en el navegador, C42 y C20(b) se vuelven a correr como mini-veredicto cuando se carguen las coordenadas reales.

**Regresión:** mi suite completa sobre todos los proyectos (T2, `_dummy`, `_dummy-run`, clean-channels con su arte real, `_dummy-scene` y `water-signs`), más `check-spike.mjs` y `check-assets.mjs` de clean-channels y de water-signs.

**Validación (13/10/2026):** contra un doble de water-signs (fuera del repo):

- La versión correcta pasa los 73 tests que aplican.
- Los 15 defectos inyectados se detectan todos, cada uno con su test:
  - zonas superpuestas, fuera de los límites, con `r < 48` o con un id distinto;
  - puntos mal repartidos con la misma suma;
  - `scoreOf` que cuenta distractores;
  - `when: "total"`;
  - puntaje mal en Atento;
  - agua vacía que anuncia o que gasta una marca;
  - radio de detección más grande;
  - elemento ya marcado que vuelve a anunciar;
  - marcar al apoyar en vez de al soltar;
  - Enter muerto;
  - dificultad ignorada.

## G1b · cambios sobre clean-channels

**Paso 1** (assets nuevos, remada y renombre), con lo acordado con el coordinador:

- **C22:** compara contra el bloque de 14 entradas del artefacto de G1 (se suma `kayak-paddle`). Un archivo ausente es advertencia; los reemplazos se validan por cabecera.
- **C20(b):** el `[control]` de clean-channels pasa al efecto ambiental de la pala (`variants.ts`: `ambientMotion: true`). Ya no usa el choque: C36 cubre las sacudidas y los destellos con `reducedMotion`.
- **Renombre, en Node:** `WASTE.batteries.name` de `meta.ts` es "Pilas" (`contract/c37-c39-game.spec.ts`).
- **Alcance de la corrida única:**
  - si el diff toca solo `lib/games/clean-channels/` y `public/games/clean-channels/`: los criterios de clean-channels, C22, las búsquedas estáticas y C01;
  - si toca configuración, `package.json`, el lockfile, `.gitignore` o `scripts/`: la suite completa.
- **Validación (14/10/2026):** contra el doble de clean-channels, la versión correcta pasa. Los tres defectos inyectados se detectan: sin efecto ambiental, pala que se mueve con `reducedMotion` y nombre viejo.

**Paso 2** (clasificación agrupada y E3a: `onAnswer` con `count`), con lo acordado con el coordinador. Toca el wrapper, así que corre la suite completa de todos los juegos.

- **C26 por grupo** (`contract/c26-c32-contract.spec.ts`):
  - `answer.count` = `data-count`; un acierto da 1 `progress` con `hits + n` y un error, 0.
  - `data-item-ids` = los ítems recolectados de ese tipo, según `debugRun()` en el instante de `run-end`. Ese instante lo captura `hookRunEndSnapshot` cuando el wrapper registra `run-end`, antes de destruir el canvas.
  - La suma de los `data-count` = las unidades recolectadas.
  - `result` = `{ completed: true, total, hits: Σ n acertados, score: Σ puntos(tipo) × n }`, con la tabla de `contract/spec-clean-channels.ts`.
  - En `_dummy-run`, el payload de `answer` tiene exactamente `hit`, `hits` y `total`.
- **C38** (`contract/c37-c39-game.spec.ts`):
  - en Node, `buildRun` sin `groupOrder` es igual al de `8af40ef` (lo carga `loadFrozenBuildRun` con `git archive`) en las 200 semillas × 3 × 2;
  - `groupOrder` es una permutación de los 7 tipos, con ≥ 2 órdenes distintos;
  - en el navegador, paridad de `groupOrder` y el orden de la revisión = `groupOrder` filtrado a los tipos recolectados.
- **Helpers:** `captureAnswers` mapea también tipo → contenedor, y `answerReview` registra `data-count` y `data-item-ids`.
- **C39:** sin cambios; se re-verifica explícitamente.
- **Validación (14/10/2026):** contra el doble con revisión agrupada, la versión correcta pasa los 100 tests de clean-channels y el C26 de `_dummy-run`. Los 9 defectos inyectados se detectan todos:
  - cronograma cambiado;
  - orden de grupos fijo;
  - orden sin un tipo;
  - revisión en otro orden;
  - `progress` + 1 en lugar de + n;
  - `answer` sin `count`;
  - `data-item-ids` incompletos;
  - puntaje por grupo en lugar de por unidad;
  - `count` en el `answer` de `_dummy-run`.

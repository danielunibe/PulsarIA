# Pulsaria — Lineamiento de diseño funcional

> Subordinado a `PROJECT_TRUTH.md` y a `design-qa.md` (verdad visual por
> referencia). Este archivo fija el lenguaje conceptual para que ningún
> cambio —humano o de IA— invente superficies, paletas o jerarquías nuevas.

## 1. Principios

1. **Densidad compacta primero.** La ventana mínima es 860×640. Todo estado
   común debe encajar sin scroll; el scroll es último recurso, nunca el
   layout por defecto.
2. **Una sola superficie de scroll por sección.** El `main` es la única
   superficie con scroll. Ningún contenedor interior crea su propio scroll
   salvo listas designadas (cola, actividad, rejilla) con `min-h-0` y
   `overscroll-behavior: contain`.
3. **Sin bloques secundarios apilados.** Una tarjeta única por superficie,
   CTA a ancho completo, copy auxiliar fuera de la superficie principal
   (`design-qa.md` P2).
4. **Estados honestos.** Vacío, cargando, error y deshabilitado son estados
   explícitos con datos reales. Prohibido rellenar con demos, métricas
   ficticias o textos inventados.
5. **Sin segundos pipelines.** Reutilizar búsqueda, filtros, iconos
   (`components/icon-library.tsx`) y tokens existentes antes de crear algo.

## 2. Tokens (única fuente: `app/globals.css`)

- Superficies: `rgba(255,255,255,0.02–0.07)`, bordes `rgba(255,255,255,0.06–0.12)`.
- Radios: tarjeta 20px, panel 16–22px, control 9–14px, píldora 13px/full.
- Acentos: turquesa `#25f4ee`, frambuesa `#fe2c55`, miel/ámbar, verde.
  Cinema/marca: degradado `fe2c55 → 25f4ee`.
- Tipografía: sistema + mono para contadores/códigos; tracking amplio
  solo en eyebrows (≤11px, uppercase).
- Sombras: `0 12px 32px rgba(0,0,0,0.28–0.5)` + `inset 0 1px 0
  rgba(255,255,255,0.06–0.12)`. Sin sombras de colores salvo glow de
  acento puntual.
- Tema default: `chromatic` (Tema Pulsaria).

## 3. Ritmo y espaciado (escala compacta)

| Uso | Valor |
|---|---|
| Padding de sección | `16–20px` (nunca `32px`) |
| Gap entre tarjetas | `16–20px` (nunca `32px`) |
| Gap en panel lateral | `12px`, padding `10px` |
| Cierre inferior de rejilla | `48px` (nunca `160px`) |
| Altura header ventana | `54px` |
| Controles header | `34×34`, radio `9px` |

## 4. Reglas de layout

- Frame: `h-screen overflow-hidden rounded-[22px]`; `main` con
  `flex-1 min-h-0 overflow-y-auto`.
- `.pulsaria-workspace` siempre `overflow: hidden`; cada columna con
  `min-h-0 min-w-0`.
- Rejilla de biblioteca: `minmax(180px, 1fr)`, `justify-content: center`,
  sin `min-height: max-content` que empuje la página.
- Settings/magazines: contenedor `max-w-5xl mx-auto`, padding compacto.
- Ventana completa (Cinema, video TikTok): `fixed inset-0`, radio `0` en
  fullscreen del sistema, `22px` en ventana.

## 5. Prohibido

- Nuevas familias tipográficas, paletas o radios fuera de escala.
- Duplicar la cápsula de marca (la identidad vive en sidebar + píldora).
- Capas sobre el frame de video, degradados de interacción flotantes.
- Controles que desplacen el centro (la píldora TIKTOKS manda).
- `!important` para ganar especificidad; `z-index` nuevos sobre `1000`
  salvo overlays modales existentes.

# Investigación de iconos de TikTok para Pulsaria

Fecha: 2026-09-19  
Estado: paquete seleccionado e incorporado al sistema React; quedan SVG inline heredados para una segunda limpieza específica.

## Conclusión ejecutiva

Es posible identificar el lenguaje funcional que TikTok utiliza actualmente en sus superficies de vídeo, pero no se localizó un paquete público oficial con todos los SVG o fuentes internas de iconos de la aplicación. TikTok sí ofrece recursos y pautas oficiales de marca, principalmente para el logotipo y productos de integración, no un kit completo de iconografía interna.

La sustitución de Pulsaria debe hacerse por función y contexto, no cambiando ciegamente cada icono por una copia. La superficie que más puede acercarse de forma legítima es la tarjeta/reproductor de vídeo: perfil, me gusta, comentarios, guardar/favoritos, compartir, reproducción, sonido, más opciones y música/audio. Los iconos técnicos de configuración, base de datos, modelos, logs y diagnóstico no forman parte del lenguaje de interacción principal de TikTok y deberían conservar una variante técnica coherente.

## Hallazgos en la interfaz actual de Pulsaria

La interfaz está mezclando tres fuentes de iconografía:

| Fuente actual | Evidencia | Uso observado |
|---|---|---|
| Font Awesome 6 vía `react-icons/fa6` | imports en `app/page.tsx` y múltiples componentes | navegación, vídeo, acciones, configuración, estado y modales |
| Lucide | `components/ToastNotification.tsx` importa `Loader2` | estado de carga |
| SVG inline / trazados propios | `components/AddLinks.tsx` y `components/CinemaMode.tsx` | ingestión, controles de Cinema, reproducción, sonido y acciones |

Dependencias declaradas que afectan el futuro sistema: `react-icons`, `lucide-react` y `@tabler/icons-react` en `package.json`. En el código revisado, la presencia efectiva dominante es Font Awesome 6 más SVG inline; Tabler no apareció como fuente efectiva en el inventario inicial.

### Inventario funcional encontrado

| Área | Iconos o familias actuales | Relación con TikTok |
|---|---|---|
| Tarjeta y overlay de vídeo | `FaHeart`, `FaCommentDots`, `FaBookmark`, `FaShare`, `FaPlay` | equivalencia directa con acciones sociales del vídeo |
| Perfil/autor | SVG y elementos de autor en `VideoCard`/`VideoCardOverlay` | equivalente al avatar/perfil del creador |
| Vídeo y audio | `FaVideo`, `FaMusic`, `FaVolumeHigh`, `FaVolumeXmark`, `FaPause`, `FaPlay` | equivalencia funcional con reproducción y pista de audio |
| Búsqueda y filtros | `FaMagnifyingGlass`, `FaFilter`, `FaSliders`, ordenamiento y vista | TikTok usa búsqueda/filtros, pero no necesariamente la misma presentación de escritorio |
| Navegación Pulsaria | `FaLayerGroup`, `FaFolder`, `FaGear` en `Sidebar.tsx` | no es una copia directa de la navegación móvil de TikTok; representa Biblioteca/Playlists/Configuración |
| Ingestión/procesamiento | vídeo, música, subtítulos, descarga, base de datos, ondas | lenguaje propio del producto; no debe confundirse con iconografía social |
| Configuración y diagnóstico | terminal, servidor, cerebro, microchip, métricas, advertencia, base de datos | técnico/operativo; TikTok no es una referencia suficiente para estas funciones |
| Cinema | SVG inline para corazón, comentarios, compartir, guardar, navegación, volumen y menú | zona prioritaria para unificar con el lenguaje de acciones de vídeo |

## Iconos de TikTok identificables

### Superficie de vídeo

El patrón más consistente que se observa en capturas y documentación de uso es una columna lateral de acciones:

1. avatar o perfil del creador;
2. corazón para “me gusta”;
3. comentario;
4. guardar/favorito, según la superficie;
5. compartir;
6. menú de más opciones;
7. pista de audio o acceso al sonido.

La forma visual es compacta, de alto contraste y normalmente blanca sobre vídeo; el estado activo se comunica con relleno/color y un contador debajo. El icono de compartir es una flecha curva o flecha de salida según versión/superficie; no conviene asumir que una única variante representa todas las versiones de TikTok.

### Navegación principal

Las capturas actuales consultadas muestran una barra inferior de cinco posiciones, con variación regional o de cuenta: Inicio, Shop/Friends/Discover, botón central de crear “+”, Inbox y Perfil. El botón central de creación es el elemento cromáticamente distintivo, con tratamiento cian/rosa alrededor de un núcleo claro u oscuro.

Esto no debe trasladarse literalmente a la barra lateral de Pulsaria: el producto es una aplicación de escritorio local-first, y sus destinos reales son Biblioteca, Cola, Playlists, Cinema y Configuración.

### Marca frente a iconografía funcional

El símbolo de nota musical y el logotipo de TikTok son activos de marca, no iconos genéricos de acción. Pueden usarse como referencia o identificador de contenido autorizado, pero no deben emplearse para dar la impresión de que Pulsaria es un producto oficial de TikTok.

## Matriz de sustitución recomendada

| Pulsaria | Referencia funcional TikTok | Decisión para implementación |
|---|---|---|
| `FaHeart` | Me gusta | Sí: crear un único componente social con estado outline/filled |
| `FaCommentDots` | Comentarios | Sí: unificar grosor, tamaño y contador |
| `FaBookmark` | Guardar/Favoritos | Sí: mantener semántica y estado activo |
| `FaShare` / `FaShareNodes` | Compartir | Sí: elegir una sola geometría para tarjetas y Cinema |
| `FaPlay` / SVG play | Reproducir | Sí: usar una sola geometría con botón/overlay coherente |
| `FaVolumeHigh` / `FaVolumeXmark` | Sonido/mute | Sí: unificar en controles de vídeo |
| SVG de menú de tres puntos | Más opciones | Sí: componente común |
| `FaMagnifyingGlass` | Búsqueda | Sí, como patrón funcional; no requiere copiar un asset de TikTok |
| avatar/autor | Perfil | Sí: mantener como componente de autor, con estados Pulsaria |
| `FaLayerGroup` | Inicio/Biblioteca | No copiar literalmente; diseñar una metáfora propia para Biblioteca |
| `FaFolder` | Colecciones/Playlists | Mantener como metáfora de playlist; no es una acción social de TikTok |
| `FaGear` | Configuración | Mantener como control técnico estándar |
| terminal, servidor, microchip, base de datos | no equivalentes en el feed TikTok | Mantener dentro de un sistema técnico separado |

## Riesgo de “exactamente igual”

No se encontró una descarga oficial de la librería interna de iconos de TikTok. Las páginas oficiales localizadas describen productos para desarrolladores y pautas de marca, mientras que las capturas de terceros sirven para observar el comportamiento y la semántica, no para acreditar una licencia de reutilización de cada gráfico.

Por tanto, el camino seguro es:

- reproducir la semántica, jerarquía, estados y proporciones del patrón de vídeo;
- usar iconos con licencia compatible (por ejemplo, una sola librería open source ya declarada) o SVG propios inspirados en formas genéricas;
- reservar el logotipo, la nota musical de marca y los recursos oficiales de TikTok para casos expresamente permitidos;
- no vender Pulsaria como producto oficial ni hacer pasar assets de terceros por assets oficiales.

## Siguiente fase propuesta

La siguiente fase puede implementar primero un sistema unificado para las acciones sociales del vídeo y Cinema: `LikeIcon`, `CommentIcon`, `SaveIcon`, `ShareIcon`, `PlayIcon`, `SoundIcon` y `MoreIcon`, con estados activo/inactivo y tamaños compartidos. Después se auditarían los iconos técnicos y de navegación para decidir cuáles conservar, cuáles migrar y cuáles redibujar. Esta fase debe empezar desde el árbol sucio actual y preservar todos los cambios existentes.

## Incorporación realizada

Se eligió `@tabler/icons-react` como fuente única para los iconos React de la interfaz. Tabler publica más de 6.000 iconos en una cuadrícula 24×24, con licencia MIT y componentes oficiales para React.

Cambios aplicados:

- Se creó `components/icon-library.tsx` como punto único de importación.
- Las importaciones de Font Awesome en `app/` y `components/` fueron redirigidas al módulo común.
- Las importaciones directas de Lucide fueron eliminadas; el indicador de carga también se sirve desde Tabler.
- `react-icons` y `lucide-react` se retiraron de `package.json` y `package-lock.json`.
- Se conservaron alias semánticos como `FaHeart`, `FaCommentDots`, `FaBookmark` y `FaShare` para no alterar la lógica de los componentes durante la migración.

Límite conocido: `components/AddLinks.tsx` y la superficie HTML embebida de `components/CinemaMode.tsx` todavía contienen SVG inline heredados. No son imports de una segunda librería, pero sí deben convertirse a componentes Tabler en una pasada posterior para que literalmente cada glifo visible provenga de la misma fuente.

## Fuentes consultadas

- [TikTok Brand Hub](https://www.tiktokbrandhub.com/) — referencia oficial de marca; no se localizó allí un kit público completo de iconos internos de producto.
- [TikTok for Developers](https://developers.tiktok.com/) — productos oficiales y activos de integración; distingue Share Kit, Login Kit, Content Posting API y Embed Videos.
- [KOL.ID: TikTok bottom navigation reference](https://kol.id/blog/daftar-tiktok-affiliate-dan-tipsnya-untuk-pemula) — captura reciente de navegación inferior y variantes de cuenta/región.
- [Bibin: TikTok video actions reference](https://bibin.jp/blog/tiktok-movie-download) — capturas y descripción de compartir, más opciones, guardar y descarga.
- [WIRED: A Beginner's Guide to TikTok](https://www.wired.com/story/how-to-use-tik-tok) — descripción histórica del patrón de avatar, corazón, comentarios y compartir; se usa como apoyo semántico, no como especificación visual actual.

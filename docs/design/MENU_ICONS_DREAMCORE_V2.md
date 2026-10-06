# Propuesta de iconos del menú — Dreamcore espacial

## Dirección visual

Usar pequeños objetos celestes de aspecto perlado, con centros índigo,
lavanda suave y acentos fríos puntuales. Las formas deben sentirse suspendidas
y ligeramente oníricas, pero conservar una silueta sencilla y reconocible al
tamaño real del rail. El fondo queda transparente: no se hornean placas ni
fondos dentro de los iconos.

La referencia elegida evita las estrellas repetidas, las nebulosas llenas y el
resplandor ancho. Los destellos quedan en detalles pequeños; el espacio vacío
forma parte del diseño para que la barra conserve calma.

## Mapa de símbolos

| Acceso | Símbolo |
| --- | --- |
| Buscar | Lente con una estrella |
| Inicio | Observatorio con una puerta iluminada |
| Perfiles | Dos estrellas orbitando |
| Actividad | Cometa con una estela breve |
| Listas | Archivo lunar en capas |
| Revistas | Libro astral abierto |
| Ajustes | Mecanismo orbital |
| Cine | Eclipse con fragmentos de película |

## Integración

Los ocho PNG transparentes están en `public/icons/menu/dreamcore-v2/`. La
barra los usa con su etiqueta accesible y conserva navegación, contador de
actividad, estado seleccionado, búsqueda y disponibilidad del acceso de cine.
El arte sigue siendo decorativo (`alt=""`, `aria-hidden="true"`), así que los
nombres de las acciones continúan viniendo de las etiquetas traducidas.

La previsualización está en
[`menu-icons-dreamcore-v2-preview.png`](menu-icons-dreamcore-v2-preview.png).
Los recursos anteriores se conservan como referencia; no se sobrescribieron.

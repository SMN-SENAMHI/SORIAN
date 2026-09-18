# SORIAN

**Sistema Operacional de Resolución Integrada para la Predicción del Clima**

Plataforma de visualización climática de la Subdirección de Cambio Climático y Modelamiento Atmosférico
del Servicio Nacional de Meteorología e Hidrología del Perú
(SENAMHI). Integra pronóstico estacional multimodelo y monitoreo ENSO para el
Perú y Sudamérica.

## Contenido

| Sección | Descripción |
|---|---|
| Estacional | Anomalías mensuales de precipitación y temperatura. 3 modelos × 3 variables × 6 meses, con comparación de cortina entre dos pronósticos. |
| ENSO | Predicción multimodelo de la anomalía de TSM en las regiones Niño 1+2 y 3.4: 20 modelos globales, promedio multimodelo y serie observada, en percentiles o boxplot. |
| Descripción | Modelos integrados, configuración WRF y referencias científicas. |
| Consultas | Formulario de sugerencias y observaciones. |

## Arquitectura

Sitio estático sin proceso de compilación: módulos ES nativos servidos
directamente. Los datos viven separados del código de presentación.

```
index.html              shell + metadatos + PWA
src/
  main.js               registro de vistas y arranque
  router.js             enrutado por hash, admite parámetros
  config.js             modelos, variables y parámetros del mapa
  data.js               carga con caché y decodificación de grillas
  views/                una vista por sección
  map/
    viewer.js           visor de mapa: capas, leyenda y línea de tiempo
    grid-layer.js       capa canvas para la grilla regular
    swipe.js            cortina de comparación entre dos capas
    interpolate.js      reconstrucción continua del campo
    legend.js           escala de color y lectura del punto en palabras
    analysis.js         reparto del dominio por clase de anomalía
  charts/
    plotly.js           carga diferida y adaptación responsive
    regions.js          reparto de la figura ENSO en regiones Niño
    series.js           selección de series del gráfico
  ui/                   nav, selectores, pictogramas, hoja y helpers de DOM
    preview.js          campo del pronóstico animado en la portada
    plume.js            serie del ENSO animada en la portada, dibujada sin Plotly
  styles/               base, layout, componentes, visor
data/
  grids/                9 grillas de pronóstico (~35 KB c/u)
  enso/                 series de los gráficos ENSO
  geo/borders.json      límites políticos compartidos
  content/              textos editables sin tocar el código
tools/                  extractores de datos y recorte de la marca (Python 3)
assets/                 logos, iconos y librerías locales
```

### Formato de las grillas

Cada archivo de `data/grids/` describe una grilla regular y sus fotogramas
mensuales:

```json
{
  "title": "Anomalía Precipitación (mm/mes)",
  "grid":   { "lat0": -59.5, "lon0": -89.5, "dlat": 1, "dlon": 1, "ny": 74, "nx": 59 },
  "months": ["Ago 2026", "…"],
  "scale":  [{ "color": "#543005", "min": -100, "max": -80.4 }, "…"],
  "frames": ["<base64 de ny×nx bytes: un índice de color por celda>", "…"]
}
```

Un byte por celda en lugar de un polígono con su estilo: **24,3 MB → 35 KB por
visor.** El renderizado ocurre en un único canvas (`grid-layer.js`), no en 26.196
nodos SVG. Comparar dos pronósticos solo recorta el canvas de cada capa, así que
la cortina se arrastra sin volver a dibujar la grilla.

## Base científica

### Predicción estacional

| | |
|---|---|
| Dominio | 89,5° O – 30,5° O, 59,5° S – 14,5° N (Sudamérica y océanos adyacentes) |
| Resolución | 1° × 1°, grilla regular de 59 × 74 = 4366 celdas |
| Horizonte | 6 meses consecutivos desde la condición inicial |
| Modelos | ECMWF (SEAS5/S2S), BOM y NCEP–CFSv2 |
| Variables | Anomalía de precipitación (mm/mes), de temperatura máxima y de temperatura mínima (°C) |

Cada campo es una **anomalía**: la desviación del valor pronosticado respecto de
la climatología del propio modelo, no un valor absoluto. La fuente la publica
**clasificada en 16 rangos** de una escala divergente y simétrica (tipo BrBG),
de modo que una celda entrega su clase y no una cifra puntual; la lectura del
punto da primero la interpretación de esa clase y el intervalo detrás. Las dos
clases extremas no tienen tope físico —su límite exterior es donde la escala
deja de dividir—, y se rotulan «80,4 o más» en lugar de presentar como medida
un valor que no lo es.

El visor ofrece dos representaciones de la misma grilla. **Celdas** entrega el
dato sin interpolar. **Continuo** reconstruye el campo entre centros de celda
con interpolación bicúbica (Catmull-Rom), que mantiene continua la primera
derivada al cruzar un nodo; junto a la costa, donde el núcleo de 4 × 4 queda
incompleto, degrada a bilineal. La interpolación se aplica al valor y solo
después el color, porque interpolar en RGB produciría tonos que no corresponden
a ninguna clase de la escala. La reconstrucción continua se ofrece por defecto
solo en temperatura: la precipitación es un campo espacialmente discontinuo y
suavizarlo sugiere transiciones que el modelo no resuelve. **En ningún caso el
suavizado añade resolución ni información que el modelo no haya producido.**

### Monitoreo ENSO

Anomalía de la temperatura superficial del mar (TSM) en las dos regiones Niño
de referencia para el Pacífico oriental y central:

| Región | Dominio | Relevancia |
|---|---|---|
| Niño 1+2 | 0°–10° S, 90° O – 80° O | Pacífico oriental frente a la costa peruana; controla la respuesta pluviométrica del norte del país |
| Niño 3.4 | 5° N – 5° S, 170° O – 120° O | Índice convencional de la señal ENSO a escala global |

La serie observada procede del reanálisis **ERA5**. La predicción integra
**20 modelos globales con 949 miembros de ensamble** en total (de 10 a 155 por
modelo), resumidos en el promedio multimodelo (MME) y en la dispersión por
percentiles: P25–P75, P10–P90 y Pmin–Pmax. Cada intervalo describe la
incertidumbre entre miembros, no un margen de error del pronóstico.

Los umbrales de categoría son **específicos de cada región** y no
intercambiables. Niño 3.4 emplea los convencionales de ±0,5 / ±1,0 / ±1,5 /
±2,0 °C; Niño 1+2, de mayor variabilidad interanual, emplea −1,3 / −1,1 / −0,7
/ +0,5 / +1,3 / +2,1 °C. Por eso las dos regiones conservan sus propias marcas
de eje aunque se muestren con escala vertical común, que es lo que permite
compararlas visualmente sin falsear la magnitud.

### Alcance

Los productos son resultados de modelos numéricos y conservan la incertidumbre
propia de la predicción climática a escala mensual y estacional. La habilidad
predictiva decrece con el plazo y varía por región, variable y época del año.
La información es de carácter referencial y no constituye un pronóstico oficial
del SENAMHI.

## Enlaces directos

El hash admite parámetros, de modo que cualquier vista se puede compartir:

```
#estacional?modelo=ecmwf&variable=tpara
#estacional?modelo=ecmwf&variable=tpara&modelo2=ncep&variable2=mx2t24a
#estacional?modelo=ecmwf&variable=mx2t24a&detalle=continuo
#estacional?modelo=ecmwf&variable=tpara&reparto=1
```

`modelo2` y `variable2` abren la comparación de cortina; `detalle=continuo`
activa la reconstrucción del campo y `reparto=1`, el panel de distribución.

## Actualizar los datos

Los visores que genera el pipeline en Python (Folium y Plotly) se convierten con
los scripts de `tools/`. Los HTML de origen no forman parte del repositorio.

```bash
python tools/extract_grids.py   /ruta/a/visores  data/grids
python tools/extract_enso.py    /ruta/a/visores  data/enso
python tools/extract_borders.py /ruta/a/visores/visor_ecmwf_tpara.html data/geo/borders.json
```

`extract_grids.py` espera archivos con el patrón `visor_<modelo>_<variable>.html`.
Los límites políticos solo se regeneran si cambia el dominio del mapa.

## Rehacer la marca

El sitio no usa la lámina institucional tal cual: escribe el nombre con
tipografía viva y deja detrás solo el planeta. `build_brand.py` localiza la
esfera en la lámina —ajusta una circunferencia por mínimos cuadrados sobre el
anillo del limbo, así que no hay coordenadas escritas a mano—, la recorta con
su halo desvaneciéndose hacia el canto y de ese mismo recorte deriva el fondo
de la portada, los iconos, el favicon y la tarjeta social.

```bash
python tools/build_brand.py SORIAN_OFFICIAL.png
```

Reescribe `assets/globo*.webp`, `assets/icon-*.png`, `assets/apple-touch-icon.png`,
`assets/favicon.svg`, `assets/hero-sudamerica.webp` y `favicon.ico`. La lámina de
origen no forma parte del repositorio.

## Licencia y uso

Los resultados provienen de modelos numéricos y contienen incertidumbre. La
información es de carácter referencial y no reemplaza una evaluación oficial.
El SENAMHI no se responsabiliza por interpretaciones o usos inadecuados.

© SENAMHI — Lima, Perú

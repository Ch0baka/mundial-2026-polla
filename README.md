# Polla Mundial FIFA 2026

Proyecto web estático y herramientas para convertir los pronósticos de cada
jugador desde Excel a JSON normalizado. La primera versión se concentra en
dejar sólido el flujo Excel → JSON; el ranking web se implementará después.

## Instalación

Requiere Python 3.11 o superior.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Convertir un jugador para depuración

El nombre se detecta desde `Pool!C5`, o se puede reemplazar con `--player`.

```bash
python scripts/excel_to_json.py input/jugador.xlsx
python scripts/excel_to_json.py input/otro.xlsx --player "Nombre Apellido"
python scripts/excel_to_json.py input/jugador.xlsx --public-id xx-01 --public-name XX-01
```

El resultado queda en `data/players/{player_id}.json`. El script conserva el
texto original en `prediction_raw`, muestra warnings sin interrumpir la
conversión y solo falla ante errores críticos, como un archivo ilegible o la
ausencia de la hoja `Pool`.

## Convertir todos los Excel

```bash
python scripts/build_all.py
```

Este comando convierte todos los `.xlsx` de `input/` y reconstruye
`data/players_index.json`. Los archivos se procesan en orden estable y se
publican únicamente con alias correlativos.

## Privacidad de jugadores

Los nombres reales se leen desde cada Excel solo para generar un alias público
del tipo `DZ-01`. El portal, `data/players_index.json` y los JSON de
`data/players/` usan exclusivamente esos alias.

El mapeo entre alias, nombre real y archivo de origen queda en
`private/player_aliases.json` para administración local. La carpeta `private/`
y los Excel de `input/` están ignorados por Git y no deben publicarse en
GitHub.

## JSON generado

Las predicciones de partidos se separan en `group_stage`, `round_of_32`,
`round_of_16`, `quarter_finals`, `semi_finals`, `third_place` y `final`.
También se extraen posiciones de grupo, equipos clasificados, cuadro de honor,
premios individuales y warnings de validación.

## Probar el frontend localmente

El frontend usa `fetch`, por lo que debe abrirse mediante un servidor local y
no directamente como archivo.

```bash
python -m http.server 8000
```

Luego abre:

```text
http://localhost:8000
```

La aplicación carga `data/players_index.json` y los JSON individuales para
mostrar dashboard, ranking, jugadores, fase de grupos, eliminatorias, fixture,
premios y avisos. También carga `data/teams.json` para mostrar
banderas cuando el SVG correspondiente existe. El ranking calcula puntos usando
únicamente resultados finalizados de `data/real_results.json`.

Si `data/app_config.json` o una bandera SVG no están disponibles, el portal
utiliza sus valores por defecto y continúa funcionando.

## Publicación en GitHub Pages

El repositorio incluye un workflow en `.github/workflows/pages.yml` que publica
el portal estático en GitHub Pages al hacer push a `main`. El workflow arma un
artefacto con `index.html`, `styles.css`, `app.js`, `assets/` y `data/`, y deja
fuera scripts, tests, Excel locales y archivos privados.

En GitHub, revisa que `Settings > Pages > Source` esté configurado como
`GitHub Actions`. Si un despliegue falla solo en el paso `deploy` y el build ya
terminó correctamente, se puede reintentar desde la página del Action o hacer
un nuevo push para disparar otra publicación.

## Modo pruebas

Para eliminar un jugador específico, limpiar todos los jugadores de prueba,
regenerarlos desde los Excel y servir el portal:

```bash
python scripts/remove_player.py dz-01
python scripts/clean_players.py
python scripts/build_all.py
python -m http.server 8000
```

La web publicada en GitHub Pages es estática y no puede borrar archivos JSON
del repositorio. La limpieza se realiza localmente con estos scripts y luego se
publican los cambios resultantes a GitHub.

`remove_player.py` reconstruye `data/players_index.json` leyendo los JSON
restantes. `clean_players.py` elimina únicamente `data/players/*.json`, deja el
índice como `[]` y conserva `scoring_rules.json`, `teams.json`,
`app_config.json`, `private/player_aliases.json` y los demás archivos de
`data/`.

## Actualización de resultados reales

El administrador actualiza manualmente `data/real_results.json` con los
resultados reales. Después hace commit y publica el cambio en GitHub; GitHub
Pages servirá el JSON actualizado y el ranking se recalculará automáticamente
al recargar el portal.

También existe un script para consultar resultados desde internet y actualizar
el archivo automáticamente:

```bash
python scripts/update_real_results.py 2026-06-15
```

Si no se indica fecha, consulta las últimas 24 horas:

```bash
python scripts/update_real_results.py
```

Para probar sin escribir cambios:

```bash
python scripts/update_real_results.py --dry-run 2026-06-15
```

El script usa el scoreboard público de ESPN como fuente, empareja partidos por
selecciones contra `data/real_results.json`, actualiza marcadores y estados
`live`/`finished`, y evita retroceder partidos ya finalizados.

Cuando el script escribe cambios reales, pregunta si se desea hacer commit y
push a GitHub. Si se confirma, ejecuta `git status`, agrega únicamente
`data/real_results.json`, crea un commit `Games update #XX` con el último
partido actualizado y hace `git push`. En modo `--dry-run` no escribe cambios
ni ofrece commit.

Flujo de actualización:

1. Editar `data/real_results.json`.
2. Cambiar el partido a `status: "finished"`.
3. Agregar `home_score` y `away_score`.
4. Si hubo penales, agregar `home_penalties` y `away_penalties`.
5. Guardar, hacer commit y push.
6. GitHub Pages publicará el ranking actualizado.

La web solo lee este archivo y nunca lo modifica. Únicamente los partidos con
`status: "finished"` generan puntos. Cada resultado se une a los pronósticos
principalmente mediante `match_id`. Cuando un JSON de jugador no incluye ese
campo, el frontend lo deriva de forma determinista según la posición dentro de
cada fase: grupos 1-72, dieciseisavos 73-88, octavos 89-96, cuartos 97-100,
semifinales 101-102, tercer puesto 103 y final 104.

El cuadro oficial se define en `data/knockout_bracket.json`. Los desempates que
no puedan resolverse con los resultados disponibles pueden administrarse en
`data/qualification_overrides.json`.

La matriz completa de asignación de mejores terceros del Anexo C todavía no
está implementada. `data/best_third_matrix.json` conserva la referencia oficial
y el portal mantiene esos slots como pendientes, sin asignarlos arbitrariamente.
La fuente oficial es el documento
[FIFA World Cup 26 Regulations](https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf).

La pestaña **Fixture** permite filtrar por fase, grupo y estado, y
muestra warnings cuando un resultado finalizado está incompleto o no se puede
unir con una predicción.

En `data/real_results.json`, los partidos de fase de grupos mantienen sus
selecciones reales. Las eliminatorias usan `home_slot` y `away_slot` hasta que
los resultados reales permiten resolver los equipos. El portal calcula tablas
de grupo por puntos, diferencia de gol, goles a favor y nombre como desempate
temporal; los cruces de mejores terceros permanecen por definir hasta contar
con una regla oficial completa.

La puntuación se lee desde `data/scoring_rules.json` y es acumulativa: se suman
los puntos correspondientes por signo, diferencia de gol y marcador exacto.
En eliminatorias, acertar el clasificado suma puntos adicionales; el marcador
de penales no da puntos.

Esta Fase 1 no calcula todavía puntos por campeón, cuadro de honor, premios
individuales, bonos por clasificados de fase ni desempates avanzados.

`scripts/build_all.py` procesa todos los Excel de `input/`.
`scripts/excel_to_json.py` permite procesar un Excel individual durante pruebas.
La web no edita resultados: solo lee `real_results.json`.

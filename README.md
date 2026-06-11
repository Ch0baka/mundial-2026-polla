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
mostrar dashboard, ranking preparado, jugadores, fase de grupos, eliminatorias,
premios, auditoría y warnings. También carga `data/teams.json` para mostrar
banderas cuando el SVG correspondiente existe. El ranking calcula puntos usando
únicamente resultados finalizados de `data/real_results.json`.

La fecha visible de cierre de cambios se configura en `data/app_config.json`.
Si ese archivo o una bandera SVG no están disponibles, el portal utiliza sus
valores por defecto y continúa funcionando.

Los PDF de auditoría se esperan en `pdf/{player_id}.pdf`. El portal mantiene el
enlace visible aunque el archivo todavía no exista.

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

Flujo de actualización:

1. Editar `data/real_results.json`.
2. Cambiar el partido a `status: "finished"`.
3. Agregar `home_score` y `away_score`.
4. Si hubo penales, agregar `home_penalties` y `away_penalties`.
5. Guardar, hacer commit y push.
6. GitHub Pages publicará el ranking actualizado.

La web solo lee este archivo y nunca lo modifica. Únicamente los partidos con
`status: "finished"` generan puntos. Cada resultado se une a los pronósticos
mediante `match_key`, con el formato:

```text
phase|home_team|away_team
```

La pestaña **Fixture de Control** permite filtrar por fase, grupo y estado, y
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

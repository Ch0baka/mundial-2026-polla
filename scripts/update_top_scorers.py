#!/usr/bin/env python3
"""Generate data/top_scorers.json from ESPN match summaries.

Usage:
  python scripts/update_top_scorers.py
"""

from __future__ import annotations

import json
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "data" / "top_scorers.json"
ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard"
ESPN_SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary"
LOCAL_TZ = ZoneInfo("America/Santiago")
USER_AGENT = "Mozilla/5.0 (compatible; Mundial2026PollaTopScorers/1.0)"
TOURNAMENT_DATES = "20260611-20260719"
FETCH_TIMEOUT_SECONDS = 12

TEAM_ALIASES = {
    "Algeria": "Argelia",
    "Argentina": "Argentina",
    "Australia": "Australia",
    "Austria": "Austria",
    "Belgium": "Bélgica",
    "Bosnia-Herzegovina": "Bosnia y Herzegovina",
    "Bosnia and Herzegovina": "Bosnia y Herzegovina",
    "Brazil": "Brasil",
    "Canada": "Canadá",
    "Cape Verde": "Cabo Verde",
    "Colombia": "Colombia",
    "Congo DR": "RD Congo",
    "Croatia": "Croacia",
    "Curacao": "Curazao",
    "Czechia": "República Checa",
    "Ecuador": "Ecuador",
    "Egypt": "Egipto",
    "England": "Inglaterra",
    "France": "Francia",
    "Germany": "Alemania",
    "Ghana": "Ghana",
    "Haiti": "Haití",
    "Iran": "Irán",
    "Iraq": "Irak",
    "Ivory Coast": "Costa de Marfil",
    "Japan": "Japón",
    "Jordan": "Jordania",
    "Mexico": "México",
    "Morocco": "Marruecos",
    "Netherlands": "Países Bajos",
    "New Zealand": "Nueva Zelanda",
    "Norway": "Noruega",
    "Panama": "Panamá",
    "Paraguay": "Paraguay",
    "Portugal": "Portugal",
    "Qatar": "Catar",
    "Saudi Arabia": "Arabia Saudita",
    "Scotland": "Escocia",
    "Senegal": "Senegal",
    "South Africa": "Sudáfrica",
    "South Korea": "Corea del Sur",
    "Spain": "España",
    "Sweden": "Suecia",
    "Switzerland": "Suiza",
    "Turkey": "Turquía",
    "Tunisia": "Túnez",
    "United States": "Estados Unidos",
    "Uruguay": "Uruguay",
    "Uzbekistan": "Uzbekistán",
}


def fetch_json(url: str) -> dict[str, Any]:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise RuntimeError(f"No se pudo consultar ESPN ({url}): {exc}") from exc


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFD", value)
    return "".join(char for char in text if unicodedata.category(char) != "Mn").lower()


def map_team_name(value: str | None) -> str:
    if not value:
        return "Sin definir"
    if value in TEAM_ALIASES:
        return TEAM_ALIASES[value]
    normalized = normalize(value)
    for source, target in TEAM_ALIASES.items():
        if normalize(source) == normalized:
            return target
    return value


def is_goal_scoring_play(play: dict[str, Any]) -> bool:
    play_type = (play.get("type") or {}).get("type") or (play.get("type") or {}).get("text") or ""
    normalized_type = str(play_type).lower()
    return play.get("scoringPlay") is True and (
        normalized_type == "penalty---scored" or normalized_type.startswith("goal")
    )


def fetch_event_summaries() -> list[dict[str, Any]]:
    query = urlencode({"limit": 200, "dates": TOURNAMENT_DATES})
    scoreboard = fetch_json(f"{ESPN_SCOREBOARD_URL}?{query}")
    event_ids = []
    for event in scoreboard.get("events", []):
        status_type = ((event.get("competitions") or [{}])[0].get("status") or event.get("status") or {}).get("type") or {}
        if not event.get("id") or not (status_type.get("completed") or status_type.get("state") == "in"):
            continue
        event_ids.append(str(event["id"]))

    summaries = []
    failed = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(fetch_json, f"{ESPN_SUMMARY_URL}?{urlencode({'event': event_id})}"): event_id
            for event_id in event_ids
        }
        for future in as_completed(futures):
            event_id = futures[future]
            try:
                summaries.append(future.result())
            except Exception as exc:  # noqa: BLE001 - CLI should continue with partial ESPN failures.
                failed.append((event_id, exc))
    if failed:
        print(f"Advertencia: {len(failed)} resúmenes ESPN no se pudieron leer.")
        for event_id, exc in failed[:5]:
            print(f"  - ESPN event {event_id}: {exc}")
    return summaries


def calculate_top_scorers(summaries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    scorers: dict[str, dict[str, Any]] = {}
    for summary in summaries:
        seen_play_ids = set()
        for play in summary.get("keyEvents", []):
            if not is_goal_scoring_play(play) or play.get("id") in seen_play_ids:
                continue
            seen_play_ids.add(play.get("id"))
            athlete = (((play.get("participants") or [{}])[0]).get("athlete") or {})
            name = athlete.get("displayName") or athlete.get("shortName")
            if not name:
                continue
            scorer_id = str(athlete.get("id") or f"{name}|{(play.get('team') or {}).get('displayName') or ''}")
            current = scorers.setdefault(scorer_id, {
                "id": scorer_id,
                "name": name,
                "team": map_team_name((play.get("team") or {}).get("displayName")),
                "goals": 0,
            })
            current["goals"] += 1
    return sorted(scorers.values(), key=lambda scorer: (-scorer["goals"], scorer["name"]))


def main() -> int:
    try:
        summaries = fetch_event_summaries()
    except RuntimeError as exc:
        print(f"ERROR: {exc}")
        if OUTPUT_PATH.exists():
            existing = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
            print(f"No se actualizó {OUTPUT_PATH.relative_to(ROOT)}.")
            print(f"Se conserva el archivo local existente, actualizado en: {existing.get('updated_at', 'sin fecha')}")
            return 0
        print("No existe un archivo local previo para conservar.")
        return 1

    scorers = calculate_top_scorers(summaries)
    if not scorers:
        print("ERROR: ESPN respondió, pero no se detectaron goleadores.")
        if OUTPUT_PATH.exists():
            print(f"No se actualizó {OUTPUT_PATH.relative_to(ROOT)}; se conserva el archivo local existente.")
            return 0
        return 1

    payload = {
        "schema_version": 1,
        "source": "ESPN match summaries",
        "updated_at": datetime.now(LOCAL_TZ).isoformat(timespec="seconds"),
        "scorers": scorers,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Partidos procesados: {len(summaries)}")
    print(f"Goleadores encontrados: {len(scorers)}")
    print("Top 5:")
    for index, scorer in enumerate(scorers[:5], start=1):
        print(f"  {index}. {scorer['name']} ({scorer['team']}): {scorer['goals']}")
    print(f"Salida: {OUTPUT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

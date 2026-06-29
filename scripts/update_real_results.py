#!/usr/bin/env python3
"""Update data/real_results.json from an online scoreboard source.

Default source: ESPN public scoreboard API for FIFA World Cup.

Usage:
  python scripts/update_real_results.py 2026-06-15
  python scripts/update_real_results.py
  python scripts/update_real_results.py --dry-run 2026-06-17
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
REAL_RESULTS_PATH = ROOT / "data" / "real_results.json"
ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard"
LOCAL_TZ = ZoneInfo("America/Santiago")
USER_AGENT = "Mozilla/5.0 (compatible; Mundial2026PollaUpdater/1.0)"
ESPN_KNOCKOUT_MATCH_IDS = {
    "760486": 73,
    "760489": 74,
    "760488": 75,
    "760487": 76,
    "760492": 77,
    "760490": 78,
    "760491": 79,
    "760495": 80,
    "760494": 81,
    "760493": 82,
    "760496": 83,
    "760497": 84,
    "760498": 85,
    "760500": 86,
    "760501": 87,
    "760499": 88,
}

TEAM_ALIASES = {
    "algeria": "Argelia",
    "argentina": "Argentina",
    "australia": "Australia",
    "austria": "Austria",
    "belgium": "Bélgica",
    "bosnia herzegovina": "Bosnia y Herzegovina",
    "bosnia and herzegovina": "Bosnia y Herzegovina",
    "bosnia-herzegovina": "Bosnia y Herzegovina",
    "brazil": "Brasil",
    "canada": "Canadá",
    "cape verde": "Cabo Verde",
    "catar": "Catar",
    "colombia": "Colombia",
    "congo dr": "RD Congo",
    "costa de marfil": "Costa de Marfil",
    "croatia": "Croacia",
    "curacao": "Curazao",
    "czechia": "República Checa",
    "dr congo": "RD Congo",
    "ecuador": "Ecuador",
    "egypt": "Egipto",
    "england": "Inglaterra",
    "france": "Francia",
    "germany": "Alemania",
    "ghana": "Ghana",
    "haiti": "Haití",
    "iran": "Irán",
    "ir iran": "Irán",
    "iraq": "Irak",
    "ivory coast": "Costa de Marfil",
    "japan": "Japón",
    "jordan": "Jordania",
    "korea republic": "Corea del Sur",
    "mexico": "México",
    "morocco": "Marruecos",
    "netherlands": "Países Bajos",
    "new zealand": "Nueva Zelanda",
    "norway": "Noruega",
    "panama": "Panamá",
    "paraguay": "Paraguay",
    "portugal": "Portugal",
    "qatar": "Catar",
    "saudi arabia": "Arabia Saudita",
    "scotland": "Escocia",
    "senegal": "Senegal",
    "south africa": "Sudáfrica",
    "south korea": "Corea del Sur",
    "spain": "España",
    "sweden": "Suecia",
    "switzerland": "Suiza",
    "tunisia": "Túnez",
    "turkey": "Turquía",
    "turkiye": "Turquía",
    "united states": "Estados Unidos",
    "uruguay": "Uruguay",
    "uzbekistan": "Uzbekistán",
}


@dataclass(frozen=True)
class SourceMatch:
    event_id: str
    match_id: int | None
    source_name: str
    starts_at: datetime
    home_team: str
    away_team: str
    home_score: int | None
    away_score: int | None
    home_penalties: int | None
    away_penalties: int | None
    status: str
    status_detail: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Actualiza data/real_results.json desde resultados online.",
    )
    parser.add_argument(
        "since",
        nargs="?",
        help="Fecha inicial en formato YYYY-MM-DD. Si se omite, usa las últimas 24 horas.",
    )
    parser.add_argument(
        "--date",
        dest="since_flag",
        help="Alias explícito para la fecha inicial en formato YYYY-MM-DD.",
    )
    parser.add_argument(
        "--hours",
        type=int,
        default=24,
        help="Ventana hacia atrás cuando no se indica fecha. Default: 24.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Muestra lo que cambiaría sin modificar data/real_results.json.",
    )
    parser.add_argument(
        "--through",
        help="Fecha final en formato YYYY-MM-DD. Permite actualizar horarios futuros.",
    )
    return parser.parse_args()


def normalize(value: str | None) -> str:
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def canonical_team(value: str | None) -> str:
    key = normalize(value)
    return TEAM_ALIASES.get(key, str(value or "").strip())


def parse_iso_datetime(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized).astimezone(LOCAL_TZ)


def date_range(start: datetime, end: datetime) -> list[datetime]:
    current = datetime(start.year, start.month, start.day, tzinfo=LOCAL_TZ)
    last = datetime(end.year, end.month, end.day, tzinfo=LOCAL_TZ) + timedelta(days=1)
    dates = []
    while current <= last:
        dates.append(current)
        current += timedelta(days=1)
    return dates


def fetch_json(url: str) -> dict[str, Any]:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RuntimeError(f"No se pudo consultar {url}: {exc}") from exc


def safe_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def extract_penalty_score(competitor: dict[str, Any]) -> int | None:
    for key in ("shootoutScore", "penaltyScore", "penalties", "penaltyShootoutScore"):
        value = competitor.get(key)
        if isinstance(value, dict):
            value = value.get("score")
        score = safe_int(value)
        if score is not None:
            return score
    return None


def map_source_status(status_type: dict[str, Any]) -> str:
    if status_type.get("completed") is True or status_type.get("state") == "post":
        return "finished"
    if status_type.get("state") == "in":
        return "live"
    return "scheduled"


def fetch_espn_matches(start: datetime, end: datetime) -> list[SourceMatch]:
    matches: list[SourceMatch] = []
    seen_events: set[str] = set()
    for day in date_range(start, end):
        query = urlencode({"dates": day.strftime("%Y%m%d")})
        payload = fetch_json(f"{ESPN_SCOREBOARD_URL}?{query}")
        for event in payload.get("events", []):
            event_id = str(event.get("id", ""))
            if event_id in seen_events:
                continue
            seen_events.add(event_id)

            competitions = event.get("competitions") or []
            if not competitions:
                continue
            competition = competitions[0]
            starts_at = parse_iso_datetime(competition.get("date") or event.get("date"))
            if starts_at < start or starts_at > end:
                continue

            by_side = {item.get("homeAway"): item for item in competition.get("competitors", [])}
            home = by_side.get("home")
            away = by_side.get("away")
            if not home or not away:
                continue

            status_type = (competition.get("status") or {}).get("type") or {}
            status = map_source_status(status_type)
            matches.append(SourceMatch(
                event_id=event_id,
                match_id=ESPN_KNOCKOUT_MATCH_IDS.get(event_id),
                source_name="ESPN",
                starts_at=starts_at,
                home_team=canonical_team((home.get("team") or {}).get("displayName")),
                away_team=canonical_team((away.get("team") or {}).get("displayName")),
                home_score=safe_int(home.get("score")) if status in {"live", "finished"} else None,
                away_score=safe_int(away.get("score")) if status in {"live", "finished"} else None,
                home_penalties=extract_penalty_score(home),
                away_penalties=extract_penalty_score(away),
                status=status,
                status_detail=status_type.get("description") or status_type.get("detail") or status,
            ))
    return matches


def match_signature(home_team: str | None, away_team: str | None) -> tuple[str, str]:
    return normalize(home_team), normalize(away_team)


def build_match_index(matches: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
    index: dict[tuple[str, str], dict[str, Any]] = {}
    for match in matches:
        home_team = match.get("home_team")
        away_team = match.get("away_team")
        if home_team and away_team:
            index[match_signature(home_team, away_team)] = match
    return index


def build_match_id_index(matches: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    return {
        int(match["match_id"]): match
        for match in matches
        if match.get("match_id") is not None
    }


def should_update_status(existing: str, incoming: str) -> bool:
    priority = {"scheduled": 0, "postponed": 0, "live": 1, "finished": 2}
    return priority.get(incoming, 0) >= priority.get(existing, 0)


def apply_source_match(target: dict[str, Any], source: SourceMatch) -> list[str]:
    changes = []
    previous = {
        "date": target.get("date"),
        "time": target.get("time"),
        "home_team": target.get("home_team"),
        "away_team": target.get("away_team"),
        "home_score": target.get("home_score"),
        "away_score": target.get("away_score"),
        "home_penalties": target.get("home_penalties"),
        "away_penalties": target.get("away_penalties"),
        "status": target.get("status"),
        "match_key": target.get("match_key"),
    }

    target["date"] = source.starts_at.strftime("%Y-%m-%d")
    target["time"] = source.starts_at.strftime("%H:%M")
    if source.match_id is not None or not target.get("home_team") or not target.get("away_team"):
        target["home_team"] = source.home_team
        target["away_team"] = source.away_team
    if target.get("home_team") and target.get("away_team"):
        target["match_key"] = f"{target.get('phase')}|{target.get('home_team')}|{target.get('away_team')}"

    if source.status in {"live", "finished"}:
        target["home_score"] = source.home_score
        target["away_score"] = source.away_score
        if source.home_penalties is not None and source.away_penalties is not None:
            target["home_penalties"] = source.home_penalties
            target["away_penalties"] = source.away_penalties

    if should_update_status(str(target.get("status") or "scheduled"), source.status):
        target["status"] = source.status

    for key, old_value in previous.items():
        if target.get(key) != old_value:
            changes.append(f"{key}: {old_value} -> {target.get(key)}")
    return changes


def recompute_tournament_status(matches: list[dict[str, Any]]) -> str:
    statuses = [match.get("status") for match in matches]
    if statuses and all(status == "finished" for status in statuses):
        return "finished"
    if any(status in {"finished", "live"} for status in statuses):
        return "in_progress"
    return "not_started"


def run_git_command(command: list[str]) -> subprocess.CompletedProcess[str]:
    print(f"\n$ {' '.join(command)}")
    result = subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.stdout:
        print(result.stdout, end="" if result.stdout.endswith("\n") else "\n")
    if result.stderr:
        print(result.stderr, end="" if result.stderr.endswith("\n") else "\n", file=sys.stderr)
    if result.returncode != 0:
        print(f"Comando falló con código {result.returncode}")
    return result


def wants_github_commit() -> bool:
    answer = input("\n¿Deseas hacer commit y push a GitHub? [s/N] ").strip().lower()
    return answer in {"s", "si", "sí", "y", "yes"}


def commit_and_push(last_updated_match_id: int) -> bool:
    status = run_git_command(["git", "status"])
    if status.returncode != 0:
        run_git_command(["git", "status"])
        return False

    add = run_git_command(["git", "add", "data/real_results.json"])
    if add.returncode != 0:
        run_git_command(["git", "status"])
        return False

    commit = run_git_command(["git", "commit", "-m", f"Games update #{last_updated_match_id}"])
    if commit.returncode != 0:
        run_git_command(["git", "status"])
        return False

    push = run_git_command(["git", "push"])
    final_status = run_git_command(["git", "status"])
    if push.returncode != 0 or final_status.returncode != 0:
        return False

    print("Commit Github Ok!")
    return True


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def main() -> int:
    args = parse_args()
    since_value = args.since_flag or args.since
    now = datetime.now(LOCAL_TZ)
    if since_value:
        try:
            start_date = datetime.strptime(since_value, "%Y-%m-%d")
        except ValueError:
            print("ERROR: la fecha debe tener formato YYYY-MM-DD.", file=sys.stderr)
            return 2
        start = start_date.replace(tzinfo=LOCAL_TZ)
        mode = f"desde {since_value}"
    else:
        start = now - timedelta(hours=args.hours)
        mode = f"últimas {args.hours} horas"
    end = now
    if args.through:
        try:
            through_date = datetime.strptime(args.through, "%Y-%m-%d")
        except ValueError:
            print("ERROR: la fecha final debe tener formato YYYY-MM-DD.", file=sys.stderr)
            return 2
        end = through_date.replace(tzinfo=LOCAL_TZ) + timedelta(days=1) - timedelta(seconds=1)
        mode = f"{mode} hasta {args.through}"

    real_results = json.loads(REAL_RESULTS_PATH.read_text(encoding="utf-8"))
    target_index = build_match_index(real_results.get("matches", []))
    target_id_index = build_match_id_index(real_results.get("matches", []))
    source_matches = fetch_espn_matches(start, end)

    updated = []
    unchanged = []
    unmatched = []
    skipped = []

    for source in source_matches:
        signature = match_signature(source.home_team, source.away_team)
        reverse_signature = match_signature(source.away_team, source.home_team)
        target = target_id_index.get(source.match_id) if source.match_id is not None else None
        target = target or target_index.get(signature)
        reverse = False
        if target is None:
            target = target_index.get(reverse_signature)
            reverse = target is not None
        if target is None:
            unmatched.append(source)
            continue

        effective_source = source
        if reverse:
            effective_source = SourceMatch(
                event_id=source.event_id,
                match_id=source.match_id,
                source_name=source.source_name,
                starts_at=source.starts_at,
                home_team=source.away_team,
                away_team=source.home_team,
                home_score=source.away_score,
                away_score=source.home_score,
                home_penalties=source.away_penalties,
                away_penalties=source.home_penalties,
                status=source.status,
                status_detail=source.status_detail,
            )

        changes = apply_source_match(target, effective_source)
        label = (
            f"#{target.get('match_id')} {target.get('home_team')} "
            f"{target.get('home_score')}-{target.get('away_score')} {target.get('away_team')} "
            f"({target.get('status')})"
        )
        if changes:
            updated.append((target.get("match_id"), label, changes))
        else:
            if source.status == "scheduled":
                skipped.append(source)
            else:
                unchanged.append(label)

    if updated:
        real_results["updated_at"] = now.isoformat(timespec="seconds")
        real_results["status"] = recompute_tournament_status(real_results.get("matches", []))
        if not args.dry_run:
            REAL_RESULTS_PATH.write_text(
                json.dumps(real_results, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )

    print(f"Fuente: ESPN scoreboard")
    print(f"Ventana: {mode} ({start.isoformat(timespec='seconds')} -> {end.isoformat(timespec='seconds')})")
    print(f"Partidos fuente encontrados: {len(source_matches)}")
    print(f"Actualizados: {len(updated)}")
    for _, label, changes in updated:
        print(f"  - {label} [{'; '.join(changes)}]")
    print(f"Sin cambios: {len(unchanged)}")
    print(f"Programados omitidos: {len(skipped)}")
    print(f"No emparejados: {len(unmatched)}")
    for source in unmatched:
        print(f"  - {source.home_team} vs {source.away_team} ({source.status_detail}, ESPN id {source.event_id})")
    if args.dry_run:
        print("Dry-run: no se escribió data/real_results.json")
    else:
        print(f"Salida: {display_path(REAL_RESULTS_PATH)}")
        if updated:
            last_updated_match_id = max(match_id for match_id, _, _ in updated if match_id is not None)
            if wants_github_commit():
                commit_and_push(int(last_updated_match_id))
            else:
                print("Commit omitido por el usuario.")
        else:
            print("Sin cambios; no se ofrece commit.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Import selected flag-icons SVG files into assets/flags.

Usage:
  python scripts/import_flags.py \
    --source /Users/rolando/Codex/banderas_mundial/flag-icons/flags/4x3 \
    --teams data/teams.json \
    --dest assets/flags
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import unicodedata
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path("/Users/rolando/Codex/banderas_mundial/flag-icons/flags/4x3")
DEFAULT_TEAMS = ROOT / "data" / "teams.json"
DEFAULT_DEST = ROOT / "assets" / "flags"

TEAM_TO_FLAG_CODE = {
    "Alemania": "de",
    "Arabia Saudita": "sa",
    "Argelia": "dz",
    "Argentina": "ar",
    "Australia": "au",
    "Austria": "at",
    "Bosnia y Herzegovina": "ba",
    "Brasil": "br",
    "Bélgica": "be",
    "Cabo Verde": "cv",
    "Canadá": "ca",
    "Catar": "qa",
    "Colombia": "co",
    "Corea del Sur": "kr",
    "Costa de Marfil": "ci",
    "Croacia": "hr",
    "Curazao": "cw",
    "Ecuador": "ec",
    "Egipto": "eg",
    "Escocia": "gb-sct",
    "España": "es",
    "Estados Unidos": "us",
    "Francia": "fr",
    "Ghana": "gh",
    "Haití": "ht",
    "Inglaterra": "gb-eng",
    "Irak": "iq",
    "Irán": "ir",
    "Japón": "jp",
    "Jordania": "jo",
    "Marruecos": "ma",
    "México": "mx",
    "Noruega": "no",
    "Nueva Zelanda": "nz",
    "Panamá": "pa",
    "Paraguay": "py",
    "Países Bajos": "nl",
    "Portugal": "pt",
    "RD Congo": "cd",
    "República Checa": "cz",
    "Senegal": "sn",
    "Sudáfrica": "za",
    "Suecia": "se",
    "Suiza": "ch",
    "Turquía": "tr",
    "Túnez": "tn",
    "Uruguay": "uy",
    "Uzbekistán": "uz",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Copia solo las banderas necesarias desde flag-icons hacia assets/flags.",
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="Carpeta flags/4x3 de flag-icons.")
    parser.add_argument("--teams", type=Path, default=DEFAULT_TEAMS, help="Ruta a data/teams.json.")
    parser.add_argument("--dest", type=Path, default=DEFAULT_DEST, help="Carpeta destino para los SVG.")
    parser.add_argument("--dry-run", action="store_true", help="Muestra el resumen sin copiar ni escribir JSON.")
    return parser.parse_args()


def resolve_path(path: Path) -> Path:
    return path if path.is_absolute() else ROOT / path


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFD", value.lower())
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def load_teams(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"No existe data/teams.json en: {path}")
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict):
        raise ValueError("teams.json debe ser un objeto JSON con equipos como claves.")
    return data


def ensure_team_entry(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def main() -> int:
    args = parse_args()
    source = resolve_path(args.source)
    teams_path = resolve_path(args.teams)
    dest = resolve_path(args.dest)

    if not source.exists() or not source.is_dir():
        print(f"ERROR: no existe la carpeta origen de banderas: {source}", file=sys.stderr)
        return 1

    try:
        teams = load_teams(teams_path)
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    copied: list[str] = []
    unchanged: list[str] = []
    missing_mapping: list[str] = []
    missing_source: list[tuple[str, str]] = []

    if not args.dry_run:
        dest.mkdir(parents=True, exist_ok=True)

    for team_name in sorted(teams):
        entry = ensure_team_entry(teams.get(team_name))
        slug = entry.get("slug") or slugify(team_name)
        code = TEAM_TO_FLAG_CODE.get(team_name)

        if not code:
            entry["slug"] = slug
            entry["flag"] = None
            teams[team_name] = entry
            missing_mapping.append(team_name)
            continue

        source_file = source / f"{code}.svg"
        if not source_file.exists():
            entry["slug"] = slug
            entry["flag"] = None
            teams[team_name] = entry
            missing_source.append((team_name, code))
            continue

        dest_file = dest / f"{slug}.svg"
        if args.dry_run:
            copied.append(team_name)
        else:
            before = dest_file.read_bytes() if dest_file.exists() else None
            shutil.copy2(source_file, dest_file)
            after = dest_file.read_bytes()
            (unchanged if before == after else copied).append(team_name)

        entry["slug"] = slug
        entry["flag"] = f"assets/flags/{slug}.svg"
        teams[team_name] = entry

    if not args.dry_run:
        teams_path.write_text(json.dumps(teams, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print("Importación de banderas")
    print(f"Origen: {source}")
    print(f"Destino: {dest}")
    print(f"Teams: {teams_path}")
    print(f"Selecciones en teams.json: {len(teams)}")
    print(f"Banderas copiadas/actualizadas: {len(copied)}")
    print(f"Banderas sin cambios: {len(unchanged)}")
    print(f"Sin código mapeado: {len(missing_mapping)}")
    for team_name in missing_mapping:
        print(f"  - {team_name}")
    print(f"SVG origen faltante: {len(missing_source)}")
    for team_name, code in missing_source:
        print(f"  - {team_name}: {code}.svg")
    if args.dry_run:
        print("Dry-run: no se copiaron SVG ni se actualizó teams.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

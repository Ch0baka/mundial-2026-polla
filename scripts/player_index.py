#!/usr/bin/env python3
"""Helpers for rebuilding data/players_index.json from player JSON files."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PLAYERS_DIR = PROJECT_ROOT / "data" / "players"
DEFAULT_INDEX_PATH = PROJECT_ROOT / "data" / "players_index.json"


def player_index_entry(player_path: Path) -> dict[str, Any]:
    data = json.loads(player_path.read_text(encoding="utf-8"))
    player = data.get("player") or {}
    player_id = player.get("id") or player_path.stem
    player_name = player.get("name")
    if not player_name:
        raise ValueError(f"{player_path.name} no contiene player.name")

    entry: dict[str, Any] = {
        "id": player_id,
        "name": player_name,
        "file": f"players/{player_path.name}",
    }
    generated_at = (data.get("source") or {}).get("generated_at")
    if generated_at:
        entry["generated_at"] = generated_at
    return entry


def write_players_index(
    entries: list[dict[str, Any]],
    index_path: Path = DEFAULT_INDEX_PATH,
    *,
    wrapped: bool = True,
) -> Path:
    index_path.parent.mkdir(parents=True, exist_ok=True)
    payload: Any = {"players": entries} if wrapped else entries
    index_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return index_path


def rebuild_players_index(
    players_dir: Path = DEFAULT_PLAYERS_DIR,
    index_path: Path = DEFAULT_INDEX_PATH,
    *,
    wrapped: bool = True,
) -> tuple[list[dict[str, Any]], list[str]]:
    entries: list[dict[str, Any]] = []
    warnings: list[str] = []
    players_dir.mkdir(parents=True, exist_ok=True)

    for player_path in sorted(players_dir.glob("*.json")):
        try:
            entries.append(player_index_entry(player_path))
        except (json.JSONDecodeError, OSError, ValueError) as exc:
            warnings.append(f"{player_path.name}: {exc}")

    entries.sort(key=lambda entry: entry["name"].casefold())
    write_players_index(entries, index_path, wrapped=wrapped)
    return entries, warnings

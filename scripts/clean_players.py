#!/usr/bin/env python3
"""Remove every player JSON and leave an empty players index."""

from __future__ import annotations

from pathlib import Path

from player_index import DEFAULT_INDEX_PATH, DEFAULT_PLAYERS_DIR, write_players_index


def clean_players(
    players_dir: Path = DEFAULT_PLAYERS_DIR,
    index_path: Path = DEFAULT_INDEX_PATH,
) -> int:
    players_dir.mkdir(parents=True, exist_ok=True)
    player_files = sorted(players_dir.glob("*.json"))
    for player_path in player_files:
        player_path.unlink()

    write_players_index([], index_path, wrapped=False)
    print(f"Jugadores eliminados: {len(player_files)}")
    print(f"Índice vacío: {index_path}")
    print("Se conservaron los demás archivos de data/.")
    return 0


def main() -> int:
    return clean_players()


if __name__ == "__main__":
    raise SystemExit(main())

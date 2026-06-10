#!/usr/bin/env python3
"""Remove one player JSON and rebuild the players index."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from player_index import DEFAULT_INDEX_PATH, DEFAULT_PLAYERS_DIR, rebuild_players_index


def remove_player(
    player_id: str,
    players_dir: Path = DEFAULT_PLAYERS_DIR,
    index_path: Path = DEFAULT_INDEX_PATH,
) -> int:
    if not player_id or Path(player_id).name != player_id:
        print("ERROR: player_id no válido.", file=sys.stderr)
        return 1

    player_path = players_dir / f"{player_id}.json"
    if not player_path.is_file():
        print(f"No existe el jugador {player_id!r}: {player_path}")
        return 1

    player_path.unlink()
    entries, warnings = rebuild_players_index(players_dir, index_path, wrapped=False)
    for warning in warnings:
        print(f"WARNING: {warning}", file=sys.stderr)

    print(f"Jugador eliminado: {player_id}")
    print(f"Jugadores restantes: {len(entries)}")
    print(f"Índice regenerado: {index_path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Elimina un jugador de data/players/.")
    parser.add_argument("player_id", help="Identificador público, por ejemplo dz-01")
    args = parser.parse_args()
    return remove_player(args.player_id)


if __name__ == "__main__":
    raise SystemExit(main())

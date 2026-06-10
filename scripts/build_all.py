#!/usr/bin/env python3
"""Convert every Excel workbook in input/ and rebuild the players index."""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from pathlib import Path

from excel_to_json import PROJECT_ROOT, convert_excel, detect_player_name
from player_index import rebuild_players_index


def generate_public_alias(real_name: str, index: int) -> str:
    """Build a stable public alias from first-name and last-name initials."""
    ascii_name = (
        unicodedata.normalize("NFKD", real_name).encode("ascii", "ignore").decode("ascii")
    )
    tokens = [token for token in ascii_name.split() if token]
    if not tokens:
        initials = "XX"
    elif len(tokens) == 1:
        initials = (tokens[0][0] * 2).upper()
    else:
        initials = f"{tokens[0][0]}{tokens[-1][0]}".upper()
    return f"{initials}-{index:02d}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Convierte todos los Excel de input/.")
    parser.add_argument(
        "--input-dir", type=Path, default=PROJECT_ROOT / "input", help="Carpeta con .xlsx"
    )
    args = parser.parse_args()

    input_dir = args.input_dir.resolve()
    files = sorted(path for path in input_dir.glob("*.xlsx") if not path.name.startswith("~$"))
    if not files:
        print(f"ERROR: no se encontraron archivos .xlsx en {input_dir}", file=sys.stderr)
        return 1

    converted = 0
    total_warnings = 0
    failed = 0
    generated_files: set[str] = set()
    aliases: dict[str, dict[str, str]] = {}
    for index, excel_path in enumerate(files, start=1):
        try:
            real_name = detect_player_name(excel_path)
            public_name = generate_public_alias(real_name, index)
            public_id = public_name.lower()
            result = convert_excel(
                excel_path,
                public_id=public_id,
                public_name=public_name,
                source_file_name=f"player-source-{public_id}.xlsx",
            )
        except (FileNotFoundError, RuntimeError) as exc:
            failed += 1
            print(f"ERROR: {excel_path.name}: {exc}", file=sys.stderr)
            continue

        aliases[public_name] = {
            "real_name": real_name,
            "source_file": excel_path.name,
        }
        generated_files.add(result.output_path.name)
        total_warnings += len(result.warnings)
        converted += 1
        print(f"OK: {public_name} -> {result.output_path.name}")

    players_dir = PROJECT_ROOT / "data" / "players"
    removed_stale = 0
    for player_path in players_dir.glob("*.json"):
        if player_path.name not in generated_files:
            player_path.unlink()
            removed_stale += 1

    private_path = PROJECT_ROOT / "private" / "player_aliases.json"
    private_path.parent.mkdir(parents=True, exist_ok=True)
    private_path.write_text(
        json.dumps(aliases, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    index_path = PROJECT_ROOT / "data" / "players_index.json"
    players, index_warnings = rebuild_players_index(index_path=index_path, wrapped=False)
    for warning in index_warnings:
        print(f"WARNING: índice: {warning}", file=sys.stderr)
    print(
        f"\nConvertidos: {converted} | Jugadores: {len(players)} | Fallidos: {failed} | "
        f"Warnings: {total_warnings} | Antiguos eliminados: {removed_stale} | "
        f"Índice: {index_path} | Mapeo privado: {private_path}"
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

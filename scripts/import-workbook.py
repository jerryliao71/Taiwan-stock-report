#!/usr/bin/env python3
"""Import the 台股 worksheet into data/stock-seeds.json using only stdlib."""

from __future__ import annotations

import argparse
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Any

NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
ROW_RANGES = ((3, 83, "上市"), (87, 130, "上櫃"))


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    values: list[str] = []
    for item in root.findall("x:si", NS):
        values.append("".join(node.text or "" for node in item.findall(".//x:t", NS)))
    return values


def cell_map(archive: zipfile.ZipFile, strings: list[str]) -> dict[str, Any]:
    root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    result: dict[str, Any] = {}
    for cell in root.findall(".//x:c", NS):
        reference = cell.attrib.get("r")
        if not reference:
            continue
        value = cell.find("x:v", NS)
        if value is None or value.text is None:
            result[reference] = None
            continue
        raw = value.text
        if cell.attrib.get("t") == "s":
            result[reference] = strings[int(raw)]
            continue
        try:
            number = float(raw)
            result[reference] = int(number) if number.is_integer() else number
        except ValueError:
            result[reference] = raw
    return result


def numeric(cells: dict[str, Any], column: str, row: int) -> float | None:
    value = cells.get(f"{column}{row}")
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace(",", ""))
        except ValueError:
            return None
    return None


def text(cells: dict[str, Any], column: str, row: int) -> str | None:
    value = cells.get(f"{column}{row}")
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def stock_code(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return str(int(value))
    normalized = str(value).strip()
    if ":" in normalized:
        normalized = normalized.rsplit(":", 1)[-1]
    if re.fullmatch(r"\d+\.0", normalized):
        normalized = normalized[:-2]
    return normalized or None


def rounded(value: float | None) -> float | None:
    return None if value is None else round(value, 8)


def import_rows(cells: dict[str, Any]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for start, end, market in ROW_RANGES:
        current_group: str | None = None
        for row in range(start, end + 1):
            code = stock_code(cells.get(f"B{row}"))
            name = text(cells, "C", row)
            if not code or not name:
                continue
            group_cell = text(cells, "A", row)
            if group_cell:
                group_cell = re.sub(r"\s+", "", group_cell)
            if market == "上市" and group_cell:
                current_group = group_cell
            group = current_group if market == "上市" else group_cell
            change_points = numeric(cells, "D", row)
            price = numeric(cells, "E", row)
            if price is None:
                raise ValueError(f"Missing price at row {row}")
            records.append({
                "code": code,
                "name": name,
                "market": market,
                "group": group,
                "sourceRow": row,
                "fallbackPrice": rounded(price),
                # Excel D stores percentage points (for example -0.66 means -0.66%).
                "fallbackChange": rounded(change_points / 100) if change_points is not None else None,
                "lowPe": rounded(numeric(cells, "J", row)),
                "highPe": rounded(numeric(cells, "K", row)),
                "note": text(cells, "N", row),
                "forecastAsOf": text(cells, "O", row),
                "eps": {
                    "2024": rounded(numeric(cells, "AB", row)),
                    "2025": rounded(numeric(cells, "Z", row)),
                    "2026": rounded(numeric(cells, "W", row)),
                    "2027": rounded(numeric(cells, "T", row)),
                    "2028": rounded(numeric(cells, "Q", row)),
                },
                "epsOld": {
                    "2025": rounded(numeric(cells, "AA", row)),
                    "2026": rounded(numeric(cells, "X", row)),
                    "2027": rounded(numeric(cells, "U", row)),
                    "2028": rounded(numeric(cells, "R", row)),
                },
            })
    return records


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--output", type=Path, default=Path("data/stock-seeds.json"))
    args = parser.parse_args()
    with zipfile.ZipFile(args.workbook) as archive:
        strings = shared_strings(archive)
        cells = cell_map(archive, strings)
    records = import_rows(cells)
    if len(records) != 125:
        raise ValueError(f"Expected 125 stock rows, found {len(records)}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(records)} stocks to {args.output}")


if __name__ == "__main__":
    main()

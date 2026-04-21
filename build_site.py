from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from pypinyin import Style, pinyin

ROOT = Path(__file__).resolve().parent
XLSX_PATH = ROOT / "抗性表.xlsx"
DATA_JSON_PATH = ROOT / "data.json"
DATA_JS_PATH = ROOT / "data.js"

SPREADSHEET_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def column_to_index(column_name: str) -> int:
    value = 0
    for char in column_name:
        if char.isalpha():
            value = value * 26 + ord(char.upper()) - 64
    return value


def parse_cell_reference(reference: str) -> tuple[int, int]:
    match = re.fullmatch(r"([A-Z]+)(\d+)", reference)
    if not match:
        raise ValueError(f"Invalid cell reference: {reference}")
    return column_to_index(match.group(1)), int(match.group(2))


def read_shared_strings(archive: ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []

    shared_strings: list[str] = []
    for item in root.findall(f"{SPREADSHEET_NS}si"):
        text_parts = [node.text or "" for node in item.iter() if node.tag == f"{SPREADSHEET_NS}t"]
        shared_strings.append("".join(text_parts))
    return shared_strings


def read_workbook_metadata(archive: ZipFile) -> tuple[str, str]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    sheet_node = workbook.find(f"{SPREADSHEET_NS}sheets/{SPREADSHEET_NS}sheet")
    if sheet_node is None:
        raise ValueError("Workbook does not contain any worksheet")
    return sheet_node.attrib["name"], "xl/worksheets/sheet1.xml"


def extract_cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    value_node = cell.find(f"{SPREADSHEET_NS}v")

    if cell_type == "inlineStr":
        text_node = cell.find(f"{SPREADSHEET_NS}is/{SPREADSHEET_NS}t")
        return (text_node.text or "").strip()

    if value_node is None:
        return ""

    value = value_node.text or ""

    if cell_type == "s":
        return shared_strings[int(value)]
    if cell_type == "b":
        return "TRUE" if value == "1" else "FALSE"
    if cell_type == "str":
        return value.strip()
    if cell_type == "e":
        return value

    return format_numeric_value(value)


def format_numeric_value(value: str) -> str:
    text = value.strip()
    if not text:
        return ""

    if re.fullmatch(r"-?\d+", text):
        return text

    if re.fullmatch(r"-?\d+\.\d+", text):
        return format(float(text), ".12g")

    return text


def load_sheet_rows(xlsx_path: Path) -> tuple[str, dict[int, list[str]]]:
    with ZipFile(xlsx_path) as archive:
        sheet_name, sheet_path = read_workbook_metadata(archive)
        shared_strings = read_shared_strings(archive)
        sheet = ET.fromstring(archive.read(sheet_path))
        dimension = sheet.find(f"{SPREADSHEET_NS}dimension")
        max_column = 0
        if dimension is not None and "ref" in dimension.attrib:
            _, end_ref = dimension.attrib["ref"].split(":")
            max_column, _ = parse_cell_reference(end_ref)

        rows: dict[int, list[str]] = {}
        for row_node in sheet.findall(f"{SPREADSHEET_NS}sheetData/{SPREADSHEET_NS}row"):
            row_number = int(row_node.attrib["r"])
            row_values = [""] * max_column
            for cell in row_node.findall(f"{SPREADSHEET_NS}c"):
                column_index, _ = parse_cell_reference(cell.attrib["r"])
                row_values[column_index - 1] = extract_cell_value(cell, shared_strings)
            rows[row_number] = row_values

        return sheet_name, rows


def normalize_text(text: str) -> str:
    return re.sub(r"[^0-9a-z\u4e00-\u9fff]+", "", text.lower())


def build_pinyin_tokens(text: str) -> list[str]:
    raw_tokens = pinyin(text, style=Style.NORMAL, heteronym=False, errors=lambda item: list(item))
    tokens: list[str] = []
    for group in raw_tokens:
        if not group:
            continue
        token = normalize_text(group[0])
        if token:
            tokens.append(token)
    return tokens


def suffix_joined_tokens(tokens: Iterable[str]) -> list[str]:
    token_list = list(tokens)
    results: list[str] = []
    for index in range(len(token_list)):
        results.append("".join(token_list[index:]))
    return results


def build_rows(raw_rows: dict[int, list[str]]) -> dict[str, object]:
    title = raw_rows.get(1, ["怪物抗性表"])[0].strip() or "怪物抗性表"
    legend = [value for value in raw_rows.get(2, []) if value]
    headers = raw_rows.get(4, [])

    rows = []
    for row_number in sorted(raw_rows):
        if row_number < 5:
            continue
        raw_row = raw_rows[row_number]
        name = raw_row[0].strip()
        if not name:
            continue

        cleaned_values = [value.strip() if isinstance(value, str) else value for value in raw_row]
        joined_text = " ".join(value for value in cleaned_values if value)
        name_tokens = build_pinyin_tokens(name)
        order = len(rows) + 1

        rows.append(
            {
                "id": order,
                "order": order,
                "sheetRow": row_number,
                "name": name,
                "values": cleaned_values,
                "search": {
                    "nameNormalized": normalize_text(name),
                    "namePinyin": "".join(name_tokens),
                    "nameInitials": "".join(token[0] for token in name_tokens if token),
                    "namePinyinSuffixes": suffix_joined_tokens(name_tokens),
                    "rowNormalized": normalize_text(joined_text),
                },
            }
        )

    return {
        "title": title,
        "sheetName": "敌人属性",
        "legend": legend,
        "headers": headers,
        "rows": rows,
    }


def main() -> None:
    sheet_name, raw_rows = load_sheet_rows(XLSX_PATH)
    data = build_rows(raw_rows)
    data["sheetName"] = sheet_name

    DATA_JSON_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    DATA_JS_PATH.write_text(
        "window.MONSTER_RESISTANCE_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )

    print(f"Wrote {DATA_JSON_PATH.name} and {DATA_JS_PATH.name} with {len(data['rows'])} rows.")


if __name__ == "__main__":
    main()

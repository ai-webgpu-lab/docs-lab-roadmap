#!/usr/bin/env python3

import argparse
import csv
import sys


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Emit inventory CSV rows as unit-separated shell-safe fields."
    )
    parser.add_argument("inventory")
    parser.add_argument(
        "--fields",
        default="repo,category,purpose,priority_group",
        help="Comma-separated field list to emit. Default: repo,category,purpose,priority_group",
    )
    args = parser.parse_args()

    separator = "\x1f"
    fields = [field.strip() for field in args.fields.split(",") if field.strip()]

    with open(args.inventory, newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            values = [
                (row.get(field, "") or "").replace("\r", " ").replace("\n", " ")
                for field in fields
            ]
            print(separator.join(values))

    return 0


if __name__ == "__main__":
    sys.exit(main())

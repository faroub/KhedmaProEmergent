"""P16 — CSV export formula-injection escaping (H11).

A name such as ``=HYPERLINK(...)`` executes when an admin opens an exported
CSV in a spreadsheet. String cells that start with ``=``, ``+``, ``-``, ``@``,
tab, or CR are prefixed with a single quote; numeric cells (e.g. negative
revenue / hourly rate) are exported unchanged.
"""
import csv
import io
import os
import uuid

import requests
from pymongo import MongoClient

from csv_safe import safe_csv_cell
from helpers import API, fresh_provider, make_admin

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

HYPERLINK = '=HYPERLINK("http://evil.example","click me")'


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _export_rows(admin: dict, kind: str):
    r = requests.get(f"{API}/admin/export/{kind}", headers=_bearer(admin["token"]), timeout=15)
    assert r.status_code == 200, r.text
    rows = list(csv.reader(io.StringIO(r.text)))
    header = rows[0]
    return header, [row for row in rows[1:] if row]


class TestSafeCsvCell:
    def test_formula_prefixes_are_quoted(self):
        assert safe_csv_cell(HYPERLINK) == "'" + HYPERLINK
        assert safe_csv_cell("+1+1") == "'+1+1"
        assert safe_csv_cell("-1") == "'-1"
        assert safe_csv_cell("@SUM(1,1)") == "'@SUM(1,1)"
        assert safe_csv_cell("\ttab-led") == "'\ttab-led"
        assert safe_csv_cell("\rCR-led") == "'\rCR-led"

    def test_plain_and_non_prefixed_cells_unchanged(self):
        assert safe_csv_cell("plain name") == "plain name"
        assert safe_csv_cell("hello = world") == "hello = world"
        assert safe_csv_cell("") == ""

    def test_numeric_cells_are_never_quoted(self):
        assert safe_csv_cell(-42) == -42
        assert safe_csv_cell(-1.5) == -1.5
        assert safe_csv_cell(0) == 0
        assert safe_csv_cell(None) is None


class TestAdminExportEscaping:
    def test_users_and_providers_exports_escape_formula_cells(self):
        admin = make_admin()
        # The provider's full_name is user-supplied text; hourly_rate is a
        # negative number that must keep exporting as a number.
        provider = fresh_provider(full_name=HYPERLINK, hourly_rate=-100)
        pid = provider["user"]["id"]

        for kind in ("users", "providers"):
            header, rows = _export_rows(admin, kind)
            name_col = header.index("full_name")
            names = {row[name_col] for row in rows if len(row) > name_col}
            assert f"'{HYPERLINK}" in names, f"{kind} export did not escape the formula cell"
            assert pid in {row[0] for row in rows if row}
            # The numeric column must NOT carry the escape quote.
            if "hourly_rate" in header:
                rate_col = header.index("hourly_rate")
                rates = {row[rate_col] for row in rows if len(row) > rate_col}
                assert not any(r.startswith("'") for r in rates)
                assert "-100.0" in rates

    def test_bookings_export_keeps_negative_numbers_raw(self):
        admin = make_admin()
        bid = f"p16-{uuid.uuid4().hex[:8]}"
        MongoClient(MONGO_URL)[DB_NAME].bookings.insert_one(
            {
                "id": bid,
                "status": "completed",
                "client_id": "p16-client",
                "provider_id": "p16-provider",
                "estimated_total": -200,
                "final_total_dzd": -4199,
            }
        )
        header, rows = _export_rows(admin, "bookings")
        final_col = header.index("final_total_dzd")
        finals = {row[final_col] for row in rows if len(row) > final_col}
        assert "'-4199" not in finals
        assert "-4199" in finals

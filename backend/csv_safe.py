"""CSV export hardening: stop spreadsheet formula injection (H11).

A name such as ``=HYPERLINK(...)`` executes when an admin opens an exported
CSV in a spreadsheet. Prefixing an apostrophe makes the cell render as text.
"""

# Characters that make Excel/LibreOffice/Google Sheets treat the cell as a
# formula when it is the first character of the value.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def safe_csv_cell(value):
    """Quote string cells that spreadsheets would evaluate as a formula.

    Numeric cells are returned unchanged so values like negative revenue keep
    exporting as numbers (``isinstance`` guard, not a string prefix test).
    """
    if isinstance(value, str) and value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value

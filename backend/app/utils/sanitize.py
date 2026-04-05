"""
VajraKavach — Input Sanitization Utilities
"""


def escape_like(value: str) -> str:
    """Escape SQL LIKE/ILIKE wildcard characters (%, _) in user input."""
    return value.replace("%", "\\%").replace("_", "\\_")

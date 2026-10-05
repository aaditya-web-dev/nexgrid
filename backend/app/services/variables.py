"""
Variable substitution service.

Resolves {{variable_name}} placeholders in request fields (URL, headers, body)
using key-value pairs loaded from an Environment's variables.

Rules
-----
- Only string values in dicts are processed (numeric/bool values are left alone).
- Unknown placeholders (no matching variable) are left as-is so the user can
  spot them easily rather than silently getting broken requests.
- Secret variables ARE resolved (their real value is used) — masking only
  applies to read API responses, not execution.
"""
import re
from sqlalchemy.orm import Session

from app.models.environment import Environment, EnvironmentVariable

# Matches  {{any_variable_name}}  including underscores and hyphens
_PLACEHOLDER_RE = re.compile(r"\{\{([\w\-]+)\}\}")


def load_variables(environment_id: int, db: Session) -> dict[str, str]:
    """
    Load all variables for the given environment as a plain dict.

    Returns: {"base_url": "https://api.dev", "token": "secret123", ...}
    Secret flag is irrelevant here — we always resolve the real value.
    """
    rows = (
        db.query(EnvironmentVariable)
        .filter(EnvironmentVariable.environment_id == environment_id)
        .all()
    )
    return {row.key: (row.value or "") for row in rows}


def substitute(text: str, variables: dict[str, str]) -> str:
    """
    Replace every {{key}} occurrence in *text* with the matching value.

    Unknown placeholders are left unchanged.

    Examples:
        substitute("{{base_url}}/login", {"base_url": "https://api.dev"})
        → "https://api.dev/login"

        substitute("{{unknown}}", {"base_url": "x"})
        → "{{unknown}}"   ← unchanged, not silently broken
    """
    def replacer(match: re.Match) -> str:
        key = match.group(1)
        return variables.get(key, match.group(0))   # fallback = original placeholder

    return _PLACEHOLDER_RE.sub(replacer, text)


def substitute_dict(mapping: dict, variables: dict[str, str]) -> dict:
    """
    Walk a flat dict (e.g. headers or query_params) and substitute
    {{placeholders}} in every string value.

    Non-string values (int, bool, None) are passed through unchanged.
    """
    return {
        k: substitute(v, variables) if isinstance(v, str) else v
        for k, v in mapping.items()
    }


def resolve_request(
    url: str,
    headers: dict,
    body: str | None,
    environment_id: int | None,
    db: Session,
) -> tuple[str, dict, str | None]:
    """
    Resolve all {{variable}} placeholders in a request's url, headers, and body.

    Args:
        url:            Raw URL string (may contain {{placeholders}}).
        headers:        Raw headers dict (values may contain {{placeholders}}).
        body:           Raw body string or None.
        environment_id: If None, no substitution is performed.
        db:             Active database session.

    Returns:
        (resolved_url, resolved_headers, resolved_body)
    """
    if environment_id is None:
        return url, headers, body

    variables = load_variables(environment_id, db)

    resolved_url = substitute(url, variables)
    resolved_headers = substitute_dict(headers or {}, variables)
    resolved_body = substitute(body, variables) if body else body

    return resolved_url, resolved_headers, resolved_body

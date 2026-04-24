import json
import re
from urllib.error import HTTPError
from typing import Any

import gspread
import pandas as pd
import streamlit as st
from gspread.exceptions import APIError, SpreadsheetNotFound, WorksheetNotFound
from google.auth.exceptions import RefreshError
from google.oauth2.service_account import Credentials

try:
    from streamlit_autorefresh import st_autorefresh
except Exception:  # pragma: no cover
    st_autorefresh = None

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]

LOG_COLUMNS = [
    "Timestamp",
    "Editor",
    "Sheet",
    "Cell",
    "Row",
    "Col",
    "Old Value",
    "New Value",
    "Formula",
]


def _read_service_account() -> dict[str, Any]:
    if "gcp_service_account" in st.secrets:
        info = dict(st.secrets["gcp_service_account"])
    elif "gcp_service_account_json" in st.secrets:
        info = json.loads(st.secrets["gcp_service_account_json"])
    elif "GCP_SERVICE_ACCOUNT_JSON" in st.secrets:
        info = json.loads(st.secrets["GCP_SERVICE_ACCOUNT_JSON"])
    else:
        raise RuntimeError(
            "Missing credentials in Streamlit secrets. "
            "Add [gcp_service_account] or GCP_SERVICE_ACCOUNT_JSON."
        )

    if "private_key" in info:
        info["private_key"] = info["private_key"].replace("\\n", "\n")

    required = ["type", "project_id", "private_key", "client_email", "token_uri"]
    missing = [key for key in required if not info.get(key)]
    if missing:
        raise RuntimeError(
            "Invalid service account secret. Missing keys: "
            + ", ".join(missing)
        )
    return info


@st.cache_resource(show_spinner=False)
def _google_client() -> gspread.Client:
    info = _read_service_account()
    creds = Credentials.from_service_account_info(info, scopes=SCOPES)
    return gspread.authorize(creds)


def _service_account_email() -> str:
    try:
        return _read_service_account().get("client_email", "unknown")
    except Exception:
        return "unknown"


def _render_auth_help(spreadsheet_id: str, log_sheet_name: str, exc: Exception) -> None:
    sa_email = _service_account_email()
    st.error("Google authentication failed while reading sheet data.")

    st.write("Action checklist:")
    st.write(f"1. In Google Sheets, share spreadsheet `{spreadsheet_id}` with `{sa_email}` as Viewer/Editor.")
    st.write("2. Verify Streamlit secrets contain a valid service-account key JSON (not OAuth client JSON).")
    st.write("3. If key was rotated/revoked in GCP, generate a new key and update secrets.")
    st.write(f"4. Confirm log worksheet name exists: `{log_sheet_name}`.")

    st.code(
        f"Service account: {sa_email}\n"
        f"Spreadsheet ID: {spreadsheet_id}\n"
        f"Log sheet: {log_sheet_name}",
        language="text",
    )
    st.exception(exc)


@st.cache_data(ttl=20, show_spinner=False)
def _load_log_data(spreadsheet_id: str, log_sheet_name: str) -> pd.DataFrame:
    ws = _google_client().open_by_key(spreadsheet_id).worksheet(log_sheet_name)
    records = ws.get_all_records()
    if not records:
        return pd.DataFrame(columns=LOG_COLUMNS)

    df = pd.DataFrame(records)
    for col in LOG_COLUMNS:
        if col not in df.columns:
            df[col] = None

    df = df[LOG_COLUMNS].copy()
    df["Timestamp"] = pd.to_datetime(df["Timestamp"], errors="coerce")
    df["Row"] = pd.to_numeric(df["Row"], errors="coerce").astype("Int64")
    df["Col"] = pd.to_numeric(df["Col"], errors="coerce").astype("Int64")
    df["Cell"] = df["Cell"].astype(str).str.upper()
    df["Sheet"] = df["Sheet"].astype(str)
    return df


@st.cache_data(ttl=10, show_spinner=False)
def _load_live_sheet(spreadsheet_id: str, live_sheet_name: str) -> pd.DataFrame:
    ws = _google_client().open_by_key(spreadsheet_id).worksheet(live_sheet_name)
    values = ws.get_all_values()
    if not values:
        return pd.DataFrame()

    max_cols = max(len(row) for row in values)
    rows = [row + [""] * (max_cols - len(row)) for row in values]
    headers = [_col_name(i + 1) for i in range(max_cols)]
    return pd.DataFrame(rows, columns=headers)


def _col_name(col_num: int) -> str:
    name = ""
    n = col_num
    while n > 0:
        n, rem = divmod(n - 1, 26)
        name = chr(65 + rem) + name
    return name


def _to_a1(row_num: int, col_num: int) -> str:
    return f"{_col_name(col_num)}{row_num}"


def _normalize_a1(cell: str) -> str:
    cleaned = cell.strip().upper().replace("$", "")
    if not cleaned:
        return ""
    return cleaned if re.fullmatch(r"[A-Z]+[1-9][0-9]*", cleaned) else ""


def _extract_selected_cell(event: Any) -> tuple[int, int] | None:
    if event is None:
        return None

    selection = None
    if isinstance(event, dict):
        selection = event.get("selection")
    elif hasattr(event, "selection"):
        selection = event.selection

    if selection is None:
        return None

    if isinstance(selection, dict):
        cells = selection.get("cells")
    elif hasattr(selection, "cells"):
        cells = selection.cells
    else:
        cells = None

    if not cells:
        return None

    first = cells[0]
    if isinstance(first, dict):
        row = first.get("row")
        col = first.get("column")
    elif isinstance(first, (list, tuple)) and len(first) >= 2:
        row, col = first[0], first[1]
    else:
        return None

    if row is None or col is None:
        return None

    return int(row) + 1, int(col) + 1


def main() -> None:
    st.set_page_config(page_title="Cell Version History", layout="wide")
    st.title("Cell Version History")
    st.caption("Click a cell in the Streamlit table to see only that cell's full edit timeline.")

    default_spreadsheet_id = st.secrets.get("audit_spreadsheet_id", "")
    default_log_sheet = st.secrets.get("audit_log_sheet", "_Version_Log")

    with st.sidebar:
        st.header("Config")
        spreadsheet_id = st.text_input("Audit Spreadsheet ID", value=default_spreadsheet_id)
        log_sheet_name = st.text_input("Log Sheet Name", value=default_log_sheet)
        auto_refresh = st.checkbox("Auto refresh", value=True)
        refresh_seconds = st.number_input("Refresh every (sec)", min_value=10, max_value=300, value=20)

        if auto_refresh and st_autorefresh is not None:
            st_autorefresh(interval=int(refresh_seconds * 1000), key="auto_refresh")
        elif auto_refresh:
            st.info("Install streamlit-autorefresh for automatic updates.")

    if not spreadsheet_id.strip():
        st.warning("Provide your audit spreadsheet ID in sidebar or secrets.")
        return

    try:
        df_log = _load_log_data(spreadsheet_id.strip(), log_sheet_name.strip())
    except SpreadsheetNotFound as exc:
        _render_auth_help(spreadsheet_id.strip(), log_sheet_name.strip(), exc)
        return
    except (RefreshError, HTTPError) as exc:
        _render_auth_help(spreadsheet_id.strip(), log_sheet_name.strip(), exc)
        return
    except APIError as exc:
        # APIError often wraps 401/403 details from Google Sheets API.
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        if status_code in (401, 403):
            _render_auth_help(spreadsheet_id.strip(), log_sheet_name.strip(), exc)
            return
        st.error("Failed to load log sheet due to Google API error.")
        st.exception(exc)
        return
    except Exception as exc:
        st.error("Failed to load log sheet. Check credentials/sharing/log sheet name.")
        st.exception(exc)
        return

    if df_log.empty:
        st.info("No logs found yet. Run Apps Script bridge and edit main sheet once.")
        return

    source_sheet_names = sorted(s for s in df_log["Sheet"].dropna().unique().tolist() if s and s != "nan")
    if not source_sheet_names:
        st.info("No valid source sheet names inside logs.")
        return

    source_sheet = st.selectbox("Main Sheet Tab", options=source_sheet_names)
    live_sheet_name = f"LIVE_{source_sheet}"[:99]

    try:
        live_df = _load_live_sheet(spreadsheet_id.strip(), live_sheet_name)
    except WorksheetNotFound as exc:
        st.warning(
            f"Live mirror sheet `{live_sheet_name}` not found in audit spreadsheet. "
            "Run Apps Script setupAuditBridge() once and edit the main sheet."
        )
        st.exception(exc)
        return
    except SpreadsheetNotFound as exc:
        _render_auth_help(spreadsheet_id.strip(), log_sheet_name.strip(), exc)
        return
    except (RefreshError, HTTPError) as exc:
        _render_auth_help(spreadsheet_id.strip(), log_sheet_name.strip(), exc)
        return
    except APIError as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        if status_code in (401, 403):
            _render_auth_help(spreadsheet_id.strip(), log_sheet_name.strip(), exc)
            return
        st.warning(
            f"Live mirror sheet `{live_sheet_name}` could not be loaded due to API error."
        )
        st.exception(exc)
        return
    except Exception as exc:
        st.warning(
            f"Live mirror sheet `{live_sheet_name}` not found in audit spreadsheet. "
            "Create it using the Apps Script bridge."
        )
        st.exception(exc)
        return

    st.subheader("Live Sheet (Click a Cell)")
    selected_a1 = st.session_state.get("selected_cell_a1", "")
    selected_row = st.session_state.get("selected_row_num", 1)

    click_supported = True
    try:
        event = st.dataframe(
            live_df,
            use_container_width=True,
            hide_index=True,
            height=420,
            key="live_grid",
            on_select="rerun",
            selection_mode="single-cell",
        )
        picked = _extract_selected_cell(event)
        if picked:
            row_num, col_num = picked
            selected_row = row_num
            selected_a1 = _to_a1(row_num, col_num)
            st.session_state["selected_cell_a1"] = selected_a1
            st.session_state["selected_row_num"] = selected_row
    except TypeError:
        click_supported = False
        st.dataframe(live_df, use_container_width=True, hide_index=True, height=420)

    if not click_supported:
        st.info("Your Streamlit version does not support cell click events. Using manual cell input fallback.")
        manual_cell = st.text_input("Cell (A1)", value=selected_a1 or "A1")
        normalized = _normalize_a1(manual_cell)
        if normalized:
            selected_a1 = normalized
            selected_row = int(re.search(r"\d+", normalized).group())
            st.session_state["selected_cell_a1"] = selected_a1
            st.session_state["selected_row_num"] = selected_row

    selected_a1 = _normalize_a1(selected_a1)
    if not selected_a1:
        st.warning("Click a cell above to load its version history.")
        return

    st.success(f"Selected cell: `{source_sheet}!{selected_a1}`")

    scope_df = df_log[df_log["Sheet"] == source_sheet].copy()
    scope_df = scope_df.sort_values("Timestamp", ascending=False)

    cell_df = scope_df[scope_df["Cell"] == selected_a1].copy()
    row_df = scope_df[scope_df["Row"] == selected_row].copy()

    top1, top2, top3 = st.columns(3)
    top1.metric("Cell Versions", len(cell_df))
    top2.metric("Row Edits", len(row_df))
    latest_ts = cell_df["Timestamp"].max() if not cell_df.empty else pd.NaT
    top3.metric("Latest Cell Edit", "-" if pd.isna(latest_ts) else str(latest_ts))

    st.subheader("Cell Version Timeline")
    st.dataframe(cell_df, use_container_width=True, hide_index=True)

    if not cell_df.empty:
        st.download_button(
            "Download This Cell History",
            data=cell_df.to_csv(index=False).encode("utf-8"),
            file_name=f"{source_sheet}_{selected_a1}_history.csv",
            mime="text/csv",
        )

    with st.expander("Row Context (same row)"):
        st.dataframe(row_df, use_container_width=True, hide_index=True)


if __name__ == "__main__":
    main()

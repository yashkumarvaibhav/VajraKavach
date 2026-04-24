# Streamlit Cell Version History (Click-to-View)

This app lets you:
- click any cell in Streamlit (from a live mirrored sheet)
- instantly see full version history for that exact cell
- view old/new values, editor, timestamp, and formula

It is designed for collaborative Google Sheets where many users edit constantly.

## 1) Architecture

- **Main sheet**: your team edits this.
- **Audit sheet**: stores:
  - `LIVE_<tab>` mirror tabs (for Streamlit cell clicking)
  - `_Version_Log` (all old/new cell changes)
  - hidden `_Shadow_*` tabs (internal snapshot for old value detection)
- **Streamlit app**: reads only from audit sheet.

## 2) Setup Google side (one time)

1. Create a new Google Sheet for audit logs.
2. Open your **main sheet** -> `Extensions` -> `Apps Script`.
3. Paste file contents from [`apps_script/main_sheet_bridge.gs`](./apps_script/main_sheet_bridge.gs).
4. Set `AUDIT_SPREADSHEET_ID` in script.
5. Run `setupAuditBridge()` once and allow permissions.

Now edits in main sheet will sync to audit sheet in near real time.

## 3) Setup Streamlit locally

```bash
cd sheet_audit_streamlit
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```

## 4) Setup Streamlit Cloud secrets

Use template from [`./.streamlit/secrets.example.toml`](./.streamlit/secrets.example.toml).

Important:
1. Put your audit sheet ID in `audit_spreadsheet_id`.
2. Add full `gcp_service_account` JSON fields.
3. Share the **audit sheet** with the service account email as Viewer.

## 5) Deploy

1. Push this folder to GitHub.
2. In Streamlit Cloud, create app with `sheet_audit_streamlit/app.py`.
3. Add secrets.
4. Deploy.

## 6) How to use

1. Open app.
2. Select source sheet tab.
3. Click any cell in the live grid.
4. App shows history for exactly that cell.

If your Streamlit version does not support cell-click events, the app falls back to manual A1 input.

## 7) 401 Unauthorized fix

If app shows `HTTP Error 401: Unauthorized`:
1. Copy `client_email` from your Streamlit secret `[gcp_service_account]`.
2. Open your **audit spreadsheet** and share it with that email as Viewer/Editor.
3. Ensure the secret is a **service account key JSON** (not OAuth app JSON).
4. If key was deleted/rotated in Google Cloud, generate a new key and update secrets.
5. Confirm `audit_spreadsheet_id` points to the audit sheet (not main sheet).

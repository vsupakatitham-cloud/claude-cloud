#!/bin/bash
# One-time setup for a fresh cloud session (safe to re-run).
#  - Playwright, pointed at the preinstalled Chromium (no browser download)
#  - pdftotext for the Hong Kong PDF, openpyxl for the Excel files
#  - Chromium must trust the session's HTTPS proxy CA, or every page fails with
#    ERR_CERT_AUTHORITY_INVALID. curl/python already trust it; Chromium reads its own NSS store.
set -euo pipefail
cd "$(dirname "$0")"
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm install --no-audit --no-fund --silent
python3 -c "import openpyxl" 2>/dev/null || pip install -q openpyxl
need_apt=()
command -v pdftotext >/dev/null || need_apt+=(poppler-utils)
command -v certutil  >/dev/null || need_apt+=(libnss3-tools)
if [ ${#need_apt[@]} -gt 0 ]; then
  apt-get install -y -q "${need_apt[@]}" >/dev/null 2>&1 || { apt-get update -q >/dev/null 2>&1 && apt-get install -y -q "${need_apt[@]}" >/dev/null; }
fi
CA=/root/.ccr/agent-proxy-ca.crt
if [ -f "$CA" ]; then
  mkdir -p "$HOME/.pki/nssdb"
  [ -f "$HOME/.pki/nssdb/cert9.db" ] || certutil -d "sql:$HOME/.pki/nssdb" -N --empty-password
  certutil -d "sql:$HOME/.pki/nssdb" -L | grep -q ccr-agent-proxy || certutil -d "sql:$HOME/.pki/nssdb" -A -t "C,," -n ccr-agent-proxy -i "$CA"
fi
echo "setup ok"

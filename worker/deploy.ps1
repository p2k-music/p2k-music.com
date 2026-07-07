<#
  p2k-music.ca  -  Cloudflare Workers one-shot deploy

  Puts the whole site live on YOUR Cloudflare account. Safe to re-run: it only
  creates what's missing and only asks for secrets it doesn't already have.

  Run it (from the project's `worker` folder, or anywhere with the full path):
      powershell -ExecutionPolicy Bypass -File worker\deploy.ps1

  It will: check Node/Wrangler -> link your Cloudflare (browser) -> create your D1
  database -> apply the schema -> set secrets -> deploy -> print your live URL.
#>

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot   # the worker/ folder

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "    [ok] $m" -ForegroundColor Green }
function Note($m) { Write-Host "    $m" -ForegroundColor DarkGray }
function Fail($m) { Write-Host "`n[X] $m" -ForegroundColor Red; exit 1 }

# --- 0. Prerequisites: Node + Wrangler ----------------------------------
Step "Checking prerequisites"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail "Node.js is not installed. Get the LTS from https://nodejs.org, then re-run this script."
}
Ok "Node $(node --version)"
if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) {
  Note "Installing Wrangler (the Cloudflare CLI)..."
  npm install -g wrangler
  if ($LASTEXITCODE -ne 0) { Fail "Couldn't install Wrangler. Run 'npm install -g wrangler' yourself, then re-run." }
}
Ok "Wrangler $(wrangler --version)"

# --- 1. Link YOUR Cloudflare account ------------------------------------
# The script has no account details baked in - it acts on whichever Cloudflare
# account you authorize here. This login is stored on your PC by Wrangler.
Step "Linking your Cloudflare account"
$who = (wrangler whoami 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0 -or $who -match 'not authenticated|not logged in') {
  Note "A browser window will open - sign in and click Allow to connect your account."
  wrangler login
  if ($LASTEXITCODE -ne 0) { Fail "Login didn't complete. Re-run and finish the browser step." }
  $who = (wrangler whoami 2>&1 | Out-String)
}
Ok "Signed in to your Cloudflare account"

# --- 2. Database (D1) ---------------------------------------------------
Step "Setting up the database (D1)"
$dbid = $null
try {
  $list = (wrangler d1 list --json 2>$null | Out-String | ConvertFrom-Json)
  $found = $list | Where-Object { $_.name -eq 'p2k-music' }
  if ($found) { $dbid = $found.uuid; Ok "Found your existing 'p2k-music' database" }
} catch { }

if (-not $dbid) {
  Note "Creating the 'p2k-music' database..."
  $create = (wrangler d1 create p2k-music 2>&1 | Out-String)
  if     ($create -match 'database_id\s*=\s*"([0-9a-fA-F-]{36})"') { $dbid = $Matches[1] }
  elseif ($create -match '"uuid"\s*:\s*"([0-9a-fA-F-]{36})"')      { $dbid = $Matches[1] }
  if (-not $dbid) { Write-Host $create; Fail "Database was created but I couldn't read its id. Copy the database_id shown above into worker\wrangler.toml, then re-run." }
  Ok "Created your database"
}

# Write the database id into wrangler.toml (no-op if already correct). UTF-8, no BOM.
$tomlPath = (Resolve-Path 'wrangler.toml').Path
$toml = Get-Content -LiteralPath $tomlPath -Raw
$patched = [regex]::Replace($toml, 'database_id\s*=\s*"[^"]*"', "database_id = `"$dbid`"")
if ($patched -ne $toml) {
  [System.IO.File]::WriteAllText($tomlPath, $patched, (New-Object System.Text.UTF8Encoding($false)))
  Ok "Linked the database to wrangler.toml"
} else { Ok "wrangler.toml already points at your database" }

Note "Applying the database schema (tables)..."
'y' | wrangler d1 execute p2k-music --remote --file schema.sql | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "Couldn't apply the schema. Check the errors above." }
Ok "Tables ready"

# --- 3. Create the Worker (so secrets can attach) -----------------------
Step "Creating the Worker on Cloudflare"
wrangler deploy | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "Initial deploy failed - see the errors above." }
Ok "Worker created"

# --- 4. Secrets (only prompts for ones not already set) -----------------
Step "Setting secrets"
$have = @()
try { $have = (wrangler secret list 2>$null | Out-String | ConvertFrom-Json) | ForEach-Object { $_.name } } catch { }

function Set-Secret($name, $value) {
  $value | wrangler secret put $name | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "Couldn't set $name" }
  Ok "$name set"
}
function Ask-Secret($name, $label) {
  if ($have -contains $name) { Ok "$name already set (skipped)"; return }
  $sec = Read-Host -Prompt "    Enter $label" -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  if ([string]::IsNullOrWhiteSpace($plain)) { Note "(left blank - $name not set)"; return }
  Set-Secret $name $plain
}

# Signing key - generated for you if you don't already have one.
if ($have -contains 'SESSION_SECRET') { Ok "SESSION_SECRET already set (skipped)" }
else {
  $gen = (node -e "console.log(require('crypto').randomBytes(48).toString('hex'))").Trim()
  Set-Secret 'SESSION_SECRET' $gen
  Note "Generated a random signing key for you."
}

Ask-Secret 'ADMIN1_PASS' 'admin password for tajallatajalla2@gmail.com'
Ask-Secret 'ADMIN2_PASS' 'admin password for aaron.styles9393@gmail.com'
Ask-Secret 'SMTP_USER'   'Gmail address that sends the login codes'
Ask-Secret 'SMTP_PASS'   'Gmail App Password (login is locked until this is set)'

Write-Host ""
$pay = Read-Host "    Add PayPal keys now for REAL payments? (y/N)"
if ($pay -match '^(y|yes)$') {
  Ask-Secret 'PAYPAL_CLIENT_ID'  'PayPal Client ID'
  Ask-Secret 'PAYPAL_SECRET'     'PayPal Secret'
  Ask-Secret 'PAYPAL_WEBHOOK_ID' 'PayPal Webhook ID (optional - Enter to skip)'
} else {
  Note "Skipping PayPal for now - the site runs in safe DEMO mode (no real charges)."
  Note "Re-run this script anytime to add the keys and switch to live payments."
}

# --- 5. Go live ---------------------------------------------------------
Step "Deploying"
$deploy = (wrangler deploy 2>&1 | Tee-Object -Variable dOut | Out-String)
if ($LASTEXITCODE -ne 0) { Fail "Deploy failed - see the errors above." }
$url = if ($deploy -match 'https://[^\s]+\.workers\.dev') { $Matches[0] } else { $null }

Step "Done!"
if ($url) {
  Write-Host "    Your site is LIVE at: $url" -ForegroundColor Green
  try {
    $h = Invoke-RestMethod "$url/api/health" -TimeoutSec 12
    Note ("Health check: ok=$($h.ok)  mode=$($h.mode)")
    if ($h.mode -eq 'demo') { Note "mode=demo -> add PayPal keys (re-run this script) to take real payments." }
  } catch { Note "Give it a few seconds, then open $url/api/health to confirm it's healthy." }
} else {
  Write-Host "    Deployed - see the *.workers.dev URL printed just above." -ForegroundColor Green
}
Write-Host "`n    Last step - put it on your domain (in the Cloudflare dashboard):" -ForegroundColor Cyan
Write-Host "      Workers & Pages -> p2k-music -> Settings -> Domains & Routes"
Write-Host "      -> Add Custom Domain -> p2k-music.ca   (then again for www.p2k-music.ca)"
Write-Host ""

<#
  Magnum - start the app and share it through a public link.

  Run from PowerShell in this folder:
      .\start-public.ps1              start everything and print the client links
      .\start-public.ps1 -Stop        stop the app, worker and tunnel
      .\start-public.ps1 -Tunnel cloudflare   use a temporary trycloudflare link instead

  Needs: Docker Desktop running, Node.js, and Tailscale (or cloudflared for -Tunnel cloudflare).
  Default: Tailscale Funnel with a permanent link (https://desktop-bilukmu.taildb8c63.ts.net) that never changes.
  The Tailscale service keeps the link up by itself; the PC only needs to be on.
#>
param(
  [switch]$Stop,
  [ValidateSet("tailscale","cloudflare")][string]$Tunnel = "tailscale",
  [string]$TailscaleUrl = "https://desktop-bilukmu.taildb8c63.ts.net",
  [string]$ReportPath = "/campaign/dloa_ifDaD-DKYASckc4AdW3gq8qj08ChdERLaWARao",
  [string]$AdminEmail = "admin@magnum.local",
  [int]$Port = 3000
)

# Native tools (wsl, taskkill, docker) print harmless warnings on stderr; the script checks
# results itself, so warnings must not stop it.
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
$dataDir  = Join-Path $PSScriptRoot ".data"
$pidFile  = Join-Path $dataDir "public-pids.txt"
$tunnelLog = Join-Path $dataDir "tunnel.log"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "`nERROR: $msg" -ForegroundColor Red; exit 1 }

# Runs a command in WSL and returns only its normal output. WSL warnings on stderr
# (e.g. "Failed to start the systemd user session") are ignored instead of stopping the script.
function Invoke-Wsl {
  $ErrorActionPreference = "Continue"
  $out = & wsl.exe @args 2>&1 | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] }
  return ($out | Out-String).Trim()
}

function Stop-Previous {
  if (Test-Path $pidFile) {
    foreach ($id in Get-Content $pidFile) {
      if ($id -match '^\d+$') { & taskkill.exe /T /F /PID $id 2>$null | Out-Null }
    }
    Remove-Item $pidFile -Force
  }
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Invoke-Wsl bash -c "pkill -f 'cloudflared tunnel' >/dev/null 2>&1; true" | Out-Null
  Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

if ($Stop) {
  Step "Stopping app, worker and tunnel"
  Stop-Previous
  Write-Host "Stopped. (Docker database containers are left running; use 'docker compose stop' to stop them too.)"
  exit 0
}

# 1. Checks ------------------------------------------------------------------
Step "Checking Docker, Node.js and the tunnel tool"
& docker info *> $null; if ($LASTEXITCODE -ne 0) { Fail "Docker isn't running. Start Docker Desktop, wait until it says 'running', then run this again." }
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
  $pnpm = "pnpm"
} elseif (Get-Command npx -ErrorAction SilentlyContinue) {
  $pnpm = "npx --yes pnpm@10.34.7"
  Write-Host "pnpm isn't installed globally - using it through npx instead."
} else {
  Fail "Neither pnpm nor Node.js (npx) was found. Install Node.js from https://nodejs.org, then run this again."
}
function Invoke-Pnpm([string]$cmdArgs) { Invoke-Expression "$pnpm $cmdArgs" }
if ($Tunnel -eq "tailscale") {
  $ts = Get-Command tailscale.exe -ErrorAction SilentlyContinue
  if (-not $ts) { $ts = Get-Command "C:\Program Files\Tailscale\tailscale.exe" -ErrorAction SilentlyContinue }
  if (-not $ts) { Fail "Tailscale isn't installed. Install it from https://tailscale.com/download, or run with -Tunnel cloudflare." }
  Write-Host "Using Tailscale Funnel."
  $winCf = $null
} else {
  # Prefer cloudflared installed on Windows (no WSL networking involved); fall back to WSL.
  $winCf = Get-Command (Join-Path $PSScriptRoot "tools\cloudflared.exe") -ErrorAction SilentlyContinue
  if (-not $winCf) { $winCf = Get-Command cloudflared.exe -ErrorAction SilentlyContinue }
  if ($winCf) {
    Write-Host "Using cloudflared on Windows."
  } else {
    $cf = Invoke-Wsl bash -lc "command -v cloudflared"
    $cf = ($cf -split "`n" | Where-Object { $_ -match 'cloudflared\s*$' } | Select-Object -First 1)
    if (-not $cf) { Fail "cloudflared isn't installed. Install it on Windows with:  winget install --id Cloudflare.cloudflared   (then open a new PowerShell window)" }
    Write-Host "Using cloudflared in WSL. (For a more reliable tunnel: winget install --id Cloudflare.cloudflared)"
  }

}

Stop-Previous

# 2. Database, Redis, storage ------------------------------------------------
Step "Starting database and Redis (Docker)"
# Only Postgres and Redis: files are stored locally (STORAGE_DRIVER=local), so MinIO isn't needed.
& docker compose up -d postgres redis
if ($LASTEXITCODE -ne 0) { Fail "docker compose up failed - see the messages above." }
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  & docker compose exec -T postgres pg_isready -U magnum -d magnum *> $null
  if ($LASTEXITCODE -eq 0) { $ok = $true; break }
  Start-Sleep 2
}
if (-not $ok) { Fail "The database didn't become ready within 60 seconds." }

# 3. Tunnel --------------------------------------------------------------------
if ($Tunnel -eq "tailscale") {
  Step "Checking the Tailscale Funnel"
  $status = (& $ts.Source funnel status 2>&1 | Out-String)
  if ($status -notmatch "127\.0\.0\.1:$Port|localhost:$Port") {
    Write-Host "Funnel isn't set up for port $Port - turning it on..."
    & $ts.Source funnel --bg $Port
    $status = (& $ts.Source funnel status 2>&1 | Out-String)
    if ($status -notmatch "127\.0\.0\.1:$Port|localhost:$Port") { Fail "Couldn't turn on Tailscale Funnel. Run once in PowerShell as Administrator:  tailscale funnel --bg $Port" }
  }
  $publicUrl = $TailscaleUrl.TrimEnd('/')
  Write-Host "Permanent link: $publicUrl" -ForegroundColor Green
} else {
  Step "Opening the Cloudflare tunnel"
  if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force }
  # WSL in its default (NAT) mode has its own network, so "localhost" inside WSL is not Windows.
  # Use Windows' address on the WSL network adapter when it exists; otherwise localhost works (mirrored mode).
  $hostIp = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.InterfaceAlias -like "vEthernet (WSL*" } | Select-Object -First 1 -ExpandProperty IPAddress
  $origin = if ($winCf -or -not $hostIp) { "localhost:$Port" } else { "${hostIp}:$Port" }
  Write-Host "Tunnel will forward to http://$origin"
  if (-not $winCf) {
    $wslLog = Invoke-Wsl wslpath -a ($tunnelLog -replace '\\','/')
    $wslLog = ($wslLog -split "`n" | Where-Object { $_ -match '^/' } | Select-Object -First 1).Trim()
  }
  $publicUrl = $null
  for ($attempt = 1; $attempt -le 3 -and -not $publicUrl; $attempt++) {
    if ($attempt -gt 1) { Write-Host "Cloudflare didn't hand out a link - trying again ($attempt of 3)..." -ForegroundColor Yellow }
    if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force -ErrorAction SilentlyContinue }
    if ($winCf) {
      $tunnel = Start-Process $winCf.Source -WindowStyle Hidden -PassThru -RedirectStandardError $tunnelLog `
        -RedirectStandardOutput "$tunnelLog.out" -ArgumentList "tunnel --no-autoupdate --url http://$origin"
    } else {
      $tunnel = Start-Process wsl.exe -WindowStyle Minimized -PassThru -ArgumentList @(
        "bash", "-c", "`"cloudflared tunnel --no-autoupdate --url http://$origin > '$wslLog' 2>&1`"")
    }
    $failed = $false
    for ($i = 0; $i -lt 30 -and -not $publicUrl -and -not $failed; $i++) {
      Start-Sleep 2
      if (Test-Path $tunnelLog) {
        $text = try { $fs = [IO.File]::Open($tunnelLog, "Open", "Read", "ReadWrite"); $sr = New-Object IO.StreamReader($fs); $sr.ReadToEnd(); $sr.Close() } catch { "" }
        $m = [regex]::Match("$text", 'https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com')
        if ($m.Success) { $publicUrl = $m.Value }
        elseif ("$text" -match 'failed to request quick Tunnel') { $failed = $true }
      }
    }
    if ($publicUrl) { $tunnel.Id | Add-Content $pidFile }
    else {
      & taskkill.exe /T /F /PID $tunnel.Id 2>$null | Out-Null
      Invoke-Wsl bash -c "pkill -f 'cloudflared tunnel' >/dev/null 2>&1; true" | Out-Null
      Start-Sleep 5
    }
  }
  if (-not $publicUrl) { Fail "Cloudflare's quick-tunnel service didn't respond after 3 tries. Wait a few minutes and run this again. Details: $tunnelLog" }
  Write-Host "Tunnel link: $publicUrl" -ForegroundColor Green
}

# 4. Point the app at the new link -------------------------------------------
Step "Updating NEXTAUTH_URL and APP_BASE_URL in .env"
$envPath = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path "$envPath.local-backup")) { Copy-Item $envPath "$envPath.local-backup" }
$envText = [IO.File]::ReadAllText($envPath)
$envText = [regex]::Replace($envText, '(?m)^NEXTAUTH_URL=.*$', "NEXTAUTH_URL=$publicUrl")
$envText = [regex]::Replace($envText, '(?m)^APP_BASE_URL=.*$', "APP_BASE_URL=$publicUrl")
[IO.File]::WriteAllText($envPath, $envText, (New-Object Text.UTF8Encoding $false))

# 5. Migrate, build, start ---------------------------------------------------
Step "Applying database migrations"
Invoke-Pnpm "db:migrate"
if ($LASTEXITCODE -ne 0) { Fail "Database migration failed - see the messages above." }

# The app runs in development mode (pnpm dev), the same way it ran from Cursor:
# production mode refuses the demo settings (mock email, local storage, dev secrets),
# and next.config.ts only allows trycloudflare links in development mode. No build needed.

Step "Starting the app and the worker (two minimized windows)"
$app = Start-Process powershell.exe -WindowStyle Minimized -PassThru -ArgumentList @(
  "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle='Magnum app'; Set-Location '$PSScriptRoot'; $pnpm dev 2>&1 | Tee-Object -FilePath '.data\app.log'")
$worker = Start-Process powershell.exe -WindowStyle Minimized -PassThru -ArgumentList @(
  "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle='Magnum worker'; Set-Location '$PSScriptRoot'; $pnpm worker 2>&1 | Tee-Object -FilePath '.data\worker.log'")
$app.Id, $worker.Id | Add-Content $pidFile

# 6. Check it works through the public link -----------------------------------
Step "Waiting for the app to start"
$localOk = $false
for ($i = 0; $i -lt 60 -and -not $localOk; $i++) {
  Start-Sleep 3
  try { if ((Invoke-WebRequest -Uri "http://localhost:$Port/login" -UseBasicParsing -TimeoutSec 60).StatusCode -eq 200) { $localOk = $true } } catch { }
}
if (-not $localOk) { Fail "The app didn't start on http://localhost:$Port. Its output is in .data\app.log (or open the 'Magnum app' window on the taskbar)." }

$fromWsl = if ($Tunnel -eq "tailscale" -or $winCf) { "200" } else { Invoke-Wsl bash -c "curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://$origin/login" }
if ($fromWsl -notmatch '200') {
  Write-Host "WSL can't reach the app at http://$origin (got '$fromWsl')." -ForegroundColor Yellow
  Write-Host "Windows Firewall is probably blocking it. Fix once, in PowerShell run as Administrator:" -ForegroundColor Yellow
  Write-Host "  New-NetFirewallRule -DisplayName 'Magnum from WSL' -Direction Inbound -RemoteAddress 172.16.0.0/12 -Protocol TCP -LocalPort $Port -Action Allow" -ForegroundColor Yellow
}

Step "Checking the public link"
$live = $false
for ($i = 0; $i -lt 40 -and -not $live; $i++) {
  Start-Sleep 3
  try {
    $r = Invoke-WebRequest -Uri "$publicUrl/login" -UseBasicParsing -TimeoutSec 10
    if ($r.StatusCode -eq 200) { $live = $true }
  } catch { }
}
if (-not $live) { Write-Host "The link isn't answering yet. Give it a minute, then open $publicUrl/login yourself." -ForegroundColor Yellow }

# 7. Message for the client --------------------------------------------------
$lines = @(
  "Magnum demo is live:",
  "",
  "Dashboard: $publicUrl/admin",
  "Sign in with $AdminEmail (password: the admin password you already have)",
  "",
  "Shared report: $publicUrl$ReportPath",
  "",
  "Each person opens the report and enters their folio number, which is also the PDF password."
)
$demoLinks = Join-Path $dataDir "demo-links.txt"
if (Test-Path $demoLinks) {
  $updated = (Get-Content $demoLinks -Raw) -replace 'https?://[^/\s]+(?=/d/)', $publicUrl
  Set-Content -Path (Join-Path $dataDir "demo-links-public.txt") -Value $updated -Encoding UTF8
  $lines += "", "(Per-person links with the new address: .data\demo-links-public.txt)"
}
$message = $lines -join "`r`n"
Set-Content -Path (Join-Path $dataDir "client-message.txt") -Value $message -Encoding UTF8
try { Set-Clipboard -Value $message } catch { }

Write-Host "`n------------------------------------------------------------" -ForegroundColor Green
Write-Host $message
Write-Host "------------------------------------------------------------" -ForegroundColor Green
Write-Host "Copied to your clipboard. Keep this PC on while the client uses the link."
Write-Host "To stop everything later:  .\start-public.ps1 -Stop"

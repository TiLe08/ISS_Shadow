# Aktualisiert diese Kopie von ISS Digital Shadow auf den neuesten Stand von GitHub (Branch main).
# Aufruf ueber "Update Version.bat" im Hauptordner. Nur ASCII in dieser Datei, damit Windows
# PowerShell 5.1 sie ohne BOM richtig liest.
#
# Zwei Wege:
#  - Git-Klon (.git vorhanden und git installiert): git pull --ff-only. Lokale Aenderungen an
#    versionierten Dateien brechen das Update ab, statt sie zu ueberschreiben.
#  - Sonst (ZIP-Download von GitHub entpackt): neuestes main.zip laden, entpacken und die
#    Programmordner spiegeln. Laufzeitdaten bleiben unberuehrt: logs/, cache/, .deps_ok,
#    Dokumentation/, node_modules/, .venv/. Den Stand (Commit, installierte Dateien im
#    Hauptordner) merkt sich das Skript in cache/update.json, damit es beim naechsten Mal
#    erkennt, ob es etwas Neues gibt, und im Hauptordner nur eigene alte Dateien entfernt.
#
# Laeuft das Programm aus diesem Ordner noch, wird es vorher ueber /__shutdown beendet.
# Haben sich server/requirements.txt geaendert, wird .deps_ok geloescht, damit die Startdatei die
# Pakete beim naechsten Start neu installiert.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # sonst sind Download und Entpacken in PS 5.1 sehr langsam
$Owner = 'TiLe08'; $Repo = 'ISS_Shadow'; $Branch = 'main'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$StateFile = Join-Path $Root 'cache\update.json'
# Ordnernamen, die nie ueberschrieben oder geloescht werden (Laufzeitdaten, lokale Dateien)
$Keep = @('logs', 'cache', 'Dokumentation', 'node_modules', '.venv', '__pycache__', '.git')

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }

function Get-LocalVersion {
    $f = Join-Path $Root 'server\launcher.py'
    if (-not (Test-Path $f)) { return '?' }
    $m = Select-String -Path $f -Pattern '^VERSION\s*=\s*"([^"]+)"' | Select-Object -First 1
    if ($m) { return $m.Matches[0].Groups[1].Value } else { return '?' }
}

function Get-ReqHash {
    $f = Join-Path $Root 'server\requirements.txt'
    if (Test-Path $f) { return (Get-FileHash $f -Algorithm SHA256).Hash } else { return '' }
}

function Stop-RunningCopy {
    # Nur die Instanz aus diesem Ordner beenden; eine aus einem anderen Ordner ersetzt der Launcher
    # beim naechsten Start ohnehin selbst.
    try {
        $info = Invoke-RestMethod -Uri 'http://localhost:8137/__alive' -TimeoutSec 2 -UseBasicParsing
    } catch { return }
    if ($info.launcher -ne 'iss-shadow') { return }
    $folder = ''
    if ($info.folder) { $folder = [IO.Path]::GetFullPath([string]$info.folder).TrimEnd('\') }
    if ($folder -ine $Root.TrimEnd('\')) { return }
    Say 'ISS Shadow is running from this folder, stopping it for the update...' 'Yellow'
    try { Invoke-RestMethod -Uri 'http://localhost:8137/__shutdown' -TimeoutSec 3 -UseBasicParsing | Out-Null } catch {}
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        try { Invoke-RestMethod -Uri 'http://localhost:8137/__alive' -TimeoutSec 1 -UseBasicParsing | Out-Null } catch { return }
    }
    throw 'ISS Shadow did not stop. Close its console window and run the update again.'
}

function Update-WithGit {
    Say 'Git copy found, updating with git pull...'
    Push-Location $Root
    try {
        $dirty = git status --porcelain --untracked-files=no
        if ($dirty) {
            Say 'You have local changes to program files:' 'Yellow'
            $dirty | ForEach-Object { Say "  $_" 'Yellow' }
            throw 'Commit or discard them (git stash), then run the update again.'
        }
        $branchNow = (git rev-parse --abbrev-ref HEAD).Trim()
        if ($branchNow -ne $Branch) { Say "Note: this copy is on branch '$branchNow', not '$Branch'. Updating '$branchNow'." 'Yellow' }
        git pull --ff-only
        if ($LASTEXITCODE -ne 0) { throw 'git pull failed (see above).' }
    } finally { Pop-Location }
}

function Read-State {
    if (Test-Path $StateFile) {
        try { return Get-Content $StateFile -Raw | ConvertFrom-Json } catch {}
    }
    return $null
}

function Update-WithZip {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $state = Read-State

    # Neuesten Commit abfragen; ist er schon installiert, nichts tun. Faellt die Abfrage aus
    # (z. B. Ratenlimit der GitHub-API), wird einfach neu geladen.
    $latest = $null
    try {
        $c = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/commits/$Branch" -TimeoutSec 15 -UseBasicParsing -UserAgent 'iss-shadow-updater'
        $latest = [string]$c.sha
    } catch {
        $code = $null
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        if ($code -eq 404) {
            throw "The GitHub repository $Owner/$Repo was not found. If it is private, the update needs it public, or use a git clone with your GitHub login (see README)."
        }
    }
    if ($latest -and $state -and $state.commit -eq $latest) {
        Say "Already up to date (commit $($latest.Substring(0,7)))." 'Green'
        return $false
    }

    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("iss_shadow_update_" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Path $tmp | Out-Null
    try {
        $zip = Join-Path $tmp 'main.zip'
        Say "Downloading the latest version from github.com/$Owner/$Repo ..."
        try {
            Invoke-WebRequest -Uri "https://github.com/$Owner/$Repo/archive/refs/heads/$Branch.zip" -OutFile $zip -UseBasicParsing -TimeoutSec 300
        } catch {
            throw "Download failed: $($_.Exception.Message). Check your internet connection. If the repository is private, see README."
        }
        Unblock-File $zip
        Say 'Unpacking...'
        Expand-Archive -Path $zip -DestinationPath (Join-Path $tmp 'x') -Force
        $src = Get-ChildItem (Join-Path $tmp 'x') -Directory | Select-Object -First 1
        if (-not $src -or -not (Test-Path (Join-Path $src.FullName 'server\launcher.py')) -or -not (Test-Path (Join-Path $src.FullName 'Start ISS Shadow.bat'))) {
            throw 'The downloaded archive does not look like ISS Shadow. Nothing was changed.'
        }
        $src = $src.FullName

        Say 'Installing files...'
        $items = Get-ChildItem $src -Force
        $names = @()
        foreach ($it in $items) {
            if ($Keep -contains $it.Name) { continue }
            $names += $it.Name
            $dst = Join-Path $Root $it.Name
            if ($it.PSIsContainer) {
                # Ordner spiegeln: neue/geaenderte Dateien kopieren, im Repository entfernte loeschen.
                # /XD schuetzt Laufzeitordner auch in Unterordnern.
                $xd = @('/XD') + $Keep
                & robocopy $it.FullName $dst /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP @xd | Out-Null
                if ($LASTEXITCODE -ge 8) { throw "Copying $($it.Name) failed (robocopy code $LASTEXITCODE). Close programs that use these files and try again." }
            } else {
                Copy-Item $it.FullName $dst -Force
            }
        }
        # Was die letzte Aktualisierung im Hauptordner angelegt hat und im Repository nicht mehr
        # existiert, entfernen (nur eigene Eintraege, nie fremde Dateien).
        if ($state -and $state.rootItems) {
            foreach ($old in $state.rootItems) {
                if ($names -contains $old -or $Keep -contains $old) { continue }
                $p = Join-Path $Root $old
                if (Test-Path -LiteralPath $p) { Say "  removing $old (no longer part of the project)"; Remove-Item -LiteralPath $p -Recurse -Force }
            }
        }

        if (-not $latest) {
            # Commit steht als Kommentar im ZIP (GitHub-Archiv); ersatzweise unbekannt lassen
            try {
                Add-Type -AssemblyName System.IO.Compression.FileSystem
                $z = [IO.Compression.ZipFile]::OpenRead($zip)
                try { if ($z.Comment -match '^[0-9a-f]{40}') { $latest = $Matches[0] } } finally { $z.Dispose() }
            } catch {}
        }
        New-Item -ItemType Directory -Path (Split-Path $StateFile) -Force | Out-Null
        @{ commit = $latest; rootItems = $names; updated = (Get-Date).ToString('s') } | ConvertTo-Json | Set-Content $StateFile -Encoding ASCII
    } finally {
        Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
    return $true
}

try {
    Say "ISS Digital Shadow - update" 'Cyan'
    Say "Folder: $Root"
    $before = Get-LocalVersion
    $reqBefore = Get-ReqHash
    Stop-RunningCopy

    $useGit = (Test-Path (Join-Path $Root '.git')) -and (Get-Command git -ErrorAction SilentlyContinue)
    if ($useGit) { Update-WithGit } else { [void](Update-WithZip) }

    if ((Get-ReqHash) -ne $reqBefore) {
        Remove-Item (Join-Path $Root '.deps_ok') -Force -ErrorAction SilentlyContinue
        Say 'Python requirements changed, they will be installed on the next start.' 'Yellow'
    }
    $after = Get-LocalVersion
    if ($after -eq $before) { Say "Version: $after" 'Green' } else { Say "Updated: v$before -> v$after" 'Green' }
    exit 0
} catch {
    Say ''
    Say "Update failed: $($_.Exception.Message)" 'Red'
    exit 1
}

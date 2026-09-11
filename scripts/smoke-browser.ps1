param([string]$Url = 'https://localhost:4173', [int]$Width = 1280)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$qaDirectory = Join-Path $projectRoot '.qa'
New-Item -ItemType Directory -Force -Path $qaDirectory | Out-Null
$chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
if (-not (Test-Path -LiteralPath $chromePath)) { throw 'Chrome is not installed at the standard Windows location.' }
$domPath = Join-Path $qaDirectory "dom-$Width.html"
$logPath = Join-Path $qaDirectory "browser-$Width.log"
$imagePath = Join-Path $qaDirectory "screen-$Width.png"
$profilePath = Join-Path $qaDirectory "profile-$Width"
$arguments = @('--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--ignore-certificate-errors', "--user-data-dir=$profilePath", "--window-size=$Width,1000", '--virtual-time-budget=15000', '--dump-dom', "--screenshot=$imagePath", $Url)
$browserProcess = Start-Process -FilePath $chromePath -ArgumentList $arguments -PassThru -WindowStyle Hidden -RedirectStandardOutput $domPath -RedirectStandardError $logPath
try { $browserProcess | Wait-Process -Timeout 60 } catch { Stop-Process -Id $browserProcess.Id -ErrorAction SilentlyContinue; throw 'Isolated browser did not finish within 60 seconds.' }
$html = Get-Content -LiteralPath $domPath -Raw
if ($html -notmatch 'Authorize USDM intent' -or $html -notmatch 'Intent Rail') { throw "App did not render. Inspect $domPath and $logPath" }
if (-not (Test-Path -LiteralPath $imagePath)) { throw 'Browser screenshot was not produced.' }
Write-Output "Rendered app at width $Width. Screenshot: $imagePath"

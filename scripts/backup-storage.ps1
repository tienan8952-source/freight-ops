<#
用法：
  .\scripts\backup-storage.ps1

把 Supabase Storage「scans」bucket 裡的所有檔案下載到 backups\storage\，
保留原本的資料夾結構。用 service_role key 認證（bucket 是 private）。

可中斷續跑：每個檔案下載前會先檢查本機是否已經有「同名且同大小」的檔案，
有的話直接跳過，所以中途 Ctrl+C 中斷後重新執行，只會續抓還沒下載完的部分。

大檔案／大量檔案分批處理：每批列出最多 1000 筆，下載時每 20 個檔案暫停一下，
避免瞬間對 Supabase 打太多請求。
#>

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$envPath = Join-Path $repoRoot '.env'

if (-not (Test-Path $envPath)) {
  Write-Error ".env 不存在（應該在 $envPath）。請先建立並填好 SUPABASE_URL / SUPABASE_SERVICE_KEY。"
  exit 1
}

$envVars = @{}
Get-Content $envPath | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
    $envVars[$matches[1]] = $matches[2]
  }
}
$url = $envVars['SUPABASE_URL']
$key = $envVars['SUPABASE_SERVICE_KEY']

if ([string]::IsNullOrWhiteSpace($url) -or [string]::IsNullOrWhiteSpace($key)) {
  Write-Error "SUPABASE_URL 或 SUPABASE_SERVICE_KEY 是空的，請先檢查 .env。"
  exit 1
}

$bucket = 'scans'
$headers = @{
  'apikey'        = $key
  'Authorization' = "Bearer $key"
  'Content-Type'  = 'application/json'
}

$destRoot = Join-Path $repoRoot 'backups\storage'
New-Item -ItemType Directory -Force -Path $destRoot | Out-Null

function Get-ObjectsRecursive {
  param([string]$Prefix)
  $body = @{ prefix = $Prefix; limit = 1000; offset = 0 } | ConvertTo-Json -Compress
  $entries = Invoke-RestMethod -Method Post -Uri "$url/storage/v1/object/list/$bucket" -Headers $headers -Body $body -UserAgent 'backup-storage.ps1/1.0'
  $files = @()
  foreach ($e in $entries) {
    $path = if ($Prefix) { "$Prefix/$($e.name)" } else { $e.name }
    if ($null -eq $e.id -and $null -eq $e.metadata) {
      # 沒有 id/metadata，視為子資料夾，往下遞迴
      $files += Get-ObjectsRecursive -Prefix $path
    } else {
      $files += [pscustomobject]@{ path = $path; size = $e.metadata.size }
    }
  }
  return $files
}

Write-Host "列出 $bucket 裡的所有檔案..."
$allFiles = Get-ObjectsRecursive -Prefix ''
Write-Host "共 $($allFiles.Count) 個檔案"

$downloaded = 0
$skipped = 0
$failed = @()
$i = 0

foreach ($f in $allFiles) {
  $i++
  $localPath = Join-Path $destRoot ($f.path -replace '/', '\')
  $localDir = Split-Path -Parent $localPath
  New-Item -ItemType Directory -Force -Path $localDir | Out-Null

  if ((Test-Path $localPath) -and $f.size -and ((Get-Item $localPath).Length -eq $f.size)) {
    $skipped++
    continue
  }

  try {
    Invoke-WebRequest -Method Get -Uri "$url/storage/v1/object/$bucket/$($f.path)" -Headers $headers -OutFile $localPath -UserAgent 'backup-storage.ps1/1.0' | Out-Null
    $downloaded++
  } catch {
    $failed += $f.path
    Write-Warning "下載失敗：$($f.path) — $($_.Exception.Message)"
  }

  if ($i % 20 -eq 0) {
    Write-Host "進度：$i / $($allFiles.Count)（已下載 $downloaded、已跳過 $skipped）"
    Start-Sleep -Milliseconds 300
  }
}

Write-Host "完成：下載 $downloaded 個、跳過（已存在）$skipped 個、失敗 $($failed.Count) 個"
if ($failed.Count -gt 0) {
  Write-Warning "失敗清單：$($failed -join ', ')"
  Write-Warning "重新執行這支腳本會自動略過已成功下載的檔案，只會重試失敗的部分。"
}

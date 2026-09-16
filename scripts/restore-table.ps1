<#
用法：
  .\scripts\restore-table.ps1 -Table maint -File backups\2026-09-16\maint.json

把 backup.ps1 匯出的某一張表的 JSON（陣列，每筆是完整的一列資料）
還原回 Supabase，做法是「只補回目前資料庫沒有的 id」——跟系統內建的
「系統維護」還原功能同一個安全原則：不會覆蓋、不會刪除已存在的資料，
所以誤刪資料後用這支腳本救援不會不小心把別人後來新增的資料蓋掉。

適用情境：某張表有幾筆資料被誤刪，想從最近一次 backup.ps1 的備份救回來。
不適用：整張表都不見了（表本身要先在 Supabase SQL Editor 用
supabase/full-schema.sql 或對應片段重建），或是要整個專案搬家（那種情境
用 supabase/full-schema.sql + 對每張表跑一次這支腳本，見 docs/recovery.md
情境二）。
#>

param(
  [Parameter(Mandatory=$true)][string]$Table,
  [Parameter(Mandatory=$true)][string]$File
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$envPath = Join-Path $repoRoot '.env'

if (-not (Test-Path $envPath)) {
  Write-Error ".env 不存在（應該在 $envPath）。"
  exit 1
}
if (-not (Test-Path $File)) {
  Write-Error "找不到備份檔：$File"
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

$headers = @{
  'apikey'        = $key
  'Authorization' = "Bearer $key"
  'Content-Type'  = 'application/json'
}

$backupRows = Get-Content $File -Raw | ConvertFrom-Json
if ($null -eq $backupRows) { $backupRows = @() }

Write-Host "備份檔裡有 $($backupRows.Count) 筆 [$Table] 資料"

$existing = Invoke-RestMethod -Method Get -Uri "$url/rest/v1/$Table`?select=id" -Headers $headers -UserAgent 'restore-table.ps1/1.0'
$existingIds = @{}
foreach ($r in $existing) { $existingIds[$r.id] = $true }

$added = 0
$skipped = 0
foreach ($row in $backupRows) {
  if ($existingIds.ContainsKey($row.id)) { $skipped++; continue }
  $body = $row | ConvertTo-Json -Depth 20 -Compress
  # 跟 notify.ps1 同一個坑：Invoke-RestMethod 傳字串 -Body 會用系統編碼重送，中文會壞掉，
  # 一律轉成 UTF-8 位元組陣列再送。
  $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  try {
    Invoke-RestMethod -Method Post -Uri "$url/rest/v1/$Table" -Headers $headers -Body $bodyBytes -UserAgent 'restore-table.ps1/1.0' | Out-Null
    $added++
  } catch {
    Write-Warning "還原這筆失敗（id=$($row.id)）：$($_.Exception.Message)"
  }
}

Write-Host "還原完成：補回 $added 筆，略過 $skipped 筆（已存在，不覆蓋）"

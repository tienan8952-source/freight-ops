<#
用法：
  .\scripts\notify.ps1 -Level action -Title "需要執行 SQL" -Body "說明文字"

需要 repo 根目錄的 .env 裡填好 SUPABASE_SERVICE_KEY（service_role key，
在 Supabase 後台 Project Settings -> API -> service_role secret 取得）。
這把 key 會繞過 RLS，只能留在本機 .env（已加入 .gitignore），絕對不要提交或外流。
#>
param(
  [Parameter(Mandatory=$true)][ValidateSet('action','info','done')][string]$Level,
  [Parameter(Mandatory=$true)][string]$Title,
  [string]$Body = '',
  [string]$Session = ''
)

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
  Write-Error "SUPABASE_URL 或 SUPABASE_SERVICE_KEY 是空的。請到 Supabase 後台 Project Settings -> API 複製 service_role secret key，填進 .env 的 SUPABASE_SERVICE_KEY。"
  exit 1
}

if ([string]::IsNullOrWhiteSpace($Session)) {
  $sessionFile = Join-Path $scriptDir '.session-id'
  if (Test-Path $sessionFile) {
    $Session = (Get-Content $sessionFile -Raw).Trim()
  }
  if ([string]::IsNullOrWhiteSpace($Session)) {
    $Session = [guid]::NewGuid().ToString()
    Set-Content -Path $sessionFile -Value $Session -NoNewline
  }
}

$payload = @{ level = $Level; title = $Title; body = $Body; session = $Session } | ConvertTo-Json -Compress

$headers = @{
  'apikey'        = $key
  'Authorization' = "Bearer $key"
  'Content-Type'  = 'application/json'
  'Prefer'        = 'return=representation'
}

try {
  # Supabase 會擋掉「看起來像瀏覽器」的 secret key 請求；Invoke-RestMethod 預設的 User-Agent
  # 會被誤判，明確帶一個非瀏覽器的 User-Agent 才不會被拒絕（401 Forbidden use of secret API key in browser）。
  #
  # Windows PowerShell 5.1 的 Invoke-RestMethod 在 -Body 傳字串時，會用系統預設編碼（不是 UTF-8）
  # 重新編碼再送出，中文內容會變亂碼（不是 Supabase 端顯示問題，是這裡送出前就壞了）。
  # 一律先轉成 UTF-8 位元組陣列再送，才能正確送出中文。
  $payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  Invoke-RestMethod -Method Post -Uri "$url/rest/v1/agent_alerts" -Headers $headers -Body $payloadBytes -UserAgent 'notify.ps1/1.0' | Out-Null
  Write-Host "已送出通知：[$Level] $Title"
} catch {
  Write-Error "送出失敗：$($_.Exception.Message)"
  exit 1
}

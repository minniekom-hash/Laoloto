# ติดตั้ง/ถอน งานอัปเดตผลหวยลาวอัตโนมัติ (Windows Task Scheduler)
# ใช้:  powershell -ExecutionPolicy Bypass -File install_task.ps1
# ถอน: powershell -ExecutionPolicy Bypass -File install_task.ps1 -Remove
param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$times = @('20:35', '21:00', '21:30', '22:00')
$prefix = 'LaoLottoUpdate-'

if ($Remove) {
  foreach ($t in $times) {
    $name = $prefix + ($t -replace ':', '')
    if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
      Unregister-ScheduledTask -TaskName $name -Confirm:$false
      Write-Host "removed $name" -ForegroundColor Yellow
    }
  }
  return
}

$py = (Get-Command python -ErrorAction Stop).Source

foreach ($t in $times) {
  $name = $prefix + ($t -replace ':', '')
  $action = New-ScheduledTaskAction -Execute $py -Argument 'update.py' -WorkingDirectory $dir
  $trigger = New-ScheduledTaskTrigger -Daily -At $t
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
    -Description 'อัปเดตผลหวยลาวจาก Sanook (raw.json/data.js/verify.js)' -Force | Out-Null
  Write-Host "installed $name at $t" -ForegroundColor Green
}

Write-Host ''
Write-Host 'ตรวจสอบ:  Get-ScheduledTask -TaskName "LaoLottoUpdate-*" | Format-Table TaskName,State' -ForegroundColor Cyan

# 知之 CLI 安装脚本（Windows PowerShell），由服务端渲染。
$ErrorActionPreference = 'Stop'

$ServerUrl = '__ZHIZHI_BASE_URL__'
$BaseUrl = if ($env:ZHIZHI_BASE_URL) { $env:ZHIZHI_BASE_URL } else { $ServerUrl }
$BinDir = if ($env:ZHIZHI_BIN_DIR) { $env:ZHIZHI_BIN_DIR } else { Join-Path $env:LOCALAPPDATA 'zhizhi\bin' }

if ($BaseUrl -match '^http://') {
  if ($BaseUrl -ne $ServerUrl -and $env:ZHIZHI_ALLOW_HTTP -ne '1') {
    throw "base url must be https (set ZHIZHI_ALLOW_HTTP=1 to override): $BaseUrl"
  }
  Write-Warning 'installing over plain HTTP — tokens will be transmitted unencrypted'
}

$Target = 'x86_64-pc-windows-msvc'
$Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("zhizhi-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $Tmp | Out-Null
try {
  $Latest = Invoke-RestMethod "$BaseUrl/dl/latest.json"
  $Artifact = $Latest.artifacts | Where-Object { $_.target -eq $Target } | Select-Object -First 1
  if (-not $Artifact) { throw "no build for $Target" }

  # 清单里的 url 是相对路径，跟着服务地址走，部署换域名不用重新发布。
  # PowerShell 不会自动把相对 URI 拼到 base 上，这里要手动处理。
  $ArtifactUrl = $Artifact.url
  if ($ArtifactUrl -notmatch '^https?://') {
    $ArtifactUrl = if ($ArtifactUrl.StartsWith('/')) { "$BaseUrl$ArtifactUrl" } else { "$BaseUrl/$ArtifactUrl" }
  }

  $Zip = Join-Path $Tmp 'zhizhi.zip'
  Invoke-WebRequest $ArtifactUrl -OutFile $Zip
  $Got = (Get-FileHash $Zip -Algorithm SHA256).Hash.ToLower()
  if ($Got -ne $Artifact.sha256) { throw "sha256 mismatch (got $Got, expected $($Artifact.sha256))" }

  Expand-Archive $Zip -DestinationPath $Tmp -Force
  New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
  Copy-Item (Join-Path $Tmp 'zhizhi.exe') (Join-Path $BinDir 'zhizhi.exe') -Force

  $UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($UserPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable('Path', "$UserPath;$BinDir", 'User')
    Write-Host "已把 $BinDir 加入用户 PATH，重开终端后生效。"
  }
  Write-Host "已安装 $BinDir\zhizhi.exe"
  Write-Host '下一步：zhizhi skill install'
}
finally {
  Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue
}

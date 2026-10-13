# Release build, same steps as .github/workflows/release.yml. Output: dist\Repak-X-Caleb\REPAK-X.exe
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
# vswhere: the .NET NativeAOT linker step calls it to find MSVC
$env:PATH = "$env:USERPROFILE\.cargo\bin;${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer;$env:PATH"

function Run([scriptblock]$cmd) { & $cmd; if ($LASTEXITCODE -ne 0) { throw "Failed: $cmd" } }

Run { dotnet publish UAssetToolRivals/src/UAssetTool/UAssetToolNative.csproj -c Release -r win-x64 -p:DebugType=none -p:DebugSymbols=false -o target/uassettool }
Push-Location repak-x
Run { npm install }
Run { npm run build }
Pop-Location
$env:SKIP_UASSET_TOOL_BUILD = '1'
Run { cargo build --release --target x86_64-pc-windows-msvc --features custom-protocol }

$out = 'dist\Repak-X-Caleb'
New-Item -ItemType Directory -Force "$out\data" | Out-Null
Copy-Item target\x86_64-pc-windows-msvc\release\REPAK-X.exe $out -Force
Copy-Item target\uassettool\* $out -Recurse -Force
Remove-Item "$out\*.pdb", "$out\UAssetTool.exe" -ErrorAction SilentlyContinue
Copy-Item repak-x\src\data\character_data.json "$out\data" -Force
Write-Host "Built: $out\REPAK-X.exe" -ForegroundColor Green

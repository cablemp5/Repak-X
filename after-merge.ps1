# After a pull request merges: back on an up-to-date main, its branch deleted. T3 runs this when a thread settles (the
# project action "After merge", with Run on settle); by hand: .\after-merge.ps1
# A local branch goes only when GitHub merged its pull request at exactly the branch's tip, so unpushed commits stay.
# Uncommitted changes are never touched: a switch or pull that would need to stops the script instead.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
# PowerShell 5.1 does not stop on a failed git or gh: check their exit codes
function Run([scriptblock]$cmd) { & $cmd; if ($LASTEXITCODE -ne 0) { throw "Failed: $cmd" } }

Run { git fetch --prune --quiet origin }
# "<branch><tab><commit>" per merged pull request: squash merges hide them from git branch -d, so GitHub decides
$merged = @(Run { gh pr list -R cablemp5/repak-xtra --state merged --limit 200 --json headRefName,headRefOid -q '.[] | [.headRefName, .headRefOid] | @tsv' })
$isMerged = { param($b) $merged -contains "$b`t$(git rev-parse $b)" }

$here = git rev-parse --abbrev-ref HEAD
if ($here -ne 'main' -and (& $isMerged $here)) { Run { git switch --quiet main }; $here = 'main' }
if ($here -eq 'main') { Run { git pull --ff-only --quiet } }
foreach ($b in @(git for-each-ref --format='%(refname:short)' refs/heads)) {
    if ($b -in 'main', 'upstream', $here) { continue }
    if (& $isMerged $b) { Run { git branch -D $b | Out-Null }; Write-Host "Deleted $b (its pull request is merged)" }
}
Write-Host "On $here at $(git log -1 --format='%h %s')" -ForegroundColor Green

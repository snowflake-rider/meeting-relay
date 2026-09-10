# Windows PowerShell 5.1 / PowerShell 7. Forward options to the shared launcher.
$launcher = Join-Path $PSScriptRoot 'launch.py'
if (Get-Command py -CommandType Application -ErrorAction SilentlyContinue) {
    & py -3 $launcher @args
} elseif (Get-Command python -CommandType Application -ErrorAction SilentlyContinue) {
    & python $launcher @args
} else {
    Write-Error 'Python 3 is required. Install Python and reopen PowerShell.'
    exit 1
}
exit $LASTEXITCODE

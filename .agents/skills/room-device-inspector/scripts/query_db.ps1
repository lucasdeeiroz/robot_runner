param(
    [string]$DbPath = ".local_db\autoreply_plain.db",
    [string]$Sql = "",
    [string]$Table = "memories",
    [int]$Limit = 20
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pyScript = Join-Path $scriptDir "query_db.py"

$argsList = @("--db-path", $DbPath, "--limit", "$Limit")
if ($Sql) {
    $argsList += @("--sql", $Sql)
} else {
    $argsList += @("--table", $Table)
}

python $pyScript @argsList

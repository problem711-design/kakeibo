$extractedDir = "C:\Users\user\AndroidStudioProjects\kakeibo\.artifacts\cdc89398-083c-495e-a403-af7deb953fd4\scratch\extracted_zip"
$currentDir = "C:\Users\user\AndroidStudioProjects\kakeibo"

$files = @(
    "app\src\main\assets\app.js",
    "app\src\main\assets\index.html",
    "app\src\main\assets\style.css",
    "app\src\main\java\com\my\myapplication\MainActivity.kt",
    "app\src\main\java\com\my\myapplication\DatabaseHelper.kt",
    "app\build.gradle.kts",
    "app\src\main\AndroidManifest.xml",
    "README.md",
    "metadata.json"
)

foreach ($f in $files) {
    $p1 = Join-Path $extractedDir $f
    $p2 = Join-Path $currentDir $f
    if ((Test-Path $p1) -and (Test-Path $p2)) {
        $diff = Compare-Object (Get-Content $p2 -Encoding utf8) (Get-Content $p1 -Encoding utf8)
        if ($diff) {
            Write-Host "=== DIFFERENCE FOUND IN: $f ===" -ForegroundColor Yellow
            $diff | Select-Object -First 10
        } else {
            Write-Host "--- NO DIFF: $f ---" -ForegroundColor Green
        }
    } elseif (Test-Path $p1) {
        Write-Host "New file in zip: $f" -ForegroundColor Cyan
    } else {
        Write-Host "File missing: $f" -ForegroundColor Red
    }
}

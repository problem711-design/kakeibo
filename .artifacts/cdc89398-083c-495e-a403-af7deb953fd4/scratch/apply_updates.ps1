$extractedDir = "C:\Users\user\AndroidStudioProjects\kakeibo\.artifacts\cdc89398-083c-495e-a403-af7deb953fd4\scratch\extracted_zip"
$currentDir = "C:\Users\user\AndroidStudioProjects\kakeibo"

$filesToCopy = @(
    "app\src\main\assets\app.js",
    "app\src\main\assets\index.html",
    "app\src\main\assets\style.css",
    "app\src\main\java\com\my\myapplication\MainActivity.kt",
    "app\src\main\java\com\my\myapplication\DatabaseHelper.kt",
    "app\build.gradle.kts",
    "README.md",
    "metadata.json"
)

foreach ($f in $filesToCopy) {
    $src = Join-Path $extractedDir $f
    $dst = Join-Path $currentDir $f
    if (Test-Path $src) {
        $dstDir = Split-Path $dst
        if (-not (Test-Path $dstDir)) {
            New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
        }
        Copy-Item $src $dst -Force
        Write-Host "Updated: $f" -ForegroundColor Green
    } else {
        Write-Host "Source file not found in zip: $f" -ForegroundColor Red
    }
}

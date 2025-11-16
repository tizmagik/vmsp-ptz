# Download nircmd utility from NirSoft
# nircmd is used for setting the default audio device when playing bell sounds

Write-Host "Downloading nircmd from NirSoft..."

$zipPath = "nircmd.zip"
$downloadUrl = "https://www.nirsoft.net/utils/nircmd.zip"

try {
    # Download the zip file
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath
    
    # Extract the zip file
    Expand-Archive -Path $zipPath -DestinationPath "." -Force
    
    # Move executables to project root (they extract to root already)
    if (Test-Path ".\nircmd.exe") {
        Write-Host "✓ nircmd.exe extracted"
    }
    
    if (Test-Path ".\nircmdc.exe") {
        Write-Host "✓ nircmdc.exe extracted"
    }
    
    # Clean up
    Remove-Item $zipPath -Force
    Remove-Item "NirCmd.chm" -ErrorAction SilentlyContinue
    
    Write-Host "✓ nircmd downloaded successfully!" -ForegroundColor Green
}
catch {
    Write-Host "✗ Failed to download nircmd: $_" -ForegroundColor Red
    exit 1
}

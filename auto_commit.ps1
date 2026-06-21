$folderToWatch = "D:\intern_project"
$gitExecutable = "d:\git hub\Git\cmd\git.exe"

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $folderToWatch
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

# Filter out the .git folder to prevent infinite loops
$action = {
    $path = $Event.SourceEventArgs.FullPath
    if ($path -notmatch "\\\.git\\") {
        Write-Host "Change detected in $path. Committing and pushing..."
        
        # Change directory
        Set-Location $folderToWatch
        
        # Run git commands
        & $gitExecutable add .
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        & $gitExecutable commit -m "Auto-commit: $timestamp"
        
        # Push to remote
        & $gitExecutable push origin main
        
        Write-Host "Done."
    }
}

Register-ObjectEvent $watcher "Changed" -Action $action
Register-ObjectEvent $watcher "Created" -Action $action
Register-ObjectEvent $watcher "Deleted" -Action $action
Register-ObjectEvent $watcher "Renamed" -Action $action

Write-Host "Watching $folderToWatch for changes. Press Ctrl+C to stop."
while ($true) {
    Start-Sleep -Seconds 1
}

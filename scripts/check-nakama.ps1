# Quick check that Nakama is reachable (run after: docker compose up -d)
$uri = "http://127.0.0.1:7350/healthcheck"
try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $uri -TimeoutSec 5
    Write-Host "OK: $uri -> $($r.StatusCode)" -ForegroundColor Green
    Write-Host $r.Content
} catch {
    Write-Host "FAIL: could not reach Nakama at $uri" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host "Is Docker Desktop running? Try: docker compose ps"
    exit 1
}

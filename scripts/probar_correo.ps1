$ErrorActionPreference = "Stop"
foreach ($nombre in @("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_ACCESS_TOKEN")) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($nombre))) {
    throw "Configura la variable de entorno $nombre antes de ejecutar la prueba."
  }
}
$url = "$($env:SUPABASE_URL.TrimEnd('/'))/functions/v1/revisar-inventario/correo/prueba"
$headers = @{
  "Authorization" = "Bearer $env:SUPABASE_ACCESS_TOKEN"
  "apikey" = $env:SUPABASE_ANON_KEY
  "Content-Type" = "application/json"
}
$respuesta = Invoke-RestMethod -Method Post -Uri $url -Headers $headers -Body "{}"
$respuesta | ConvertTo-Json -Depth 8
Write-Host "Consulta el historial para ver la fila registrada y calcula el intervalo con created_at/sent_at."

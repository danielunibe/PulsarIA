# -*- coding: utf-8 -*-
with open(r'C:\Users\danie\Desktop\Pulsaria\src-tauri\src\main.rs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix the broken lines (462-469 in 0-indexed: 461-468)
# Replace lines 461-468 (0-indexed) with correct code
lines[461] = '            let api_state_clone = api_state.clone();\n'
lines[462] = '            tauri::async_runtime::spawn(async move {\n'
lines[463] = '                let api_port: u16 = std::env::var(" PULSAR_API_PORT\)\n'
lines[464] = ' .ok()\n'
lines[465] = ' .and_then(|p| p.parse().ok())\n'
lines[466] = ' .unwrap_or(8080);\n'
lines[467] = ' gateway::start_api_server(api_port, api_state_clone).await;\n'
lines[468] = ' });\n'

with open(r'C:\Users\danie\Desktop\Pulsaria\src-tauri\src\main.rs', 'w', encoding='utf-8') as f:
 f.writelines(lines)

print('Done')
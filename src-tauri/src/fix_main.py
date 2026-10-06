# -*- coding: utf-8 -*-
with open(r'C:\Users\danie\Desktop\Pulsaria\src-tauri\src\main.rs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

insert_lines = [
    '            let api_state_clone = api_state.clone();\n',
    '            tauri::async_runtime::spawn(async move {\n',
    '                let api_port: u16 = std::env::var(" PULSAR_API_PORT\)\n',
 ' .ok()\n',
 ' .and_then(|p| p.parse().ok())\n',
 ' .unwrap_or(8080);\n',
 ' gateway::start_api_server(api_port, api_state_clone).await;\n',
 ' });\n',
 '\n'
]

new_lines = lines[:461] + insert_lines + lines[461:]

with open(r'C:\Users\danie\Desktop\Pulsaria\src-tauri\src\main.rs', 'w', encoding='utf-8') as f:
 f.writelines(new_lines)

print('Done')
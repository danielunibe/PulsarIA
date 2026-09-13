"""
daemon.py — Punto de entrada del modo demonio de workers de Pulsaria.
Alias de main.py para compatibilidad con el empaquetado de Tauri (tauri.conf.json).
"""
from main import main

if __name__ == "__main__":
    main()

#!/bin/bash
echo "Iniciando servicio Python de automatización GBA..."
cd "$(dirname "$0")"
python3 api_server.py


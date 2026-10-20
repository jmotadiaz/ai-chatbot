"""Hace importable `catalog.py` (raíz del paquete) desde los tests de pytest."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

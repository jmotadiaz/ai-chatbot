"""Lógica pura del Model Catalog (importable sin litellm/fastapi).

Transforma el `model_list` de `config.yaml` en el esquema normalizado que
publica `GET /v1/models/catalog` (ver `CONTRACT.md` en este paquete, que
espeja `.scratch/model-gateway/spec.md` §2.2). Este módulo NO importa
fastapi ni litellm: `server.py` hace las imports pesadas dentro de su fábrica
de app para que los tests puedan ejecutarse solo con pyyaml/pytest.

Claves de coste en `model_info` (nativas de LiteLLM, POR TOKEN):
  input_cost_per_token, output_cost_per_token,
  cache_read_input_token_cost, cache_creation_input_token_cost.
El JSON del catálogo las re-expresa POR MILLÓN (unidades del catálogo original
de `packages/models`), bajo `cost.{input,output,cacheRead,cacheWrite}`.
"""

from __future__ import annotations

import hmac
from pathlib import Path
from typing import Any

import yaml

PACKAGE_ROOT = Path(__file__).resolve().parent
CONFIG_PATH = PACKAGE_ROOT / "config.yaml"

# Esquema exacto de cada GatewayModelEntry (orden fijo, tipos cerrados).
_ENTRY_KEYS = (
    "id",
    "company",
    "isDefault",
    "contextWindow",
    "maxTokens",
    "cost",
    "reasoning",
    "thinkingLevels",
    "defaultThinkingLevel",
    "supportedFiles",
    "supportedOutput",
    "zeroDataRetention",
    "temperature",
    "topP",
    "topK",
)

_COST_KEYS = ("input", "output", "cacheRead", "cacheWrite")

# model_info (por token) -> cost JSON (por millón).
_COST_INFO_TO_PER_MILLION = {
    "input": "input_cost_per_token",
    "output": "output_cost_per_token",
    "cacheRead": "cache_read_input_token_cost",
    "cacheWrite": "cache_creation_input_token_cost",
}


def load_config(path: str | Path = CONFIG_PATH) -> dict[str, Any]:
    """Lee el config.yaml del Gateway (fuente de verdad stateless)."""
    with open(path, "r", encoding="utf-8") as fh:
        config = yaml.safe_load(fh)
    if not isinstance(config, dict) or not isinstance(config.get("model_list"), list):
        raise ValueError(f"{path}: se esperaba un mapping con 'model_list'")
    return config


def _cost_per_million(info: dict[str, Any]) -> dict[str, float]:
    return {
        key: round((info.get(info_key) or 0) * 1_000_000, 12)
        for key, info_key in _COST_INFO_TO_PER_MILLION.items()
    }


def build_entry(model: dict[str, Any]) -> dict[str, Any]:
    """Normaliza una entrada de `model_list` a un GatewayModelEntry."""
    name = model["model_name"]
    info: dict[str, Any] = model.get("model_info") or {}
    entry = {
        "id": name,
        "company": info.get("company"),
        "isDefault": bool(info.get("is_default", False)),
        "contextWindow": info.get("context_window"),
        "maxTokens": info.get("max_output_tokens"),
        "cost": _cost_per_million(info),
        "reasoning": bool(info.get("reasoning", False)),
        "thinkingLevels": list(info.get("thinking_levels") or []),
        "defaultThinkingLevel": info.get("default_thinking_level"),
        "supportedFiles": list(info.get("supported_files") or []),
        "supportedOutput": list(info.get("supported_output") or ["text"]),
        "zeroDataRetention": bool(info.get("zero_data_retention", False)),
        "temperature": info.get("default_temperature"),
        "topP": info.get("default_top_p"),
        "topK": info.get("default_top_k"),
    }
    if set(entry) != set(_ENTRY_KEYS):
        raise AssertionError(f"{name}: esquema de entry inesperado")
    return entry


def build_catalog(
    config: dict[str, Any],
    include_internal: bool = False,
) -> dict[str, list[dict[str, Any]]]:
    """Construye la respuesta del endpoint del catálogo.

    Filtra en servidor: solo `model_info.user_invocable == true` salvo
    `include_internal=True` (inspección de los contratos `*-default`).
    Nunca expone `litellm_params` ni `model_info` crudo.
    """
    models = [
        build_entry(model)
        for model in config["model_list"]
        if include_internal or (model.get("model_info") or {}).get("user_invocable") is True
    ]
    return {"models": models}


def authorize(header: str | None, expected_api_key: str | None) -> bool:
    """Valida `Authorization: Bearer <MODEL_GATEWAY_API_KEY>`.

    Comparación en tiempo constante; False si falta la cabecera, el esquema no
    es Bearer, la clave esperada no está configurada o no coincide.
    """
    if not header or not expected_api_key:
        return False
    scheme, _, token = header.partition(" ")
    # El esquema es case-insensitive (RFC 7235).
    if scheme.lower() != "bearer" or not token:
        return False
    return hmac.compare_digest(token, expected_api_key)

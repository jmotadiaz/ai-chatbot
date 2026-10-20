"""Tests del Model Catalog del Model Gateway (spec §2.2 / contrato §1).

Solo importan lógica pura (`catalog.py`): no requieren litellm ni fastapi.
"""

from __future__ import annotations

import copy
from pathlib import Path

import pytest

from catalog import authorize, build_catalog, build_entry, load_config

REPO_ROOT = Path(__file__).resolve().parents[3]
CONFIG_PATH = Path(__file__).resolve().parents[1] / "config.yaml"

INVOCABLE_IDS = [
    "Deepseek v4.1 Flash",
    "Kimi K3",
    "MiniMax M3",
    "Qwen 3.8 Flash",
    "Qwen 3.8 Max",
    "MiMo V2.6 Flash",
    "MiMo V2.6 Pro",
    "Muse Spark 1.3",
    "GLM 5.3",
    "Hy3",
    "GLM 5.3 Flash",
    "Step 5 Preview Free",
    "Haiku",
    "Gemini 4 Argon",
]

DEFAULT_CONTRACTS = [
    "fast-default",
    "flash-default",
    "vision-default",
    "reasoning-default",
    "free-default",
    "image-default",
    "embedding-default",
    "rerank-default",
    "decision-default",
    "tts-default",
]

ENTRY_KEYS = {
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
}


@pytest.fixture(scope="module")
def config():
    return load_config(CONFIG_PATH)


@pytest.fixture(scope="module")
def catalog(config):
    return build_catalog(copy.deepcopy(config))


# --- filtrado en servidor -------------------------------------------------


def test_catalog_returns_exactly_the_14_user_invocable_models_in_order(catalog):
    assert [m["id"] for m in catalog["models"]] == INVOCABLE_IDS


def test_no_default_contract_leaks_into_the_user_catalog(catalog):
    ids = {m["id"] for m in catalog["models"]}
    assert not ids & set(DEFAULT_CONTRACTS)
    assert all(not m["id"].endswith("-default") for m in catalog["models"])


def test_include_internal_exposes_the_default_contracts(config):
    catalog = build_catalog(config, include_internal=True)
    ids = {m["id"] for m in catalog["models"]}
    assert ids == set(INVOCABLE_IDS) | set(DEFAULT_CONTRACTS)


def test_exactly_one_default_and_it_is_the_first_chat_model(catalog):
    defaults = [m for m in catalog["models"] if m["isDefault"]]
    assert [m["id"] for m in defaults] == ["Deepseek v4.1 Flash"]


# --- esquema normalizado exacto -------------------------------------------


def test_entry_schema_exact_keys(catalog):
    for model in catalog["models"]:
        assert set(model) == ENTRY_KEYS, model["id"]


def test_entry_types(catalog):
    for model in catalog["models"]:
        mid = model["id"]
        assert isinstance(model["id"], str)
        assert isinstance(model["company"], str) and model["company"]
        assert isinstance(model["isDefault"], bool)
        assert isinstance(model["contextWindow"], int) and model["contextWindow"] > 0
        assert isinstance(model["maxTokens"], int) and model["maxTokens"] > 0
        assert isinstance(model["reasoning"], bool)
        assert isinstance(model["thinkingLevels"], list)
        assert all(isinstance(l, str) and l for l in model["thinkingLevels"])
        assert model["defaultThinkingLevel"] is None or isinstance(
            model["defaultThinkingLevel"], str
        )
        assert isinstance(model["supportedFiles"], list)
        assert all(f in ("img", "pdf") for f in model["supportedFiles"])
        assert isinstance(model["supportedOutput"], list)
        assert all(o in ("text", "img") for o in model["supportedOutput"])
        assert isinstance(model["zeroDataRetention"], bool)
        for key in ("temperature", "topP", "topK"):
            assert model[key] is None or isinstance(model[key], (int, float)), (mid, key)


def test_cost_schema_and_units_per_million(catalog):
    kimi = next(m for m in catalog["models"] if m["id"] == "Kimi K3")
    # Catálogo original por millón: input 3, output 15, cacheRead 0.3, cacheWrite 0.
    assert kimi["cost"] == {"input": 3, "output": 15, "cacheRead": 0.3, "cacheWrite": 0}
    for model in catalog["models"]:
        assert set(model["cost"]) == {"input", "output", "cacheRead", "cacheWrite"}
        assert all(isinstance(v, (int, float)) and v >= 0 for v in model["cost"].values())


def test_thinking_levels_derived_and_defaults_supported(catalog):
    hy3 = next(m for m in catalog["models"] if m["id"] == "Hy3")
    assert hy3["thinkingLevels"] == ["off", "low", "high"]
    gemini = next(m for m in catalog["models"] if m["id"] == "Gemini 4 Argon")
    assert gemini["thinkingLevels"] == ["low", "medium", "high"]
    for model in catalog["models"]:
        if model["defaultThinkingLevel"] is not None:
            assert model["defaultThinkingLevel"] in model["thinkingLevels"], model["id"]


# --- sin fuga de credenciales ---------------------------------------------


def test_json_never_exposes_litellm_params_or_raw_model_info(config):
    for include_internal in (False, True):
        raw = build_catalog(config, include_internal=include_internal)
        text = repr(raw)
        assert "litellm_params" not in text
        assert "model_info" not in text
        assert "api_key" not in text
        assert "api_base" not in text
        assert "os.environ" not in text
        for model in raw["models"]:
            assert "litellm_params" not in model
            assert "model_info" not in model


def test_config_model_names_are_the_catalog_ids(config):
    names = [m["model_name"] for m in config["model_list"]]
    assert names == INVOCABLE_IDS + DEFAULT_CONTRACTS
    for model in config["model_list"]:
        params = model["litellm_params"]
        assert "api_key" in params
        assert params["api_key"].startswith("os.environ/")
        assert "sk-" not in str(model)


# --- autorización del endpoint --------------------------------------------


def test_authorize_rejects_missing_or_malformed_headers():
    assert authorize(None, "secret") is False
    assert authorize("", "secret") is False
    assert authorize("Bearer", "secret") is False
    assert authorize("Bearer ", "secret") is False
    assert authorize("secret", "secret") is False  # sin esquema Bearer
    assert authorize("Basic c2VjcmV0", "secret") is False


def test_authorize_rejects_wrong_bearer_and_unset_server_key():
    assert authorize("Bearer wrong", "secret") is False
    # Sin MODEL_GATEWAY_API_KEY configurada en el servidor, nada pasa.
    assert authorize("Bearer secret", None) is False
    assert authorize("Bearer secret", "") is False


def test_authorize_accepts_correct_bearer():
    assert authorize("Bearer secret", "secret") is True
    assert authorize("bearer secret", "secret") is True


# --- build_entry sobre entradas sueltas -----------------------------------


def test_build_entry_defaults_for_sparse_contract_entries():
    entry = build_entry(
        {
            "model_name": "x-default",
            "litellm_params": {"model": "openai/x", "api_key": "os.environ/X"},
            "model_info": {"user_invocable": False, "company": "openai"},
        }
    )
    assert entry["isDefault"] is False
    assert entry["zeroDataRetention"] is False
    assert entry["cost"] == {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0}
    assert entry["supportedOutput"] == ["text"]
    assert entry["temperature"] is None and entry["topK"] is None


def test_load_config_rejects_yaml_sin_model_list(tmp_path):
    bad = tmp_path / "config.yaml"
    bad.write_text("litellm_settings: {}\n", encoding="utf-8")
    with pytest.raises(ValueError, match="model_list"):
        load_config(bad)

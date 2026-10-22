"""Tests del Model Catalog del Model Gateway (spec §2.2 / contrato §1).

Solo importan lógica pura (`catalog.py`): no requieren litellm ni fastapi.
"""

from __future__ import annotations

import copy
from pathlib import Path

import pytest

from catalog import (
    authorize,
    build_catalog,
    build_entry,
    load_config,
    prepare_opencode_deployment_kwargs,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
CONFIG_PATH = Path(__file__).resolve().parents[1] / "config.yaml"

# Orden servido por `build_catalog`: la entrada `is_default` primero, el resto
# alfabético (case-insensitive). Es independiente del orden de `model_list`.
INVOCABLE_IDS = [
    "Deepseek v4.1 Flash",
    "Beam Free",
    "Claude Haiku",
    "Gemini 4 Argon",
    "GLM 5.3",
    "GLM 5.3 Flash",
    "Hy3",
    "Kimi K3",
    "MiMo V2.6 Flash",
    "MiMo V2.6 Pro",
    "MiniMax M3",
    "MiniMax M3.1 Flash",
    "Muse Spark 1.3",
    "Qwen 3.8 Flash",
    "Qwen 3.8 Max",
    "Step 5 Preview",
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

# Alias estable -> id canónico del catálogo. Solo enrutado: no son ids.
MODEL_ALIASES = {
    "deepseek-flash": "Deepseek v4.1 Flash",
    "glm-flash": "GLM 5.3 Flash",
    "glm-pro": "GLM 5.3",
    "mimo-flash": "MiMo V2.6 Flash",
    "mimo-pro": "MiMo V2.6 Pro",
    "meta-muse-spark": "Muse Spark 1.3",
    "free": "Beam Free",
}

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


def test_catalog_returns_exactly_the_16_user_invocable_models_in_order(catalog):
    assert [m["id"] for m in catalog["models"]] == INVOCABLE_IDS


def test_catalog_order_is_independent_of_yaml_model_list_order(config):
    # El orden lo impone `build_catalog` (default primero, resto alfabético),
    # no la posición en `model_list`: ni un reordenamiento del YAML debe
    # mover el picker.
    shuffled = copy.deepcopy(config)
    shuffled["model_list"] = list(reversed(shuffled["model_list"]))
    catalog = build_catalog(shuffled)
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


def test_minimax_m31_flash_is_no_longer_free(catalog):
    # Tarifas de OpenCode Go: $0.15 input / $0.60 output / $0.015 cache read.
    model = next(m for m in catalog["models"] if m["id"] == "MiniMax M3.1 Flash")
    assert model["cost"] == {"input": 0.15, "output": 0.6, "cacheRead": 0.015, "cacheWrite": 0}


def test_beam_free_is_free(catalog):
    model = next(m for m in catalog["models"] if m["id"] == "Beam Free")
    assert model["cost"] == {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0}


def test_step_5_preview_is_no_longer_free(catalog):
    # Tarifas de OpenCode Go: $1.00 input / $2.70 output / $0.10 cache read.
    model = next(m for m in catalog["models"] if m["id"] == "Step 5 Preview")
    assert model["cost"] == {"input": 1, "output": 2.7, "cacheRead": 0.1, "cacheWrite": 0}


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


def test_opencode_upstream_slugs_match_the_provider_catalog(config):
    params = {m["model_name"]: m["litellm_params"]["model"] for m in config["model_list"]}
    # MiniMax M3.1 Flash ya no es gratis: el slug `-free` desapareció.
    assert params["MiniMax M3.1 Flash"] == "openai/minimax-m3.1-flash"
    # Beam Free gratis en OpenCode Go (slug `beam-free`).
    assert params["Beam Free"] == "openai/beam-free"
    # OpenCode Go solo sirve Muse Spark por /v1/responses: el prefijo
    # `responses/` fuerza el bridge de LiteLLM y evita el error
    # «Model does not support this protocol» de chat/completions.
    assert params["Muse Spark 1.3"] == "openai/responses/muse-spark-1.3-contributor"


# --- aliases estables de familia/tier (solo enrutado) ---------------------


def _model_group_alias(config):
    return config["router_settings"]["model_group_alias"]


def test_model_aliases_are_the_stable_family_tier_names(config):
    aliases = _model_group_alias(config)
    assert {alias: entry["model"] for alias, entry in aliases.items()} == MODEL_ALIASES
    # Sin tier Pro de Deepseek en el gateway: el alias no debe existir.
    assert "deepseek-pro" not in aliases


def test_model_aliases_are_hidden_router_items(config):
    for alias, entry in _model_group_alias(config).items():
        # RouterModelGroupAliasItem: dict {model, hidden}, sin claves raras.
        assert set(entry) == {"model", "hidden"}, alias
        assert entry["hidden"] is True, alias


def test_model_aliases_target_existing_model_names_without_colliding(config):
    names = {m["model_name"] for m in config["model_list"]}
    for alias, entry in _model_group_alias(config).items():
        assert alias not in names, f"{alias}: colisiona con un model_name"
        assert entry["model"] in names, f"{alias}: destino inexistente {entry['model']!r}"


def test_model_aliases_never_leak_into_the_catalog(config):
    # El catálogo se construye solo desde model_list: los aliases no son ids
    # ni siquiera con include_internal=true (el picker no debe duplicarlos).
    for include_internal in (False, True):
        ids = {m["id"] for m in build_catalog(config, include_internal=include_internal)["models"]}
        assert not ids & set(_model_group_alias(config))


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


# --- adaptación para upstreams de OpenCode Go ------------------------------


def test_prepare_opencode_deployment_kwargs_injects_headers_and_adapts_deepseek():
    kwargs = {
        "model": "openai/deepseek-v4.1-flash",
        "api_base": "https://opencode.ai/zen/go/v1",
        "reasoning_effort": "xhigh",
        "store": False,
        "max_completion_tokens": 4096,
        "messages": [
            {"role": "developer", "content": "sys"},
            {"role": "user", "content": "hola"},
            {"role": "assistant", "content": None, "tool_calls": [{"id": "c1"}]},
            {"role": "assistant", "content": "prev", "reasoning": "thought"},
        ],
    }
    res = prepare_opencode_deployment_kwargs(kwargs, "sess-123")
    assert res["extra_headers"] == {
        "x-opencode-session": "sess-123",
        "user-agent": "ai-chatbot/1.0",
    }
    assert "store" not in res
    assert "max_completion_tokens" not in res
    assert res["max_tokens"] == 4096
    assert res["reasoning_effort"] == "max"
    assert res["messages"][0] == {"role": "system", "content": "sys"}
    assert res["messages"][2]["reasoning_content"] == ""
    assert res["messages"][3]["reasoning_content"] == "thought"
    assert "reasoning" not in res["messages"][3]


def test_prepare_opencode_deployment_kwargs_leaves_non_opencode_untouched():
    kwargs = {
        "model": "openai/gpt-4o-mini-tts-2025-03-20",
        "api_base": "https://api.openai.com/v1",
        "store": False,
    }
    res = prepare_opencode_deployment_kwargs(dict(kwargs), "sess-123")
    assert res == kwargs


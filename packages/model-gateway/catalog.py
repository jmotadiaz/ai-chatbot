"""Pure logic of the Model Catalog (importable without litellm/fastapi).

It turns the `model_list` of `config.yaml` into the normalized schema that
`GET /v1/models/catalog` publishes (see `CONTRACT.md` in this package, which
mirrors `.scratch/model-gateway/spec.md` §2.2). This module does NOT import
fastapi nor litellm: `server.py` does the heavy imports inside its app factory
so the tests can run with just pyyaml/pytest.

Cost keys in `model_info` (native to LiteLLM, PER TOKEN):
  input_cost_per_token, output_cost_per_token,
  cache_read_input_token_cost, cache_creation_input_token_cost.
The catalog JSON re-expresses them PER MILLION (units of the original catalog
in `packages/models`), under `cost.{input,output,cacheRead,cacheWrite}`.
"""

from __future__ import annotations

import hmac
from pathlib import Path
from typing import Any

import yaml

PACKAGE_ROOT = Path(__file__).resolve().parent
CONFIG_PATH = PACKAGE_ROOT / "config.yaml"

# Exact schema of each GatewayModelEntry (fixed order, closed types).
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

# model_info (per token) -> cost JSON (per million).
_COST_INFO_TO_PER_MILLION = {
    "input": "input_cost_per_token",
    "output": "output_cost_per_token",
    "cacheRead": "cache_read_input_token_cost",
    "cacheWrite": "cache_creation_input_token_cost",
}


def load_config(path: str | Path = CONFIG_PATH) -> dict[str, Any]:
    """Reads the Gateway config.yaml (the stateless source of truth)."""
    with open(path, "r", encoding="utf-8") as fh:
        config = yaml.safe_load(fh)
    if not isinstance(config, dict) or not isinstance(config.get("model_list"), list):
        raise ValueError(f"{path}: expected a mapping with 'model_list'")
    return config


def _cost_per_million(info: dict[str, Any]) -> dict[str, float]:
    return {
        key: round((info.get(info_key) or 0) * 1_000_000, 12)
        for key, info_key in _COST_INFO_TO_PER_MILLION.items()
    }


def build_entry(model: dict[str, Any]) -> dict[str, Any]:
    """Normalizes an entry of `model_list` into a GatewayModelEntry."""
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
        raise AssertionError(f"{name}: unexpected entry schema")
    return entry


def build_catalog(
    config: dict[str, Any],
    include_internal: bool = False,
) -> dict[str, list[dict[str, Any]]]:
    """Builds the response of the catalog endpoint.

    It filters on the server: only `model_info.user_invocable == true` unless
    `include_internal=True` (inspection of the `*-default` contracts).
    It never exposes `litellm_params` nor raw `model_info`.
    """
    models = [
        build_entry(model)
        for model in config["model_list"]
        if include_internal or (model.get("model_info") or {}).get("user_invocable") is True
    ]
    # Deterministic catalog order: the `is_default` entry first, the rest
    # alphabetical (case-insensitive). The order of `model_list` in the YAML
    # is irrelevant: all consumers (Model Picker, coding-agent) inherit this
    # order as is.
    models.sort(key=lambda e: (not e["isDefault"], e["id"].casefold()))
    return {"models": models}


def authorize(header: str | None, expected_api_key: str | None) -> bool:
    """Validates `Authorization: Bearer <MODEL_GATEWAY_API_KEY>`.

    Constant-time comparison; False if the header is missing, the scheme is not
    Bearer, the expected key is not configured or it does not match.
    """
    if not header or not expected_api_key:
        return False
    scheme, _, token = header.partition(" ")
    # The scheme is case-insensitive (RFC 7235).
    if scheme.lower() != "bearer" or not token:
        return False
    return hmac.compare_digest(token, expected_api_key)


OPENCODE_HOST = "opencode.ai"
OPENCODE_USER_AGENT = "ai-chatbot/1.0"


def prepare_opencode_deployment_kwargs(
    kwargs: dict[str, Any],
    session_id: str,
) -> dict[str, Any]:
    """Adapts a LiteLLM call for the OpenCode Go upstreams.

    - OpenCode Go requires `x-opencode-session` (stable per process for routing and
      prompt caching, https://opencode.ai/docs/go/#where-can-i-use-it) and its own
      `user-agent` instead of the SDK's generic one.
    - The OpenAI-compatible models of OpenCode Go do not support `store` nor the
      `developer` role.
    - `deepseek-v4.1-flash` exposes the `xhigh` level in the catalog but its
      upstream expects `reasoning_effort: "max"`, and it requires `reasoning_content` in
      every `assistant` message of the history (e.g. after tool calls).
    """
    api_base = str(kwargs.get("api_base") or "")
    if OPENCODE_HOST not in api_base:
        return kwargs

    existing_headers = kwargs.get("extra_headers")
    extra_headers: dict[str, Any] = (
        dict(existing_headers) if isinstance(existing_headers, dict) else {}
    )
    lower_keys = {k.lower() for k in extra_headers}
    if "x-opencode-session" not in lower_keys:
        extra_headers["x-opencode-session"] = session_id
    if "user-agent" not in lower_keys:
        extra_headers["user-agent"] = OPENCODE_USER_AGENT
    kwargs["extra_headers"] = extra_headers

    # The OpenAI-compatible endpoints of OpenCode Go have supportsStore=false
    # and maxTokensField="max_tokens".
    kwargs.pop("store", None)
    if "max_completion_tokens" in kwargs:
        max_comp = kwargs.pop("max_completion_tokens")
        if kwargs.get("max_tokens") is None and max_comp is not None:
            kwargs["max_tokens"] = max_comp

    model = str(kwargs.get("model") or "").lower()
    is_deepseek = "deepseek" in model

    if (is_deepseek or "glm-5.3-flash" in model) and kwargs.get("reasoning_effort") == "xhigh":
        kwargs["reasoning_effort"] = "max"

    messages = kwargs.get("messages")
    if isinstance(messages, list):
        patched_messages: list[Any] = []
        changed = False
        for msg in messages:
            if not isinstance(msg, dict):
                patched_messages.append(msg)
                continue
            role = msg.get("role")
            if role == "developer":
                patched = dict(msg)
                patched["role"] = "system"
                patched_messages.append(patched)
                changed = True
            elif is_deepseek and role == "assistant" and msg.get("reasoning_content") is None:
                patched = dict(msg)
                reasoning_fallback = patched.pop("reasoning", None)
                patched["reasoning_content"] = (
                    reasoning_fallback if isinstance(reasoning_fallback, str) else ""
                )
                patched_messages.append(patched)
                changed = True
            else:
                patched_messages.append(msg)
        if changed:
            kwargs["messages"] = patched_messages

    return kwargs


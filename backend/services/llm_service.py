import asyncio
import json
import re
import time
from typing import Any, Optional, Union
import httpx
from ..config import settings


def _use_anthropic_directly() -> bool:
    return bool(settings.anthropic_api_key)


# ─── Public API ──────────────────────────────────────────────────────────────

async def call_llm(
    system: str,
    user: str,
    response_schema: Optional[dict] = None,
    max_tokens: int = 2048,
    metrics_out: Optional[list] = None,
    stage_name: str = "",
    langfuse_parent: Optional[Any] = None,
) -> Union[dict, str]:
    if _use_anthropic_directly():
        return await _call_anthropic_direct(system, user, response_schema, max_tokens, metrics_out, stage_name, langfuse_parent)
    return await _call_litellm_proxy(system, user, response_schema, max_tokens, metrics_out, stage_name, langfuse_parent)


async def call_llm_streaming(
    system: str,
    user: str,
    token_queue: asyncio.Queue,
    stage_name: str,
    response_schema: Optional[dict] = None,
    max_tokens: int = 2048,
    metrics_out: Optional[list] = None,
    langfuse_parent: Optional[Any] = None,
) -> Union[dict, str]:
    """Like call_llm but streams reasoning tokens into token_queue as Claude generates them."""
    if _use_anthropic_directly():
        # Anthropic streaming path
        return await _stream_anthropic_with_reasoning(
            system, user, token_queue, stage_name, response_schema, max_tokens, metrics_out, langfuse_parent
        )
    return await _stream_litellm_with_reasoning(
        system, user, token_queue, stage_name, response_schema, max_tokens, metrics_out, langfuse_parent
    )


# ─── Reasoning token extractor ───────────────────────────────────────────────

class ReasoningStreamExtractor:
    """
    Extracts the llm_reasoning / overall_reasoning value from streaming JSON
    tool-call arguments, character by character, handling escape sequences.
    """
    KEYS = ('"llm_reasoning"', '"overall_reasoning"')

    def __init__(self):
        self._buf = ""
        self._found_key = False
        self._in_value = False
        self._escape_next = False
        self._done = False

    def process(self, chunk: str) -> str:
        if self._done:
            return ""

        self._buf += chunk

        # Phase 1: scan for the key name
        if not self._found_key:
            for key in self.KEYS:
                if key in self._buf:
                    idx = self._buf.index(key) + len(key)
                    self._buf = self._buf[idx:]
                    self._found_key = True
                    break
            if not self._found_key:
                # Trim buffer but keep a tail long enough for partial-key match
                tail = max(len(k) for k in self.KEYS) + 4
                if len(self._buf) > tail:
                    self._buf = self._buf[-tail:]
                return ""

        # Phase 2: wait for opening quote of the value (skip : and whitespace)
        if not self._in_value:
            q = self._buf.find('"')
            if q < 0:
                return ""
            self._buf = self._buf[q + 1:]
            self._in_value = True

        # Phase 3: stream chars until unescaped closing quote
        result: list[str] = []
        i = 0
        while i < len(self._buf):
            c = self._buf[i]
            if self._escape_next:
                result.append({
                    "n": "\n", "t": "\t", "r": "\r",
                    '"': '"', "\\": "\\", "/": "/",
                }.get(c, c))
                self._escape_next = False
            elif c == "\\":
                self._escape_next = True
            elif c == '"':
                self._done = True
                self._buf = self._buf[i + 1:]
                break
            else:
                result.append(c)
            i += 1

        if self._in_value and not self._done:
            self._buf = ""  # consumed, wait for more

        return "".join(result)


# ─── LiteLLM streaming path ───────────────────────────────────────────────────

async def _stream_litellm_with_reasoning(
    system: str,
    user: str,
    token_queue: asyncio.Queue,
    stage_name: str,
    response_schema: Optional[dict] = None,
    max_tokens: int = 2048,
    metrics_out: Optional[list] = None,
    langfuse_parent: Optional[Any] = None,
) -> Union[dict, str]:
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    payload = {
        "model": settings.litellm_model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.7,
        "stream": True,
        "stream_options": {"include_usage": True},
    }

    if response_schema:
        payload["tools"] = [{
            "type": "function",
            "function": {
                "name": "structured_output",
                "description": "Return the structured result",
                "parameters": response_schema,
            },
        }]
        payload["tool_choice"] = {"type": "function", "function": {"name": "structured_output"}}

    headers = {
        "Authorization": f"Bearer {settings.litellm_api_key}",
        "Content-Type": "application/json",
    }

    accumulated_args = ""
    accumulated_content = ""
    extractor = ReasoningStreamExtractor()
    stream_prompt_tokens = 0
    stream_completion_tokens = 0
    t0 = time.monotonic()

    generation = None
    try:
        if langfuse_parent is not None:
            generation = langfuse_parent.start_generation(
                name=stage_name,
                model=settings.litellm_model,
                model_parameters={"max_tokens": max_tokens, "temperature": 0.7, "stream": True},
                input=messages,
            )
    except Exception:
        pass

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{settings.litellm_base_url}/chat/completions",
            json=payload,
            headers=headers,
        ) as resp:
            resp.raise_for_status()
            async for raw_line in resp.aiter_lines():
                if not raw_line.startswith("data: "):
                    continue
                data_str = raw_line[6:].strip()
                if data_str == "[DONE]":
                    break
                try:
                    event = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                # Capture usage from the final chunk (no choices delta)
                if "usage" in event and not event.get("choices"):
                    usage = event["usage"]
                    stream_prompt_tokens = usage.get("prompt_tokens", 0)
                    stream_completion_tokens = usage.get("completion_tokens", 0)

                choice = (event.get("choices") or [{}])[0]
                delta = choice.get("delta") or {}

                # Tool-call argument stream (structured output)
                for tc in (delta.get("tool_calls") or []):
                    args_chunk = (tc.get("function") or {}).get("arguments", "")
                    if not args_chunk:
                        continue
                    accumulated_args += args_chunk
                    chars = extractor.process(args_chunk)
                    if chars:
                        await token_queue.put({
                            "type": "thinking_token",
                            "stage": stage_name,
                            "text": chars,
                        })

                # Plain text stream (non-tool responses)
                content = delta.get("content") or ""
                if content:
                    accumulated_content += content
                    await token_queue.put({
                        "type": "thinking_token",
                        "stage": stage_name,
                        "text": content,
                    })

    latency_ms = round((time.monotonic() - t0) * 1000, 1)
    try:
        if generation is not None:
            generation.update(
                output={"accumulated_args": accumulated_args[:200]} if accumulated_args else {"content": accumulated_content[:200]},
                usage_details={"input": stream_prompt_tokens, "output": stream_completion_tokens},
            )
            generation.end()
    except Exception:
        pass
    if metrics_out is not None:
        metrics_out.append({
            "stage": stage_name,
            "prompt_tokens": stream_prompt_tokens,
            "completion_tokens": stream_completion_tokens,
            "latency_ms": latency_ms,
        })
    if token_queue is not None:
        await token_queue.put({
            "type": "llm_metrics",
            "stage": stage_name,
            "prompt_tokens": stream_prompt_tokens,
            "completion_tokens": stream_completion_tokens,
            "latency_ms": latency_ms,
        })

    if response_schema:
        raw = accumulated_args or accumulated_content
        if raw:
            return json.loads(raw)
        raise ValueError("LLM returned no structured output")

    return accumulated_content


# ─── Anthropic streaming path ─────────────────────────────────────────────────

async def _stream_anthropic_with_reasoning(
    system: str,
    user: str,
    token_queue: asyncio.Queue,
    stage_name: str,
    response_schema: Optional[dict] = None,
    max_tokens: int = 2048,
    metrics_out: Optional[list] = None,
    langfuse_parent: Optional[Any] = None,
) -> Union[dict, str]:
    payload = {
        "model": settings.anthropic_model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "temperature": 0.7,
        "stream": True,
    }

    if response_schema:
        payload["tools"] = [{
            "name": "structured_output",
            "description": "Return the structured result",
            "input_schema": response_schema,
        }]
        payload["tool_choice"] = {"type": "tool", "name": "structured_output"}

    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    accumulated_input = ""
    accumulated_text = ""
    extractor = ReasoningStreamExtractor()
    stream_prompt_tokens = 0
    stream_completion_tokens = 0
    t0 = time.monotonic()

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            "https://api.anthropic.com/v1/messages",
            json=payload,
            headers=headers,
        ) as resp:
            resp.raise_for_status()
            async for raw_line in resp.aiter_lines():
                if not raw_line.startswith("data: "):
                    continue
                data_str = raw_line[6:].strip()
                try:
                    event = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                etype = event.get("type", "")

                if etype == "message_delta":
                    usage = event.get("usage", {})
                    if "output_tokens" in usage:
                        stream_completion_tokens = usage["output_tokens"]

                if etype == "message_start":
                    usage = event.get("message", {}).get("usage", {})
                    stream_prompt_tokens = usage.get("input_tokens", 0)

                if etype == "content_block_delta":
                    delta = event.get("delta", {})
                    if delta.get("type") == "input_json_delta":
                        chunk = delta.get("partial_json", "")
                        accumulated_input += chunk
                        chars = extractor.process(chunk)
                        if chars:
                            await token_queue.put({
                                "type": "thinking_token",
                                "stage": stage_name,
                                "text": chars,
                            })
                    elif delta.get("type") == "text_delta":
                        text = delta.get("text", "")
                        accumulated_text += text
                        if text:
                            await token_queue.put({
                                "type": "thinking_token",
                                "stage": stage_name,
                                "text": text,
                            })

    latency_ms = round((time.monotonic() - t0) * 1000, 1)
    if metrics_out is not None:
        metrics_out.append({
            "stage": stage_name,
            "prompt_tokens": stream_prompt_tokens,
            "completion_tokens": stream_completion_tokens,
            "latency_ms": latency_ms,
        })
    if token_queue is not None:
        await token_queue.put({
            "type": "llm_metrics",
            "stage": stage_name,
            "prompt_tokens": stream_prompt_tokens,
            "completion_tokens": stream_completion_tokens,
            "latency_ms": latency_ms,
        })

    if response_schema:
        raw = accumulated_input or accumulated_text
        if raw:
            return json.loads(raw)
        raise ValueError("LLM returned no structured output")

    return accumulated_text


# ─── Non-streaming fallbacks (used when no queue is available) ───────────────

async def _call_anthropic_direct(
    system: str,
    user: str,
    response_schema: Optional[dict] = None,
    max_tokens: int = 2048,
    metrics_out: Optional[list] = None,
    stage_name: str = "",
    langfuse_parent: Optional[Any] = None,
) -> Union[dict, str]:
    payload = {
        "model": settings.anthropic_model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "temperature": 0.7,
    }

    if response_schema:
        payload["tools"] = [{
            "name": "structured_output",
            "description": "Return the structured result",
            "input_schema": response_schema,
        }]
        payload["tool_choice"] = {"type": "tool", "name": "structured_output"}

    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    t0 = time.monotonic()
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            json=payload,
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()
    latency_ms = round((time.monotonic() - t0) * 1000, 1)

    usage = data.get("usage", {})
    if metrics_out is not None:
        metrics_out.append({
            "stage": stage_name,
            "prompt_tokens": usage.get("input_tokens", 0),
            "completion_tokens": usage.get("output_tokens", 0),
            "latency_ms": latency_ms,
        })

    if response_schema:
        for block in data.get("content", []):
            if block.get("type") == "tool_use" and block.get("name") == "structured_output":
                return block["input"]
        for block in data.get("content", []):
            if block.get("type") == "text":
                return _extract_json(block["text"])
        raise ValueError("LLM did not return structured output")

    for block in data.get("content", []):
        if block.get("type") == "text":
            return block["text"]
    raise ValueError("LLM returned no text content")


async def _call_litellm_proxy(
    system: str,
    user: str,
    response_schema: Optional[dict] = None,
    max_tokens: int = 2048,
    metrics_out: Optional[list] = None,
    stage_name: str = "",
    langfuse_parent: Optional[Any] = None,
) -> Union[dict, str]:
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    payload = {
        "model": settings.litellm_model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.7,
    }

    if response_schema:
        payload["tools"] = [{
            "type": "function",
            "function": {
                "name": "structured_output",
                "description": "Return the structured result",
                "parameters": response_schema,
            },
        }]
        payload["tool_choice"] = {"type": "function", "function": {"name": "structured_output"}}

    headers = {
        "Authorization": f"Bearer {settings.litellm_api_key}",
        "Content-Type": "application/json",
    }

    generation = None
    try:
        if langfuse_parent is not None:
            generation = langfuse_parent.start_generation(
                name=stage_name or "litellm",
                model=settings.litellm_model,
                model_parameters={"max_tokens": max_tokens, "temperature": 0.7},
                input=messages,
            )
    except Exception:
        pass

    t0 = time.monotonic()
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{settings.litellm_base_url}/chat/completions",
            json=payload,
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()
    latency_ms = round((time.monotonic() - t0) * 1000, 1)

    usage = data.get("usage", {})
    if metrics_out is not None:
        metrics_out.append({
            "stage": stage_name,
            "prompt_tokens": usage.get("prompt_tokens", 0),
            "completion_tokens": usage.get("completion_tokens", 0),
            "latency_ms": latency_ms,
        })

    if response_schema:
        tool_calls = data["choices"][0]["message"].get("tool_calls", [])
        result = None
        for tc in tool_calls:
            if tc["function"]["name"] == "structured_output":
                result = json.loads(tc["function"]["arguments"])
                break
        if result is None:
            content = data["choices"][0]["message"].get("content", "")
            if content:
                result = _extract_json(content)
            else:
                try:
                    if generation is not None:
                        generation.update(output={"error": "no structured output"}, usage_details={"input": usage.get("prompt_tokens", 0), "output": usage.get("completion_tokens", 0)})
                        generation.end()
                except Exception:
                    pass
                raise ValueError("LLM did not return structured output")
        try:
            if generation is not None:
                generation.update(output=result, usage_details={"input": usage.get("prompt_tokens", 0), "output": usage.get("completion_tokens", 0)})
                generation.end()
        except Exception:
            pass
        return result

    result = data["choices"][0]["message"]["content"]
    try:
        if generation is not None:
            generation.update(output=result, usage_details={"input": usage.get("prompt_tokens", 0), "output": usage.get("completion_tokens", 0)})
            generation.end()
    except Exception:
        pass
    return result


def _extract_json(text: str) -> dict:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    return json.loads(text)

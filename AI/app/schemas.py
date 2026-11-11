# -*- coding: utf-8 -*-
"""OpenAI uyumlu istek/yanıt şemaları (pydantic)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field


class FunctionCall(BaseModel):
    name: str
    arguments: str = "{}"


class ToolCall(BaseModel):
    id: Optional[str] = None
    type: str = "function"
    function: FunctionCall


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="allow")

    role: str
    content: Optional[Union[str, List[Any]]] = None
    name: Optional[str] = None
    tool_calls: Optional[List[ToolCall]] = None
    tool_call_id: Optional[str] = None


class ChatCompletionRequest(BaseModel):
    # OpenAI alanları
    model: Optional[str] = None
    messages: List[ChatMessage]
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    top_k: Optional[int] = None
    max_tokens: Optional[int] = None
    n: Optional[int] = 1
    stop: Optional[Union[str, List[str]]] = None
    stream: Optional[bool] = False
    presence_penalty: Optional[float] = None
    frequency_penalty: Optional[float] = None
    repetition_penalty: Optional[float] = None
    seed: Optional[int] = None
    logprobs: Optional[bool] = None
    top_logprobs: Optional[int] = None
    response_format: Optional[Dict[str, Any]] = None
    tools: Optional[List[Dict[str, Any]]] = None
    tool_choice: Optional[Union[str, Dict[str, Any]]] = None
    user: Optional[str] = None

    # ANES uzantıları
    web_search: Optional[Union[bool, Dict[str, Any]]] = Field(
        default=None,
        description="True ise son kullanıcı mesajı için web araması yapıp bağlama ekler.",
    )
    thinking: Optional[bool] = Field(
        default=None,
        description="Model düşünme (thinking) şablonunu aç/kapat (destekliyorsa).",
    )
    chat_template_kwargs: Optional[Dict[str, Any]] = None
    system_extra: Optional[str] = Field(
        default=None, description="Sistem istemine eklenecek ek metin."
    )
    include_stats: Optional[bool] = True
    cache_prompt: Optional[bool] = True

    model_config = ConfigDict(extra="allow")


class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ChatChoice(BaseModel):
    index: int = 0
    message: Dict[str, Any]
    finish_reason: Optional[str] = "stop"


class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[ChatChoice]
    usage: Usage
    anes: Optional[Dict[str, Any]] = None


class ChatCompletionChunk(BaseModel):
    id: str
    object: str = "chat.completion.chunk"
    created: int
    model: str
    choices: List[Dict[str, Any]]

# -*- coding: utf-8 -*-
"""Modelin kullanabileceği araçlar (function calling) ve web bağlamı üretimi."""

from __future__ import annotations

import json
from typing import Any

from . import websearch

# OpenAI function-calling şemaları
TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_news",
            "description": (
                "GÜNCEL haberleri arar. Gündem, son dakika ve tarihli olaylar için "
                "kullan. Sonuçlar kaynak ve tarih içerir."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Aranacak haber konusu."},
                    "when": {
                        "type": "string",
                        "enum": ["hour", "day", "week", "month", "year"],
                        "description": "Zaman aralığı (varsayılan: week).",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Genel web araması yapar (güncel bilgi, fiyat, olgu doğrulama). "
                "Kaynak başlıkları ve bağlantılar döndürür."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Arama sorgusu."},
                    "freshness": {
                        "type": "string",
                        "enum": ["any", "day", "week", "month", "year"],
                        "description": "Tazelik (varsayılan: any).",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "open_url",
            "description": (
                "Bir web sayfasının metnini getirir. Belirli bir URL'nin içeriğini "
                "özetlemek veya alıntılamak için kullan."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "Tam URL (http/https)."},
                },
                "required": ["url"],
            },
        },
    },
]

TOOL_NAMES = {t["function"]["name"] for t in TOOL_SCHEMAS}


def execute_tool(name: str, arguments: dict[str, Any],
                 max_results: int = 5) -> tuple[str, list[dict]]:
    """Aracı çalıştırır; (model_metni, ham_sonuçlar) döndürür."""
    try:
        if name == "search_news":
            query = arguments.get("query", "")
            when = arguments.get("when", "week")
            results = websearch.search_news(query, max_results=max_results, when=when)
        elif name == "web_search":
            query = arguments.get("query", "")
            freshness = arguments.get("freshness", "any")
            results = websearch.search_web_and_news(
                query, max_results=max_results, freshness=freshness
            )
        elif name == "open_url":
            url = arguments.get("url", "")
            text = websearch.fetch_page_text(url)
            return text, [{"url": url, "title": url, "source": "page"}]
        else:
            return f"Bilinmeyen araç: {name}", []

        text = (f"Bugün: {websearch.today_str()}\n"
                + websearch.format_results(results))
        return text, results
    except Exception as e:  # noqa: BLE001
        return f"Araç hatası ({name}): {e}", []


def parse_arguments(raw: Any) -> dict:
    """Modelin arguments alanını (str veya dict) sözlüğe çevirir."""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            val = json.loads(raw)
            return val if isinstance(val, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def build_web_context(query: str, max_results: int = 5,
                      freshness: str = "any", when: str = "week") -> tuple[str, list[dict]]:
    """Sorgu için web bağlamı üretir (web_search=true kısayolu)."""
    return websearch.build_context(
        query, max_results=max_results, freshness=freshness, when=when
    )

# -*- coding: utf-8 -*-
"""ANES AI Backend — OpenAI uyumlu yerel yapay zekâ sunucusu.

Uç noktalar:
    POST /v1/chat/completions   (stream & non-stream, tool calling, web araması)
    GET  /v1/models             (katalog + indirilmiş + indiriliyor + yerel)
    POST /v1/models/download    (indirme başlat, background)
    GET  /v1/models/download    (indirme ilerlemesi)
    POST /v1/models/load        (model yükle)
    POST /v1/models/unload
    GET  /v1/models/local       (indirilmiş modeller)
    DELETE /v1/models/{tier}
    GET  /v1/status             (detaylı cihaz + süreç + model + metrikler)
    GET  /v1/status/stream      (canlı ölçüm, SSE)
    GET  /v1/tools
    POST /v1/tools/web_search   (test)
    GET  /health
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
import uuid

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from . import config, system_stats, tools as tools_mod, websearch
from .engine import EngineManager
from .models_registry import ModelsRegistry
from .schemas import ChatCompletionRequest

app = FastAPI(title="ANES AI Backend", version=config.VERSION,
              description="Yerel GGUF (llama.cpp) tabanlı OpenAI uyumlu sunucu.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

registry = ModelsRegistry()
engine = EngineManager()


# ---------------------------------------------------------------------------
# Yardımcılar
# ---------------------------------------------------------------------------
def _now() -> int:
    return int(time.time())


def _content_to_str(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for c in content:
            if isinstance(c, dict) and c.get("type") == "text":
                parts.append(c.get("text", ""))
            elif isinstance(c, str):
                parts.append(c)
        return "\n".join(parts)
    return "" if content is None else str(content)


def _prep_messages(req: ChatCompletionRequest) -> list[dict]:
    msgs = []
    for m in req.messages:
        d: dict = {"role": m.role, "content": _content_to_str(m.content)}
        if m.name:
            d["name"] = m.name
        if m.tool_calls:
            d["tool_calls"] = [tc.model_dump(exclude_none=True) for tc in m.tool_calls]
        if m.tool_call_id:
            d["tool_call_id"] = m.tool_call_id
        msgs.append(d)

    # Sistem istemi zenginleştirme: güncel tarih + opsiyonel ekstra
    sys_bits = [
        f"Bugünün tarihi: {websearch.today_str()}. Bu yıl {time.localtime().tm_year}."
    ]
    if req.web_search:
        sys_bits.append(
            "Bu yanıt için güncel web arama sonuçları sağlanacaktır; yanıtı "
            "bu sonuçlara dayandır ve kaynakları belirt."
        )
    if req.system_extra:
        sys_bits.append(req.system_extra)
    if sys_bits:
        msgs = [{"role": "system", "content": " ".join(sys_bits)}] + msgs
    return msgs


def _gen_params(req: ChatCompletionRequest) -> dict:
    params = {}
    if req.temperature is not None:
        params["temperature"] = req.temperature
    if req.top_p is not None:
        params["top_p"] = req.top_p
    if req.top_k is not None:
        params["top_k"] = req.top_k
    if req.max_tokens is not None:
        params["max_tokens"] = req.max_tokens
    if req.stop is not None:
        params["stop"] = req.stop
    if req.thinking is not None:
        params["thinking"] = req.thinking
    return params


def _resolve_tools(req: ChatCompletionRequest) -> list[dict] | None:
    """Yalnızca istemci açıkça `tools` verirse function-calling araçlarını döndürür.

    NOT: Yerleşik web araması artık function-calling'e bırakılmaz; motorun
    `web_search` kısayolu (RAG enjeksiyonu) küçük modellerde çok daha güvenilirdir.
    """
    if req.tools:
        return req.tools
    return None


# ---------------------------------------------------------------------------
# Sağlık
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": config.VERSION,
        "port": config.PORT,
        "engine_available": engine.available,
        "model_loaded": engine.loaded,
        "model_tier": engine.model_tier,
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
    }


# ---------------------------------------------------------------------------
# Modeller
# ---------------------------------------------------------------------------
@app.get("/v1/models")
def list_models():
    registry.reload()
    local_files = []
    try:
        for p in sorted(config.MODELS_DIR.glob("*.gguf")):
            local_files.append({
                "filename": p.name,
                "size": p.stat().st_size,
                "size_human": f"{p.stat().st_size/1024**3:.2f}GB",
            })
    except Exception:
        pass

    downloaded = registry.downloaded_tiers()
    return {
        "object": "list",
        "data": [
            {
                "id": registry.model_id(t),
                "object": "model",
                "owned_by": "anes",
                "tier": t,
                "loaded": engine.model_tier == t,
                **{k: v for k, v in registry.describe(t).items()},
            }
            for t in registry.catalog
        ],
        "downloaded_tiers": downloaded,
        "default_tier": config.DEFAULT_MODEL_TIER,
        "current_tier": engine.model_tier,
        "local_files": local_files,
        "models_dir": str(config.MODELS_DIR),
        "disk": registry.disk_usage(),
    }


@app.get("/v1/models/local")
def list_local_models():
    return {
        "data": [registry.describe(t) for t in registry.downloaded_tiers()],
        "current_tier": engine.model_tier,
    }


@app.post("/v1/models/download")
def download_model(tier: str = Query(..., description="Models.json tier anahtarı"),
                   force: bool = Query(False)):
    if tier not in registry.catalog:
        raise HTTPException(404, f"Bilinmeyen tier: {tier}")
    result = registry.start_download(tier, force=force)
    return {"ok": True, **result}


@app.get("/v1/models/download")
def download_progress(tier: str | None = Query(None)):
    if tier:
        return registry.describe(tier).get("download") or {"status": "no_job"}
    return {"jobs": {t: registry.describe(t).get("download")
                     for t in registry.catalog if registry.describe(t).get("download")}}


@app.post("/v1/models/load")
def load_model(
    tier: str | None = Query(None),
    model: str | None = Query(None),
    n_ctx: int | None = Query(None),
    n_gpu_layers: int | None = Query(None),
    n_threads: int | None = Query(None),
    n_batch: int | None = Query(None),
    wait: bool = Query(True, description="False ise arka planda yükler"),
):
    name = model or tier
    try:
        resolved_tier, meta, path = registry.resolve(name)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))

    overrides = {}
    if n_ctx is not None:
        overrides["n_ctx"] = n_ctx
    if n_gpu_layers is not None:
        overrides["n_gpu_layers"] = n_gpu_layers
    if n_threads is not None:
        overrides["n_threads"] = n_threads
    if n_batch is not None:
        overrides["n_batch"] = n_batch

    if wait:
        try:
            info = engine.load(str(path), tier=resolved_tier, meta=meta, **overrides)
            return {"ok": True, "info": info}
        except Exception as e:  # noqa: BLE001
            raise HTTPException(500, f"Model yüklenemedi: {e}")
    else:
        def _bg():
            try:
                engine.load(str(path), tier=resolved_tier, meta=meta, **overrides)
            except Exception as e:  # noqa: BLE001
                print(f"[load] hata: {e}")

        threading.Thread(target=_bg, daemon=True).start()
        return {"ok": True, "status": "loading", "tier": resolved_tier}


@app.post("/v1/models/unload")
def unload_model():
    return {"ok": True, **engine.unload()}


@app.post("/v1/models/standby")
def standby_model():
    """Modeli bellekten çıkarır (spec saklanır; sonraki istekte otomatik geri yüklenir)."""
    return {"ok": True, **engine.enter_standby()}


@app.get("/v1/config/idle")
def get_idle_config():
    return {"ok": True, **engine.idle_state()}


@app.post("/v1/config/idle")
def set_idle_config(seconds: int = Query(..., ge=0, description="0 => standby kapalı")):
    """Boşta boşaltma süresini ayarla. 0 => devre dışı."""
    return {"ok": True, **engine.set_idle_timeout(seconds)}


@app.delete("/v1/models/{tier}")
def delete_model(tier: str):
    if tier not in registry.catalog:
        raise HTTPException(404, f"Bilinmeyen tier: {tier}")
    if engine.model_tier == tier:
        engine.unload()
    return {"ok": True, **registry.delete(tier)}


# ---------------------------------------------------------------------------
# Sohbet tamamlama
# ---------------------------------------------------------------------------
@app.post("/v1/chat/completions")
async def chat_completions(req: ChatCompletionRequest):
    if not engine.loaded:
        # 1) Standby'dan otomatik geri yükleme
        if engine.can_reload():
            try:
                engine.ensure_loaded()
            except Exception as e:  # noqa: BLE001
                raise HTTPException(503, f"Model standby'dan yüklenemedi: {e}")
        # 2) Hiç yüklenmemişse otomatik yükleme
        elif config.AUTO_LOAD:
            try:
                tier, meta, path = registry.resolve(req.model)
                engine.load(str(path), tier=tier, meta=meta)
            except Exception as e:  # noqa: BLE001
                raise HTTPException(
                    503, f"Model yüklü değil ve otomatik yüklenemedi: {e}"
                )
        else:
            raise HTTPException(503, "Model yüklü değil. POST /v1/models/load çağırın.")

    messages = _prep_messages(req)
    params = _gen_params(req)
    tools = _resolve_tools(req)
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"
    created = _now()

    # --- Streaming (SSE) ---
    if req.stream:
        async def event_gen():
            loop = asyncio.get_event_loop()
            queue: asyncio.Queue = asyncio.Queue()
            DONE = object()

            def produce():
                try:
                    for ev in engine.chat_stream(
                        messages, params, web_search=req.web_search, tools=tools
                    ):
                        loop.call_soon_threadsafe(queue.put_nowait, ev)
                finally:
                    loop.call_soon_threadsafe(queue.put_nowait, DONE)

            threading.Thread(target=produce, daemon=True).start()

            # İlk chunk: rol
            first = {
                "id": completion_id, "object": "chat.completion.chunk",
                "created": created, "model": req.model or engine.model_tier,
                "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}],
            }
            yield f"data: {json.dumps(first, ensure_ascii=False)}\n\n"

            while True:
                ev = await queue.get()
                if ev is DONE:
                    break
                t = ev["type"]
                if t == "delta":
                    chunk = {
                        "id": completion_id, "object": "chat.completion.chunk",
                        "created": created, "model": req.model or engine.model_tier,
                        "choices": [{"index": 0, "delta": {"content": ev["text"]},
                                     "finish_reason": None}],
                    }
                    yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                elif t in ("web", "tool", "meta"):
                    # ANES olayları ayrı bir alanda
                    note = {"id": completion_id, "object": "anes.event",
                            "created": created, "anes": ev}
                    yield f"data: {json.dumps(note, ensure_ascii=False)}\n\n"
                elif t == "done":
                    final = {
                        "id": completion_id, "object": "chat.completion.chunk",
                        "created": created, "model": req.model or engine.model_tier,
                        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                        "usage": ev.get("usage"),
                        "anes": {"metrics": ev.get("metrics")},
                    }
                    yield f"data: {json.dumps(final, ensure_ascii=False)}\n\n"
                elif t == "error":
                    err = {"id": completion_id, "object": "anes.error",
                           "error": {"message": ev.get("message")}}
                    yield f"data: {json.dumps(err, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(
            event_gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # --- Non-stream ---
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: engine.chat(messages, params, web_search=req.web_search, tools=tools),
    )
    if result.get("error"):
        raise HTTPException(500, result["error"])
    message = {"role": "assistant", "content": result["content"]}
    if result["tool_events"]:
        message["tool_calls"] = [
            {"id": f"call_{i}", "type": "function",
             "function": {"name": ev["name"],
                          "arguments": json.dumps(ev["arguments"], ensure_ascii=False)}}
            for i, ev in enumerate(result["tool_events"])
        ]
    anes = None
    if req.include_stats:
        anes = {
            "metrics": result.get("metrics"),
            "web_results": result.get("web_results"),
            "tool_events": result.get("tool_events"),
        }
    return {
        "id": completion_id,
        "object": "chat.completion",
        "created": created,
        "model": req.model or engine.model_tier,
        "choices": [{"index": 0, "message": message, "finish_reason": "stop"}],
        "usage": result["usage"],
        "anes": anes,
    }


# ---------------------------------------------------------------------------
# Durum
# ---------------------------------------------------------------------------
@app.get("/v1/status")
def status(detail: bool = Query(True)):
    snap = system_stats.snapshot()
    payload = {
        "service": {
            "name": "ANES AI Backend",
            "version": config.VERSION,
            "host": config.HOST,
            "port": config.PORT,
            "started_at": time.strftime(
                "%Y-%m-%d %H:%M:%S",
                time.localtime(engine.metrics.started_at),
            ),
        },
        "model": engine.info(),
        "device": snap,
        "metrics": engine.metrics.stats(),
    }
    if not detail:
        payload["device"].pop("disks", None)
        payload["metrics"].pop("recent", None)
    return payload


@app.get("/v1/status/stream")
async def status_stream(interval: float = Query(2.0, ge=0.5, le=30.0)):
    async def gen():
        while True:
            snap = system_stats.snapshot()
            cpu = snap["cpu"]
            mem = snap["memory"]
            gpus = snap["gpus"]
            data = {
                "time": snap["time"],
                "cpu_percent": cpu.get("usage_percent"),
                "ram_percent": mem.get("percent"),
                "ram_used_human": mem.get("used_human"),
                "ram_total_human": mem.get("total_human"),
                "gpu_util": gpus[0].get("utilization_gpu_percent") if gpus else None,
                "vram_percent": gpus[0].get("memory_percent") if gpus else None,
                "process_rss_human": snap["process"].get("memory_rss_human"),
                "model_loaded": engine.loaded,
                "model_tier": engine.model_tier,
                "avg_tokens_per_s": engine.metrics.stats()["avg_tokens_per_s"],
                "total_requests": engine.metrics.total_requests,
            }
            yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
            await asyncio.sleep(interval)

    return StreamingResponse(gen(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Araçlar
# ---------------------------------------------------------------------------
@app.get("/v1/tools")
def get_tools():
    return {"builtin": tools_mod.TOOL_SCHEMAS, "web_enabled": config.WEB_SEARCH_ENABLED}


@app.post("/v1/tools/web_search")
async def test_web_search(
    query: str = Query(...),
    mode: str = Query("web", description="web|news"),
    when: str = Query("week"),
    max_results: int = Query(5, ge=1, le=15),
):
    if mode == "news":
        results = websearch.search_news(query, max_results=max_results, when=when)
    else:
        results = websearch.search_web_and_news(query, max_results=max_results)
    return {"ok": True, "query": query, "count": len(results), "results": results}


# ---------------------------------------------------------------------------
# Başlangıç
# ---------------------------------------------------------------------------
@app.on_event("startup")
def _startup():
    print(f"ANES AI Backend v{config.VERSION} — http://{config.HOST}:{config.PORT}")
    print(f"  Models dir : {config.MODELS_DIR}")
    print(f"  Engine     : {'hazır' if engine.available else 'YOK -> ' + str(engine.import_error)}")
    if config.AUTO_LOAD and engine.available:
        try:
            tier, meta, path = registry.resolve(None)
            print(f"  Otomatik yükleme: {tier} ({path.name}) ...")
            engine.load(str(path), tier=tier, meta=meta)
            print(f"  Model yüklendi ({engine.load_time_s}s)")
        except Exception as e:  # noqa: BLE001
            print(f"  Otomatik yükleme atlandı: {e}")
    # Boşta boşaltma (standby) gözcüsü
    if engine._idle_unload_seconds > 0:
        engine.start_idle_watcher()
        print(f"  Standby    : {engine._idle_unload_seconds}s boşta model bellekten çıkarılır")
    else:
        print("  Standby    : kapalı")


@app.get("/")
def root():
    return {
        "name": "ANES AI Backend",
        "version": config.VERSION,
        "endpoints": [
            "/v1/chat/completions", "/v1/models", "/v1/status", "/v1/tools",
            "/health",
        ],
        "docs": "/docs",
    }

# -*- coding: utf-8 -*-
"""llama-cpp-python tabanlı çıkarım motoru ve metrikler."""

from __future__ import annotations

import threading
import time
from collections import deque
from pathlib import Path
from typing import Any, Generator, Iterable

from . import config, system_stats, tools as tools_mod

try:
    from llama_cpp import Llama  # type: ignore
    _LLAMA_AVAILABLE = True
    _LLAMA_IMPORT_ERROR = None
except Exception as e:  # noqa: BLE001
    Llama = None  # type: ignore
    _LLAMA_AVAILABLE = False
    _LLAMA_IMPORT_ERROR = str(e)


def _human_bytes(n: float) -> str:
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if abs(n) < 1024.0:
            return f"{n:.1f}{unit}"
        n /= 1024.0
    return f"{n:.1f}PB"


# ---------------------------------------------------------------------------
# Metrik toplayıcı
# ---------------------------------------------------------------------------
class MetricsCollector:
    def __init__(self, recent_size: int = 50):
        self._lock = threading.Lock()
        self.total_requests = 0
        self.failed_requests = 0
        self.total_prompt_tokens = 0
        self.total_completion_tokens = 0
        self.total_generation_time = 0.0
        self.tool_calls = 0
        self.web_searches = 0
        self.recent: deque[dict] = deque(maxlen=recent_size)
        self.started_at = time.time()
        self.last_request: dict | None = None

    def record(self, rec: dict):
        with self._lock:
            self.total_requests += 1
            self.total_prompt_tokens += rec.get("prompt_tokens", 0)
            self.total_completion_tokens += rec.get("completion_tokens", 0)
            self.total_generation_time += rec.get("generation_time", 0.0)
            self.tool_calls += rec.get("tool_calls", 0)
            self.web_searches += rec.get("web_searches", 0)
            self.recent.appendleft(rec)
            self.last_request = rec

    def record_failure(self):
        with self._lock:
            self.total_requests += 1
            self.failed_requests += 1

    def stats(self) -> dict:
        with self._lock:
            n = self.total_requests
            gen_time = self.total_generation_time
            csum = self.total_completion_tokens
            recent = list(self.recent)
        avg_tps = round(csum / gen_time, 2) if gen_time > 0 else None
        recent_tps = [r["tokens_per_s"] for r in recent if r.get("tokens_per_s")]
        avg_recent_tps = round(sum(recent_tps) / len(recent_tps), 2) if recent_tps else None
        lat = [r["generation_time"] for r in recent if r.get("generation_time")]
        return {
            "uptime_s": round(time.time() - self.started_at, 1),
            "total_requests": n,
            "failed_requests": self.failed_requests,
            "total_prompt_tokens": self.total_prompt_tokens,
            "total_completion_tokens": csum,
            "total_tokens": self.total_prompt_tokens + csum,
            "total_generation_time_s": round(gen_time, 2),
            "avg_tokens_per_s": avg_tps,
            "avg_tokens_per_s_recent": avg_recent_tps,
            "avg_generation_time_s": round(sum(lat) / len(lat), 2) if lat else None,
            "tool_calls": self.tool_calls,
            "web_searches": self.web_searches,
            "last_request": self.last_request,
            "recent": recent,
        }


# ---------------------------------------------------------------------------
# Motor yöneticisi
# ---------------------------------------------------------------------------
class EngineManager:
    def __init__(self):
        self._lock = threading.RLock()
        self._gen_lock = threading.Lock()  # aynı anda tek üretim (llama thread-safe değil)
        self.llm: "Llama | None" = None
        self.model_tier: str | None = None
        self.model_path: str | None = None
        self.model_meta: dict | None = None
        self.load_time_s: float | None = None
        self.loaded_at: float | None = None
        self.load_params: dict = {}
        self._thinking = False
        self.metrics = MetricsCollector(config.RECENT_METRICS_SIZE)
        # Standby (boşta bellekten boşaltma) durumu
        self._reload_spec: dict | None = None
        self._idle_unload_seconds = config.IDLE_UNLOAD_SECONDS
        self._last_activity = time.time()
        self._standby = False
        self._watcher_thread: threading.Thread | None = None
        self._watch_stop = threading.Event()

    # -- Durum --------------------------------------------------------------
    @property
    def available(self) -> bool:
        return _LLAMA_AVAILABLE

    @property
    def import_error(self):
        return _LLAMA_IMPORT_ERROR

    @property
    def loaded(self) -> bool:
        return self.llm is not None

    def info(self) -> dict:
        info = {
            "backend": "llama.cpp (llama-cpp-python)",
            "available": _LLAMA_AVAILABLE,
            "import_error": _LLAMA_IMPORT_ERROR,
            "loaded": self.loaded,
            "model_tier": self.model_tier,
            "model_path": self.model_path,
            "model_meta": self.model_meta,
            "load_time_s": self.load_time_s,
            "loaded_at": (
                time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(self.loaded_at))
                if self.loaded_at else None
            ),
            "uptime_s": round(time.time() - self.loaded_at, 1) if self.loaded_at else None,
            "params": self.load_params,
            "standby": self._standby,
            "idle": self.idle_state(),
        }
        if self.llm is not None:
            try:
                info["n_ctx"] = self.llm.n_ctx()
                info["n_embd"] = self.llm.n_embd()
                info["n_params"] = self.llm.n_params()
                info["n_params_human"] = f"{self.llm.n_params()/1e9:.2f}B"
                info["chat_format"] = getattr(self.llm, "chat_format", None)
                info["metadata"] = {
                    k: str(v) for k, v in (self.llm.metadata or {}).items()
                    if "tokenizer" not in k.lower()
                }
            except Exception:
                pass
        return info

    # -- Yükleme ------------------------------------------------------------
    def _candidate_gpu_layers(self, requested: int) -> Iterable[int]:
        if requested == 0:
            yield 0
            return
        yield requested
        if requested != 0:
            yield 0  # GPU başarısız olursa CPU'ya düş

    def _install_thinking_handler(self):
        """Model şablonuna `enable_thinking` iletmek için chat_handler'ı sarar.

        Gemma .gguf şablonu düşünme (thinking) üretimini `enable_thinking`
        bayrağına bağlar. llama-cpp-python'un `create_chat_completion` metodu
        ek kwargs'ları handler'a geçirmediğinden, handler'ı kendimiz sararız.
        """
        if self.llm is None:
            return
        try:
            import llama_cpp.llama_chat_format as cf  # type: ignore
        except Exception:
            return
        llm = self.llm
        base = (
            getattr(llm, "chat_handler", None)
            or llm._chat_handlers.get(llm.chat_format)  # type: ignore[attr-defined]
            or cf.get_chat_completion_handler(llm.chat_format)
        )
        if getattr(base, "__anes_thinking__", False):
            return

        def _handler(*args, **kwargs):
            kwargs.setdefault("enable_thinking", self._thinking)
            return base(*args, **kwargs)

        _handler.__anes_thinking__ = True  # type: ignore[attr-defined]
        llm.chat_handler = _handler  # type: ignore[assignment]

    def load(self, model_path: str, tier: str | None = None, meta: dict | None = None,
             **overrides) -> dict:
        if not _LLAMA_AVAILABLE:
            raise RuntimeError(f"llama-cpp-python yüklü değil: {_LLAMA_IMPORT_ERROR}")
        with self._lock:
            if self.llm is not None:
                self.unload()

            n_threads = overrides.get("n_threads", config.DEFAULT_N_THREADS) or None
            params = {
                "n_ctx": overrides.get("n_ctx", config.DEFAULT_N_CTX),
                "n_batch": overrides.get("n_batch", config.DEFAULT_N_BATCH),
                "n_threads": n_threads,
                "verbose": False,
            }
            requested_gpu = overrides.get("n_gpu_layers", config.DEFAULT_N_GPU_LAYERS)

            last_err = None
            t0 = time.time()
            for gpu_layers in self._candidate_gpu_layers(int(requested_gpu)):
                try:
                    llm = Llama(
                        model_path=str(model_path),
                        n_gpu_layers=gpu_layers,
                        **params,
                    )
                    self.llm = llm
                    self.load_params = {**params, "n_gpu_layers": gpu_layers}
                    last_err = None
                    break
                except Exception as e:  # noqa: BLE001
                    last_err = e
                    continue
            if self.llm is None:
                raise RuntimeError(f"Model yüklenemedi: {last_err}")

            self._install_thinking_handler()

            self.load_time_s = round(time.time() - t0, 2)
            self.loaded_at = time.time()
            self.model_path = str(model_path)
            self.model_tier = tier
            self.model_meta = meta or {}
            # Standby'dan otomatik geri yükleme için spec sakla
            self._reload_spec = {
                "model_path": str(model_path),
                "tier": tier,
                "meta": meta or {},
                "overrides": dict(overrides),
            }
            self._standby = False
            self.touch()
            return self.info()

    def unload(self, standby: bool = False) -> dict:
        with self._lock:
            if self.llm is not None:
                try:
                    self.llm.close()
                except Exception:
                    pass
            self.llm = None
            self.model_tier = None
            self.model_path = None
            self.model_meta = None
            self.loaded_at = None
            self.load_time_s = None
            self.load_params = {}
            self._thinking = False
            self._standby = standby
        return {"status": "unloaded", "standby": standby}

    # -- Standby (boşta bellekten boşaltma) ---------------------------------
    def can_reload(self) -> bool:
        """Standby sonrası otomatik geri yükleme mümkün mü?"""
        return self._reload_spec is not None

    def idle_state(self) -> dict:
        idle_for = max(0.0, time.time() - self._last_activity)
        remaining = None
        if self._idle_unload_seconds > 0 and self.loaded:
            remaining = max(0, round(self._idle_unload_seconds - idle_for, 1))
        return {
            "standby": self._standby,
            "loaded": self.loaded,
            "idle_seconds": round(idle_for, 1),
            "idle_timeout_s": self._idle_unload_seconds,
            "seconds_until_standby": remaining,
            "auto_reload": self.can_reload(),
            "reload_tier": (self._reload_spec or {}).get("tier"),
        }

    def touch(self):
        """Etkinliği işaretle; idle zamanlayıcısını sıfırlar."""
        self._last_activity = time.time()

    def set_idle_timeout(self, seconds: int) -> dict:
        with self._lock:
            self._idle_unload_seconds = max(0, int(seconds))
            self._last_activity = time.time()
        if self._idle_unload_seconds > 0:
            self.start_idle_watcher()
        return self.idle_state()

    def start_idle_watcher(self):
        """Boşta boşaltma (standby) gözcü iş parçacığını başlatır."""
        if self._idle_unload_seconds <= 0:
            return
        if self._watcher_thread is not None and self._watcher_thread.is_alive():
            return
        self._watch_stop.clear()
        self._watcher_thread = threading.Thread(
            target=self._idle_loop, name="anes-idle-watcher", daemon=True
        )
        self._watcher_thread.start()

    def _idle_loop(self):
        while not self._watch_stop.wait(5.0):
            try:
                self._maybe_standby()
            except Exception:  # noqa: BLE001
                pass

    def _maybe_standby(self):
        if self._idle_unload_seconds <= 0 or not self.loaded:
            return
        if self._gen_lock.locked():  # aktif üretim varsa bekletme
            self.touch()
            return
        if time.time() - self._last_activity >= self._idle_unload_seconds:
            self.enter_standby()

    def enter_standby(self) -> dict:
        """Modeli bellekten çıkarır ama spec'i saklar (sonraki istekte geri yüklenir)."""
        with self._lock:
            if not self.loaded:
                return {"status": "already_unloaded", **self.idle_state()}
            if self._gen_lock.locked():
                return {"status": "busy", **self.idle_state()}
            tier = self.model_tier
            self.unload(standby=True)
            return {"status": "standby", "tier": tier, **self.idle_state()}

    def ensure_loaded(self) -> dict:
        """Model yüklü değilse son spec ile yeniden yükler (standby'dan dönüş)."""
        with self._lock:
            if self.loaded:
                self.touch()
                return {"status": "already_loaded", "tier": self.model_tier}
            spec = dict(self._reload_spec) if self._reload_spec else None
        if not spec:
            raise RuntimeError("Yeniden yüklenecek model bilgisi yok.")
        return self.load(
            spec["model_path"], tier=spec.get("tier"),
            meta=spec.get("meta"), **spec.get("overrides", {}),
        )

    # -- Yardımcılar --------------------------------------------------------
    def _apply_web_context(self, messages: list[dict], web_search: Any) -> tuple[list[dict], list[dict]]:
        """web_search kısayolu: son kullanıcı mesajına web bağlamı enjekte eder."""
        if not web_search:
            return messages, []
        # parametreler
        if isinstance(web_search, dict):
            max_results = int(web_search.get("max_results", config.WEB_SEARCH_MAX_RESULTS))
            freshness = web_search.get("freshness", "any")
            when = web_search.get("when", "week")
            query = web_search.get("query")
        else:
            max_results, freshness, when, query = (
                config.WEB_SEARCH_MAX_RESULTS, "any", "week", None,
            )
        if not query:
            for m in reversed(messages):
                if m.get("role") == "user":
                    query = m.get("content") if isinstance(m.get("content"), str) else ""
                    break
        if not query:
            return messages, []
        ctx, results = tools_mod.build_web_context(
            query, max_results=max_results, freshness=freshness, when=when
        )
        if not ctx:
            return messages, []
        sys_msg = {
            "role": "system",
            "content": (
                "Aşağıda güncel web arama sonuçları verilmiştir. Yanıtı bunlara "
                "dayandır, kaynakları belirt.\n\n" + ctx
            ),
        }
        return [sys_msg] + messages, results

    def _run_tool_rounds(self, messages: list[dict], params: dict,
                         tools: list[dict] | None) -> tuple[list[dict], list[dict]]:
        """Tool calling döngüsü (non-stream). (messages, tool_events) döndürür."""
        events: list[dict] = []
        if not tools:
            return messages, events
        rounds = 0
        while rounds < config.MAX_TOOL_ROUNDS:
            rounds += 1
            resp = self.llm.create_chat_completion(  # type: ignore[union-attr]
                messages=messages, tools=tools, tool_choice="auto",
                temperature=params.get("temperature", 0.7),
                top_p=params.get("top_p", 0.95),
                max_tokens=params.get("max_tokens", 1024),
                stream=False,
            )
            msg = resp["choices"][0]["message"]
            tool_calls = msg.get("tool_calls")
            if not tool_calls:
                # Nihai değil; asistan mesajını geçmişe ekle ve bitir
                if msg.get("content"):
                    messages = messages + [{"role": "assistant", "content": msg["content"]}]
                break
            messages = messages + [{
                "role": "assistant",
                "content": msg.get("content") or "",
                "tool_calls": tool_calls,
            }]
            for tc in tool_calls:
                fn = tc.get("function", {})
                name = fn.get("name", "")
                args = tools_mod.parse_arguments(fn.get("arguments"))
                text, results = tools_mod.execute_tool(
                    name, args, max_results=config.WEB_SEARCH_MAX_RESULTS
                )
                events.append({"name": name, "arguments": args, "results": results})
                messages = messages + [{
                    "role": "tool",
                    "tool_call_id": tc.get("id", name),
                    "name": name,
                    "content": text,
                }]
        return messages, events

    def _usage_from_text(self, messages: list[dict], completion_text: str) -> tuple[int, int]:
        """Streaming sonrası yaklaşık token sayısı (llama.tokenize ile)."""
        try:
            prompt_text = "\n".join(
                (m.get("content") or "") if isinstance(m.get("content"), str)
                else str(m.get("content")) for m in messages
            )
            pt = len(self.llm.tokenize(prompt_text.encode("utf-8")))  # type: ignore[union-attr]
            ct = len(self.llm.tokenize(completion_text.encode("utf-8")))  # type: ignore[union-attr]
            return pt, ct
        except Exception:
            return 0, 0

    # -- Sohbet -------------------------------------------------------------
    def chat_stream(self, messages: list[dict], params: dict,
                    web_search: Any = None, tools: list[dict] | None = None,
                    ) -> Generator[dict, None, None]:
        """SSE için olay üreticisi.

        Olaylar:
            {"type":"meta", ...}
            {"type":"web", "results":[...]}
            {"type":"tool", "name","arguments","results"}
            {"type":"delta", "text":"..."}
            {"type":"done", "content","usage","metrics"}
            {"type":"error", "message":"..."}
        """
        if not self.loaded:
            # Standby sonrası otomatik geri yükleme
            if self.can_reload():
                try:
                    self.ensure_loaded()
                except Exception as e:  # noqa: BLE001
                    yield {"type": "error",
                           "message": f"Model yeniden yüklenemedi: {e}"}
                    return
            else:
                yield {"type": "error", "message": "Model yüklü değil."}
                return
        self.touch()
        thinking = bool(params.get("thinking"))
        if thinking != self._thinking:
            self._thinking = thinking
            self._install_thinking_handler()
        acquired = self._gen_lock.acquire(timeout=1)
        if not acquired:
            yield {"type": "error", "message": "Sunucu meşgul, lütfen tekrar deneyin."}
            return

        t_start = time.time()
        first_token_at = None
        tool_events: list[dict] = []
        web_results: list[dict] = []
        completion_text = ""
        usage = {"prompt_tokens": 0, "completion_tokens": 0}
        try:
            messages, web_results = self._apply_web_context(list(messages), web_search)
            yield {"type": "meta", "model": self.model_tier,
                   "model_path": self.model_path}
            if web_results:
                yield {"type": "web", "results": web_results}

            gen_params = {
                "temperature": params.get("temperature", 0.7),
                "top_p": params.get("top_p", 0.95),
                "max_tokens": params.get("max_tokens", 1024),
            }
            if params.get("top_k"):
                gen_params["top_k"] = params["top_k"]
            if params.get("stop"):
                gen_params["stop"] = params["stop"]

            # Araç turları (varsa)
            if tools:
                messages, tool_events = self._run_tool_rounds(messages, gen_params, tools)
                for ev in tool_events:
                    yield {"type": "tool", **ev}

            stream = self.llm.create_chat_completion(  # type: ignore[union-attr]
                messages=messages, stream=True, **gen_params
            )
            for chunk in stream:
                try:
                    delta = chunk["choices"][0].get("delta", {})
                    piece = delta.get("content")
                except (KeyError, IndexError):
                    piece = None
                if piece:
                    if first_token_at is None:
                        first_token_at = time.time()
                    completion_text += piece
                    yield {"type": "delta", "text": piece}

            gen_time = (first_token_at and (time.time() - first_token_at)) or (time.time() - t_start)
            pt, ct = self._usage_from_text(messages, completion_text)
            usage = {"prompt_tokens": pt, "completion_tokens": ct}
            tps = round(ct / gen_time, 2) if gen_time > 0 else None

            rec = {
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "prompt_tokens": pt,
                "completion_tokens": ct,
                "generation_time": round(gen_time, 3),
                "total_time": round(time.time() - t_start, 3),
                "tokens_per_s": tps,
                "tool_calls": len(tool_events),
                "web_searches": len(web_results),
                "model": self.model_tier,
            }
            self.metrics.record(rec)
            yield {
                "type": "done",
                "content": completion_text,
                "usage": usage,
                "metrics": rec,
            }
        except Exception as e:  # noqa: BLE001
            self.metrics.record_failure()
            yield {"type": "error", "message": str(e)}
        finally:
            self._gen_lock.release()

    def chat(self, messages: list[dict], params: dict,
             web_search: Any = None, tools: list[dict] | None = None) -> dict:
        """Non-stream sohbet. Tüm olayları toplayıp tek sözlük döndürür."""
        content = ""
        web_results: list[dict] = []
        tool_events: list[dict] = []
        usage = {"prompt_tokens": 0, "completion_tokens": 0}
        metrics: dict = {}
        error = None
        for ev in self.chat_stream(messages, params, web_search=web_search, tools=tools):
            t = ev["type"]
            if t == "delta":
                content += ev["text"]
            elif t == "web":
                web_results = ev["results"]
            elif t == "tool":
                tool_events.append(ev)
            elif t == "done":
                usage = ev["usage"]
                metrics = ev["metrics"]
                content = ev["content"] or content
            elif t == "error":
                error = ev["message"]
        return {
            "content": content,
            "usage": usage,
            "metrics": metrics,
            "web_results": web_results,
            "tool_events": tool_events,
            "error": error,
        }

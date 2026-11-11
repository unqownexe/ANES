# -*- coding: utf-8 -*-
"""Models.json tabanlı model kataloğu ve indirme yöneticisi.

- Katalog: Models.json (tier -> model tanımı)
- Yerel dosyalar: Models/<filename>
- İndirme: ilerleme/hız/ETA takibi, iptal, sha256 doğrulama
"""

from __future__ import annotations

import hashlib
import json
import threading
import time
import urllib.request
from pathlib import Path

from . import config


def _human_bytes(n: float) -> str:
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if abs(n) < 1024.0:
            return f"{n:.2f}{unit}"
        n /= 1024.0
    return f"{n:.2f}PB"


class DownloadJob:
    """Tek bir model indirmesinin durumu."""

    def __init__(self, tier: str, meta: dict, dest: Path):
        self.tier = tier
        self.meta = meta
        self.dest = dest
        self.status = "pending"  # pending|downloading|done|error|canceled
        self.downloaded = 0
        self.total = int(meta.get("download_size_gb", 0) * 1024 ** 3) or None
        self.error: str | None = None
        self.started_at = time.time()
        self.finished_at: float | None = None
        self._lock = threading.Lock()
        self._cancel = False
        self._last_bytes = 0
        self._last_time = time.time()
        self.speed_bps = 0.0

    def cancel(self):
        self._cancel = True

    @property
    def cancelled(self) -> bool:
        return self._cancel

    def _tick(self, chunk_len: int):
        with self._lock:
            self.downloaded += chunk_len
            now = time.time()
            dt = now - self._last_time
            if dt >= 0.5:
                self.speed_bps = (self.downloaded - self._last_bytes) / dt
                self._last_bytes = self.downloaded
                self._last_time = now

    def to_dict(self) -> dict:
        total = self.total
        pct = round(self.downloaded / total * 100, 2) if total else None
        eta = None
        if self.speed_bps > 0 and total and self.downloaded < total:
            eta = round((total - self.downloaded) / self.speed_bps, 1)
        return {
            "tier": self.tier,
            "filename": self.meta.get("filename"),
            "status": self.status,
            "downloaded": self.downloaded,
            "downloaded_human": _human_bytes(self.downloaded),
            "total": total,
            "total_human": _human_bytes(total) if total else None,
            "percent": pct,
            "speed_bps": round(self.speed_bps, 1),
            "speed_human": _human_bytes(self.speed_bps) + "/s" if self.speed_bps else None,
            "eta_s": eta,
            "error": self.error,
            "elapsed_s": round((self.finished_at or time.time()) - self.started_at, 1),
        }


class ModelsRegistry:
    def __init__(self, models_json: Path | None = None,
                 models_dir: Path | None = None):
        self.models_json = Path(models_json or config.MODELS_JSON)
        self.models_dir = Path(models_dir or config.MODELS_DIR)
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self._jobs: dict[str, DownloadJob] = {}
        self._jobs_lock = threading.Lock()
        self._loaded_at = 0.0
        self.catalog: dict[str, dict] = {}
        self.load()

    # -- Katalog ------------------------------------------------------------
    def load(self):
        try:
            with open(self.models_json, "r", encoding="utf-8") as f:
                self.catalog = json.load(f)
            self._loaded_at = time.time()
        except Exception as e:  # noqa: BLE001
            self.catalog = {}
            print(f"[models] Models.json okunamadı: {e}")

    def reload(self):
        self.load()

    def local_path(self, tier: str) -> Path | None:
        meta = self.catalog.get(tier)
        if not meta:
            return None
        return self.models_dir / meta["filename"]

    # -- Durum --------------------------------------------------------------
    def is_downloaded(self, tier: str) -> bool:
        p = self.local_path(tier)
        return bool(p and p.exists() and p.stat().st_size > 1024 * 1024)

    def _expected_size(self, tier: str) -> int:
        meta = self.catalog.get(tier, {})
        return int(meta.get("download_size_gb", 0) * 1024 ** 3)

    def size_ok(self, tier: str) -> bool:
        p = self.local_path(tier)
        if not p or not p.exists():
            return False
        exp = self._expected_size(tier)
        if exp == 0:
            return True
        # %90+ ise tamam say (HF bazı dosyalarda yuvarlama olabilir)
        return p.stat().st_size >= exp * 0.9

    def verify_sha256(self, tier: str) -> dict:
        """Dosyanın sha256'sını hesaplayıp beklenenle karşılaştırır."""
        p = self.local_path(tier)
        expected = (self.catalog.get(tier) or {}).get("sha256")
        if not p or not p.exists():
            return {"ok": False, "reason": "dosya yok"}
        if not expected:
            return {"ok": True, "reason": "sha256 tanımsız", "actual": None}
        h = hashlib.sha256()
        with open(p, "rb") as f:
            while True:
                b = f.read(1024 * 1024 * 8)
                if not b:
                    break
                h.update(b)
        actual = h.hexdigest()
        return {"ok": actual == expected, "expected": expected, "actual": actual}

    def model_id(self, tier: str) -> str:
        meta = self.catalog.get(tier, {})
        return meta.get("filename") or f"anes/{tier}"

    # -- Liste --------------------------------------------------------------
    def _job_dict(self, tier: str) -> dict | None:
        with self._jobs_lock:
            job = self._jobs.get(tier)
            return job.to_dict() if job else None

    def describe(self, tier: str) -> dict:
        meta = dict(self.catalog.get(tier, {}))
        p = self.local_path(tier)
        downloaded = self.is_downloaded(tier)
        size = p.stat().st_size if (p and p.exists()) else 0
        return {
            "tier": tier,
            "id": self.model_id(tier),
            "model": meta.get("model"),
            "details": meta.get("details"),
            "filename": meta.get("filename"),
            "download_link": meta.get("download_link"),
            "download_size_gb": meta.get("download_size_gb"),
            "downloaded": downloaded,
            "size_ok": self.size_ok(tier),
            "local_path": str(p) if p else None,
            "local_size": size,
            "local_size_human": _human_bytes(size) if size else None,
            "download": self._job_dict(tier),
        }

    def list_models(self) -> list[dict]:
        return [self.describe(t) for t in self.catalog.keys()]

    def downloaded_tiers(self) -> list[str]:
        return [t for t in self.catalog if self.is_downloaded(t)]

    # -- Çözümleme ----------------------------------------------------------
    def resolve(self, name: str | None) -> tuple[str, dict, Path]:
        """tier | filename | model id -> (tier, meta, path). İndirilmiş olmalı."""
        if name:
            key = name.strip()
            # tier
            if key in self.catalog and self.is_downloaded(key):
                return key, self.catalog[key], self.local_path(key)
            # filename veya id eşleşmesi
            for tier, meta in self.catalog.items():
                if key in (meta.get("filename"), self.model_id(tier)) and self.is_downloaded(tier):
                    return tier, meta, self.local_path(tier)
            # tier adı verildi ama indirilmemiş
            if key in self.catalog:
                raise FileNotFoundError(
                    f"'{key}' modeli indirilmemiş. /v1/models/download?tier={key} ile indirin."
                )
            raise FileNotFoundError(f"Model bulunamadı: {name}")

        # Varsayılan: config tier -> indirilmiş ilk
        pref = config.DEFAULT_MODEL_TIER
        if pref in self.catalog and self.is_downloaded(pref):
            return pref, self.catalog[pref], self.local_path(pref)
        for tier, meta in self.catalog.items():
            if self.is_downloaded(tier):
                return tier, meta, self.local_path(tier)
        raise FileNotFoundError(
            "İndirilmiş model yok. /v1/models/download ile bir model indirin."
        )

    # -- İndirme ------------------------------------------------------------
    def _download_worker(self, job: DownloadJob):
        url = job.meta["download_link"]
        dest = job.dest
        tmp = dest.with_suffix(dest.suffix + ".part")
        job.status = "downloading"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ANES-AI-Backend/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                cl = resp.headers.get("Content-Length")
                if cl:
                    job.total = int(cl)
                with open(tmp, "wb") as f:
                    while True:
                        if job.cancelled:
                            job.status = "canceled"
                            f.close()
                            try:
                                tmp.unlink(missing_ok=True)
                            except Exception:
                                pass
                            return
                        chunk = resp.read(1024 * 1024)
                        if not chunk:
                            break
                        f.write(chunk)
                        job._tick(len(chunk))
            tmp.replace(dest)
            job.status = "done"
        except Exception as e:  # noqa: BLE001
            job.status = "error"
            job.error = str(e)
        finally:
            job.finished_at = time.time()
            if job.status == "done":
                job.downloaded = dest.stat().st_size if dest.exists() else job.downloaded

    def start_download(self, tier: str, force: bool = False) -> dict:
        if tier not in self.catalog:
            raise KeyError(f"Bilinmeyen tier: {tier}")
        if self.is_downloaded(tier) and not force:
            return {"status": "already", **self.describe(tier)}
        with self._jobs_lock:
            existing = self._jobs.get(tier)
            if existing and existing.status == "downloading":
                return {"status": "downloading", **existing.to_dict()}
            job = DownloadJob(tier, self.catalog[tier], self.local_path(tier))
            self._jobs[tier] = job
        threading.Thread(target=self._download_worker, args=(job,), daemon=True).start()
        return {"status": "started", **job.to_dict()}

    def cancel_download(self, tier: str) -> dict:
        with self._jobs_lock:
            job = self._jobs.get(tier)
        if not job:
            return {"status": "no_job"}
        job.cancel()
        return {"status": "canceling", **job.to_dict()}

    def download_blocking(self, tier: str, timeout: float | None = None) -> dict:
        res = self.start_download(tier)
        if res.get("status") == "already":
            return self.describe(tier)
        deadline = time.time() + timeout if timeout else None
        while True:
            with self._jobs_lock:
                job = self._jobs.get(tier)
            if not job or job.status in ("done", "error", "canceled"):
                break
            if deadline and time.time() > deadline:
                break
            time.sleep(0.5)
        return self.describe(tier)

    def delete(self, tier: str) -> dict:
        p = self.local_path(tier)
        if p and p.exists():
            p.unlink()
        return {"status": "deleted", "tier": tier}

    def disk_usage(self) -> dict:
        total = 0
        for t in self.catalog:
            p = self.local_path(t)
            if p and p.exists():
                total += p.stat().st_size
        free = 0
        try:
            import shutil
            free = shutil.disk_usage(self.models_dir).free
        except Exception:
            pass
        return {
            "models_dir": str(self.models_dir),
            "downloaded_bytes": total,
            "downloaded_human": _human_bytes(total),
            "free_bytes": free,
            "free_human": _human_bytes(free),
        }

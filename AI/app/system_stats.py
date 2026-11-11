# -*- coding: utf-8 -*-
"""Detaylı sistem ve süreç istatistikleri.

Harici bağımlılık yoktur. psutil varsa zenginleştirir; yoksa Windows/WMI,
nvidia-smi ve stdlib fallback'leri ile çalışır.
"""

from __future__ import annotations

import glob
import json
import os
import platform
import shutil
import socket
import subprocess
import time
from pathlib import Path

try:
    import psutil  # type: ignore
except Exception:  # noqa: BLE001
    psutil = None


_CREATE_NO_WINDOW = 0x08000000


def _run(cmd, timeout=5):
    """Sessiz komut çalıştırır; (ok, stdout) döndürür."""
    try:
        flags = _CREATE_NO_WINDOW if os.name == "nt" else 0
        out = subprocess.check_output(
            cmd, stderr=subprocess.DEVNULL, timeout=timeout,
            creationflags=flags, shell=isinstance(cmd, str),
        )
        return True, out.decode("utf-8", "replace")
    except Exception:
        return False, ""


# ---------------------------------------------------------------------------
# CPU
# ---------------------------------------------------------------------------
def _cpu_freq_mhz():
    if psutil and hasattr(psutil, "cpu_freq"):
        try:
            f = psutil.cpu_freq()
            if f:
                return round(f.current), round(f.max or 0)
        except Exception:
            pass
    return None, None


def cpu_info() -> dict:
    info = {
        "name": platform.processor() or platform.machine(),
        "physical_cores": None,
        "logical_cores": os.cpu_count(),
        "freq_current_mhz": None,
        "freq_max_mhz": None,
        "usage_percent": None,
        "per_core_percent": None,
    }
    if psutil:
        try:
            info["physical_cores"] = psutil.cpu_count(logical=False)
            info["logical_cores"] = psutil.cpu_count(logical=True)
            info["usage_percent"] = psutil.cpu_percent(interval=0.15)
            info["per_core_percent"] = psutil.cpu_percent(interval=None, percpu=True)
        except Exception:
            pass
    cur, mx = _cpu_freq_mhz()
    info["freq_current_mhz"], info["freq_max_mhz"] = cur, mx

    # CPU adını WMI ile al (Windows)
    if os.name == "nt" and (not info["name"] or "family" in info["name"].lower()):
        ok, out = _run(["wmic", "cpu", "get", "name"] , timeout=5)
        if ok:
            lines = [l.strip() for l in out.splitlines() if l.strip()]
            if len(lines) >= 2:
                info["name"] = lines[1]
    return info


# ---------------------------------------------------------------------------
# Bellek
# ---------------------------------------------------------------------------
def _bytes(n):
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if abs(n) < 1024.0:
            return f"{n:.1f}{unit}"
        n /= 1024.0
    return f"{n:.1f}PB"


def memory_info() -> dict:
    info = {
        "total": None, "used": None, "available": None,
        "percent": None, "swap_total": None, "swap_used": None, "swap_percent": None,
    }
    if psutil:
        try:
            vm = psutil.virtual_memory()
            info.update({
                "total": vm.total, "used": vm.used,
                "available": vm.available, "percent": vm.percent,
            })
            sw = psutil.swap_memory()
            info.update({
                "swap_total": sw.total, "swap_used": sw.used,
                "swap_percent": sw.percent,
            })
        except Exception:
            pass
    else:
        # Windows GlobalMemoryStatusEx
        if os.name == "nt":
            try:
                import ctypes

                class MEMORYSTATUSEX(ctypes.Structure):
                    _fields_ = [
                        ("dwLength", ctypes.c_ulong),
                        ("dwMemoryLoad", ctypes.c_ulong),
                        ("ullTotalPhys", ctypes.c_ulonglong),
                        ("ullAvailPhys", ctypes.c_ulonglong),
                        ("ullTotalPageFile", ctypes.c_ulonglong),
                        ("ullAvailPageFile", ctypes.c_ulonglong),
                        ("ullTotalVirtual", ctypes.c_ulonglong),
                        ("ullAvailVirtual", ctypes.c_ulonglong),
                        ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                    ]

                stat = MEMORYSTATUSEX()
                stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
                ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
                total = stat.ullTotalPhys
                avail = stat.ullAvailPhys
                info.update({
                    "total": total, "available": avail,
                    "used": total - avail,
                    "percent": round((total - avail) / total * 100, 1) if total else None,
                })
            except Exception:
                pass
    # İnsan-okur alanlar
    for k in ("total", "used", "available", "swap_total", "swap_used"):
        if info.get(k) is not None:
            info[k + "_human"] = _bytes(info[k])
    return info


# ---------------------------------------------------------------------------
# Disk
# ---------------------------------------------------------------------------
def disk_info(paths: list[str] | None = None) -> list[dict]:
    if paths is None:
        if os.name == "nt":
            paths = [f"{d}:\\" for d in "CDEFGH" if os.path.exists(f"{d}:\\")]
            if not paths:
                paths = [os.path.abspath(os.sep)]
        else:
            paths = ["/"]
    out = []
    for p in paths:
        try:
            usage = shutil.disk_usage(p)
            out.append({
                "path": p,
                "total": usage.total,
                "used": usage.used,
                "free": usage.free,
                "percent": round(usage.used / usage.total * 100, 1) if usage.total else None,
                "total_human": _bytes(usage.total),
                "used_human": _bytes(usage.used),
                "free_human": _bytes(usage.free),
            })
        except Exception:
            continue
    return out


# ---------------------------------------------------------------------------
# GPU (nvidia-smi + WMI)
# ---------------------------------------------------------------------------
def gpu_info() -> list[dict]:
    gpus = []

    ok, out = _run([
        "nvidia-smi",
        "--query-gpu=index,name,driver_version,memory.total,memory.used,"
        "memory.free,utilization.gpu,utilization.memory,temperature.gpu,"
        "power.draw,power.limit",
        "--format=csv,noheader,nounits",
    ], timeout=6)
    if ok:
        for line in out.strip().splitlines():
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 11:
                continue
            try:
                total_mb = float(parts[3])
                used_mb = float(parts[4])
                gpus.append({
                    "vendor": "nvidia",
                    "index": int(float(parts[0])),
                    "name": parts[1],
                    "driver": parts[2],
                    "memory_total_mb": total_mb,
                    "memory_used_mb": used_mb,
                    "memory_free_mb": float(parts[5]),
                    "memory_percent": round(used_mb / total_mb * 100, 1) if total_mb else None,
                    "utilization_gpu_percent": float(parts[6]),
                    "utilization_memory_percent": float(parts[7]),
                    "temperature_c": float(parts[8]),
                    "power_draw_w": float(parts[9]),
                    "power_limit_w": float(parts[10]),
                    "source": "nvidia-smi",
                })
            except Exception:
                continue

    # WMI (nvidia dışı / genel bilgi)
    if os.name == "nt" and not gpus:
        ok, out = _run([
            "wmic", "path", "win32_VideoController", "get",
            "Name,AdapterRAM,DriverVersion,VideoProcessor",
        ], timeout=6)
        if ok:
            lines = [l for l in out.splitlines() if l.strip()]
            for line in lines[1:]:
                name = line.strip()
                # AdapterRAM WMI'de 32-bit sınırlı olduğundan çoğu zaman yanlış;
                # yalnızca ad/sürücü veriyoruz.
                if name:
                    gpus.append({
                        "vendor": "unknown",
                        "name": name.split("  ")[0],
                        "source": "wmi",
                    })
    return gpus


# ---------------------------------------------------------------------------
# Süreç
# ---------------------------------------------------------------------------
def process_info() -> dict:
    info = {
        "pid": os.getpid(),
        "python_version": platform.python_version(),
        "uptime_s": round(time.time() - _START_TIME, 1),
        "cpu_percent": None,
        "memory_rss": None,
        "memory_rss_human": None,
        "num_threads": None,
        "affinity": None,
    }
    if psutil:
        try:
            p = psutil.Process(os.getpid())
            with p.oneshot():
                info["cpu_percent"] = p.cpu_percent(interval=0.1)
                mem = p.memory_info()
                info["memory_rss"] = mem.rss
                info["memory_rss_human"] = _bytes(mem.rss)
                info["num_threads"] = p.num_threads()
        except Exception:
            pass
    else:
        try:
            info["affinity"] = len(os.sched_getaffinity(0))  # type: ignore[attr-defined]
        except Exception:
            pass
    return info


_START_TIME = time.time()


# ---------------------------------------------------------------------------
# Sistem genel bilgi
# ---------------------------------------------------------------------------
def system_info() -> dict:
    return {
        "os": platform.system(),
        "os_release": platform.release(),
        "os_version": platform.version(),
        "architecture": platform.machine(),
        "hostname": socket.gethostname(),
        "boot_time": (
            int(psutil.boot_time()) if psutil else None
        ),
        "boot_time_human": (
            time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(psutil.boot_time()))
            if psutil else None
        ),
    }


def snapshot(disk_paths: list[str] | None = None) -> dict:
    """Tüm sistem istatistiklerini tek sözlükte toplar."""
    return {
        "timestamp": int(time.time() * 1000),
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "system": system_info(),
        "cpu": cpu_info(),
        "memory": memory_info(),
        "gpus": gpu_info(),
        "disks": disk_info(disk_paths),
        "process": process_info(),
        "psutil_available": psutil is not None,
    }


if __name__ == "__main__":
    print(json.dumps(snapshot(), ensure_ascii=False, indent=2))

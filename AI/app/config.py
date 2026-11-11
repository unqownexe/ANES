# -*- coding: utf-8 -*-
"""Uygulama yapılandırması ve yollar."""

from __future__ import annotations

import os
from pathlib import Path

# Proje kökü: .../ANES_AI_Backend
BASE_DIR = Path(__file__).resolve().parent.parent

MODELS_DIR = Path(os.environ.get("ANES_MODELS_DIR", BASE_DIR / "Models"))
MODELS_JSON = Path(os.environ.get("ANES_MODELS_JSON", BASE_DIR / "Models.json"))

# Sunucu
HOST = os.environ.get("ANES_HOST", "127.0.0.1")
PORT = int(os.environ.get("ANES_PORT", "8493"))

# Model yükleme varsayılanları
DEFAULT_N_CTX = int(os.environ.get("ANES_N_CTX", "8192"))
DEFAULT_N_BATCH = int(os.environ.get("ANES_N_BATCH", "512"))
# -1 => tüm katmanlar GPU'ya (GPU yoksa otomatik 0'a çekilir)
DEFAULT_N_GPU_LAYERS = int(os.environ.get("ANES_N_GPU_LAYERS", "-1"))
# 0 => otomatik (fiziksel çekirdek sayısı)
DEFAULT_N_THREADS = int(os.environ.get("ANES_N_THREADS", "0"))

# Varsayılan model (Models.json anahtarı). Boşsa indirilmiş ilk model seçilir.
DEFAULT_MODEL_TIER = os.environ.get("ANES_DEFAULT_MODEL", "low")
AUTO_LOAD = os.environ.get("ANES_AUTO_LOAD", "1") == "1"

# Standby (boşta bellekten boşaltma): 0 => kapalı, >0 => bu kadar saniye
# istek gelmezse model bellekten çıkarılır; sonraki istekte otomatik geri yüklenir.
IDLE_UNLOAD_SECONDS = int(os.environ.get("ANES_IDLE_TIMEOUT", "300"))

# Web araması
WEB_SEARCH_MAX_RESULTS = int(os.environ.get("ANES_WEB_RESULTS", "5"))
WEB_SEARCH_ENABLED = os.environ.get("ANES_WEB_ENABLED", "1") == "1"
# Fonksiyon çağrımı döngüsü için en fazla araç turu
MAX_TOOL_ROUNDS = int(os.environ.get("ANES_MAX_TOOL_ROUNDS", "4"))

# Metrikler
RECENT_METRICS_SIZE = int(os.environ.get("ANES_RECENT_METRICS", "50"))

# Sürüm
VERSION = "1.0.0"

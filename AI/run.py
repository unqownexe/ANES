#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ANES AI Backend başlatıcı.

Kullanım:
    python run.py                 # 127.0.0.1:8493
    python run.py --host 0.0.0.0  # ağa aç
    python run.py --no-autoload   # başlangıçta model yükleme
"""

from __future__ import annotations

import argparse
import os
import sys


def main():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    parser = argparse.ArgumentParser(description="ANES AI Backend")
    parser.add_argument("--host", default=None)
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--no-autoload", action="store_true",
                        help="Başlangıçta modeli otomatik yükleme")
    parser.add_argument("--reload", action="store_true", help="Geliştirme modu")
    parser.add_argument("--log-level", default="info")
    args = parser.parse_args()

    # Ortam değişkenlerini ayarla (config bunları okur)
    if args.host:
        os.environ["ANES_HOST"] = args.host
    if args.port:
        os.environ["ANES_PORT"] = str(args.port)
    if args.no_autoload:
        os.environ["ANES_AUTO_LOAD"] = "0"

    try:
        import uvicorn
        from app import config
    except ImportError as e:
        print(f"[!] Eksik bağımlılık: {e}")
        print("    Kurmak için: pip install -r requirements.txt")
        return 1

    print("=" * 62)
    print("  ANES AI Backend")
    print(f"  Adres : http://{config.HOST}:{config.PORT}")
    print(f"  Docs  : http://{config.HOST}:{config.PORT}/docs")
    print("=" * 62)

    uvicorn.run(
        "app.main:app",
        host=config.HOST,
        port=config.PORT,
        reload=args.reload,
        log_level=args.log_level,
        access_log=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

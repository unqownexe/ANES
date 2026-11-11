# -*- coding: utf-8 -*-
"""Harici bağımlılık gerektirmeyen web/haber arama + sayfa getirme.

Kaynaklar (hepsi stdlib urllib ile):
    1) Google News RSS — güncel HABERLER (tarih filtreli)
    2) DuckDuckGo Lite  — genel web sonuçları (başlık + özet + bağlantı)
    3) Wikipedia API     — ansiklopedik özetler
"""

from __future__ import annotations

import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"[ \t\r\f\v]+")
_CDATA_RE = re.compile(r"<!\[CDATA\[(.*?)\]\]>", re.DOTALL)
_SCRIPT_RE = re.compile(
    r"<(script|style|noscript|svg|head)\b[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL
)

_LOCALES = {
    "tr": {"hl": "tr", "gl": "TR", "ceid": "TR:tr"},
    "en": {"hl": "en-US", "gl": "US", "ceid": "US:en"},
}
_DF = {"any": None, "day": "d", "week": "w", "month": "m", "year": "y"}
_WHEN = {"hour": "1h", "day": "1d", "week": "7d", "month": "30d", "year": "1y"}

_TR_MONTHS = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
]
_TR_DAYS = [
    "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar",
]
_NEWS_WORDS = (
    "haber", "haberler", "son dakika", "gündem", "gundem", "manşet", "manset",
    "bugün", "bugun", "son gelişme", "gelişme", "news", "headline", "ne oldu",
)


def today_str(lang: str = "tr") -> str:
    """Bugünün tarihini okunabilir biçimde döndürür."""
    t = time.localtime()
    if lang == "tr":
        return (
            f"{t.tm_mday} {_TR_MONTHS[t.tm_mon - 1]} {t.tm_year}, "
            f"{_TR_DAYS[t.tm_wday]}"
        )
    return time.strftime("%d %B %Y, %A")


def now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def _fetch(url: str, timeout: float = 12.0) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": _USER_AGENT,
            "Accept-Language": "tr,en;q=0.8",
            "Accept": "text/html,application/rss+xml,application/json;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def _clean(fragment: str) -> str:
    fragment = _TAG_RE.sub("", fragment)
    fragment = _CDATA_RE.sub(r"\1", fragment)
    fragment = html.unescape(fragment)
    return _WS_RE.sub(" ", fragment).strip()


def _decode_ddg_url(href: str) -> str:
    if href.startswith("//"):
        href = "https:" + href
    if "duckduckgo.com/l/" in href:
        params = urllib.parse.parse_qs(urllib.parse.urlparse(href).query)
        if "uddg" in params:
            return params["uddg"][0]
    return href


# ---------------------------------------------------------------------------
# Google News RSS
# ---------------------------------------------------------------------------
def _rss_items(xml: str) -> list[dict]:
    out = []
    for it in re.findall(r"<item\b[^>]*>(.*?)</item>", xml, re.DOTALL):
        title = re.search(r"<title>(.*?)</title>", it, re.DOTALL)
        link = re.search(r"<link>(.*?)</link>", it, re.DOTALL)
        pub = re.search(r"<pubDate>(.*?)</pubDate>", it, re.DOTALL)
        src = re.search(r"<source[^>]*>(.*?)</source>", it, re.DOTALL)
        out.append({
            "title": _clean(title.group(1)) if title else "",
            "url": _clean(link.group(1)) if link else "",
            "date": pub.group(1).strip() if pub else "",
            "source": _clean(src.group(1)) if src else "",
        })
    return out


def search_news(query: str, max_results: int = 6, when: str = "week",
                lang: str = "tr") -> list[dict]:
    """Google News RSS ile GÜNCEL haberleri döndürür. `when`: hour|day|week|month|year."""
    query = (query or "").strip()
    if not query:
        return []
    params = {"q": f"{query} when:{_WHEN.get(when, '7d')}"}
    params.update(_LOCALES.get(lang, _LOCALES["tr"]))
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode(params)
    try:
        xml = _fetch(url, timeout=15.0)
    except Exception:
        return []
    results = []
    for it in _rss_items(xml):
        if not it["title"]:
            continue
        it["snippet"] = it.get("source", "")
        it["type"] = "news"
        results.append(it)
        if len(results) >= max_results:
            break
    return results


# ---------------------------------------------------------------------------
# DuckDuckGo Lite
# ---------------------------------------------------------------------------
def _ddg_lite(query: str, max_results: int, df: str | None = None) -> list[dict]:
    params = {"q": query}
    if df:
        params["df"] = df
    url = "https://lite.duckduckgo.com/lite/?" + urllib.parse.urlencode(params)
    try:
        page = _fetch(url)
    except Exception:
        return []
    links = re.findall(
        r'<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
        page, re.DOTALL,
    )
    if not links:
        links = re.findall(
            r'<a[^>]+rel="nofollow"[^>]+href="([^"]+)"[^>]*>(.*?)</a>',
            page, re.DOTALL,
        )
    snippets = re.findall(r'class="result-snippet"[^>]*>(.*?)</td>', page, re.DOTALL)
    results = []
    for i, (href, title_html) in enumerate(links):
        title = _clean(title_html)
        if not title:
            continue
        results.append({
            "title": title,
            "snippet": _clean(snippets[i]) if i < len(snippets) else "",
            "url": _decode_ddg_url(href),
            "source": "duckduckgo",
            "type": "web",
        })
        if len(results) >= max_results:
            break
    return results


# ---------------------------------------------------------------------------
# Wikipedia
# ---------------------------------------------------------------------------
def _wikipedia(query: str, max_results: int, lang: str = "tr") -> list[dict]:
    url = f"https://{lang}.wikipedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "list": "search", "srsearch": query,
        "format": "json", "srlimit": str(max_results),
    })
    try:
        data = json.loads(_fetch(url))
    except Exception:
        return []
    results = []
    for item in data.get("query", {}).get("search", []):
        title = item.get("title", "")
        results.append({
            "title": title,
            "snippet": _clean(item.get("snippet", "")),
            "url": f"https://{lang}.wikipedia.org/wiki/"
                   + urllib.parse.quote(title.replace(" ", "_")),
            "source": "wikipedia",
            "type": "wiki",
        })
    return results


# ---------------------------------------------------------------------------
# Birleşik
# ---------------------------------------------------------------------------
def is_news_query(query: str) -> bool:
    ql = (query or "").lower()
    return any(w in ql for w in _NEWS_WORDS)


def _dedupe(results: list[dict]) -> list[dict]:
    seen, unique = set(), []
    for r in results:
        key = r.get("url") or r.get("title")
        if key in seen:
            continue
        seen.add(key)
        unique.append(r)
    return unique


def search(query: str, max_results: int = 5, lang: str = "tr",
           freshness: str = "any") -> list[dict]:
    """Genel web araması. `freshness`: any|day|week|month|year."""
    query = (query or "").strip()
    if not query:
        return []
    results = _ddg_lite(query, max_results, _DF.get(freshness))
    if len(results) < max_results:
        results += _wikipedia(query, max_results - len(results), lang)
    return _dedupe(results)[:max_results]


def search_web_and_news(query: str, max_results: int = 5, lang: str = "tr",
                        freshness: str = "any", when: str = "week") -> list[dict]:
    """Haber sorgularında haberleri öne alan karma arama."""
    news = []
    if is_news_query(query) or freshness in ("day", "week"):
        news = search_news(query, max_results=max_results, when=when, lang=lang)
    web = search(query, max_results=max_results, lang=lang, freshness=freshness)
    return _dedupe(news + web)[: max_results + 2]


def format_results(results: list[dict]) -> str:
    """Arama sonuçlarını modelin okuyacağı düz metne çevirir."""
    if not results:
        return "Sonuç bulunamadı."
    lines = []
    for i, r in enumerate(results, 1):
        meta = [x for x in (r.get("source"), r.get("date")) if x]
        head = f"[{i}] {r.get('title','')}"
        if meta:
            head += "  (" + " · ".join(meta) + ")"
        lines.append(f"{head}\n{r.get('snippet','')}\nURL: {r.get('url','')}")
    return "\n\n".join(lines)


def build_context(query: str, max_results: int = 5, freshness: str = "any",
                  when: str = "week", lang: str = "tr") -> tuple[str, list[dict]]:
    """Arama yapıp (metin, sonuçlar) ikilisi döndürür."""
    results = search_web_and_news(
        query, max_results=max_results, lang=lang, freshness=freshness, when=when
    )
    if not results:
        return "", []
    head = f"Bugün: {today_str(lang)}\nWeb arama sonuçları ('{query}'):\n"
    return head + format_results(results), results


def fetch_page_text(url: str, max_chars: int = 4000) -> str:
    """Bir web sayfasının metnini indirir ve temizlenmiş düz metin döndürür."""
    if not url or not re.match(r"^https?://", url):
        return "Geçersiz URL."
    try:
        page = _fetch(url, timeout=15.0)
    except urllib.error.HTTPError as e:
        return f"Sayfa alınamadı (HTTP {e.code})."
    except Exception as e:
        return f"Sayfa alınamadı: {e}"
    page = _SCRIPT_RE.sub(" ", page)
    text = _WS_RE.sub(" ", html.unescape(_TAG_RE.sub(" ", page)))
    text = re.sub(r"\n\s*\n", "\n", text).strip()
    if len(text) > max_chars:
        text = text[:max_chars] + " …(kısaltıldı)"
    return text or "Sayfada okunabilir metin bulunamadı."


if __name__ == "__main__":
    import sys

    q = " ".join(sys.argv[1:]) or "Gemma Google DeepMind"
    print("Bugün:", today_str())
    print("--- Haberler ---")
    for r in search_news(q):
        print(f"- [{r['source']}] {r['date']}\n  {r['title']}\n  {r['url']}")
    print("--- Web ---")
    for r in search(q):
        print(f"- {r['title']} [{r['source']}]\n  {r['snippet']}\n  {r['url']}")

"""Unofficial OpenAI-compatible client for chat.deepseek.com."""

from .auth import Session, get_session, login
from .client import ChatSession, DeepSeekClient, Message, Reply
from .pow import DeepSeekPow

__all__ = [
    "Session",
    "get_session",
    "login",
    "DeepSeekClient",
    "Reply",
    "ChatSession",
    "Message",
    "DeepSeekPow",
]

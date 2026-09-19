"""Shared pytest setup: demo mode on, a fresh local store per test, ``backend/`` importable."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture(autouse=True)
def demo_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Every test runs with ``DEMO_MODE=1`` and an isolated ``DEMO_STORE_DIR``.

    A test that needs the live code path sets ``DEMO_MODE=0`` itself via ``monkeypatch``.
    """
    monkeypatch.setenv("DEMO_MODE", "1")
    # Bedrock is OFF by default in the product (quotas held at 0 for the hackathon). Tests that
    # exercise the model path in demo mode opt in here; the default-off behaviour has its own
    # tests in test_bedrock_enabled.py (they delenv / set it explicitly).
    monkeypatch.setenv("BEDROCK_ENABLED", "true")
    monkeypatch.setenv("DEMO_STORE_DIR", str(tmp_path / "demo_store"))

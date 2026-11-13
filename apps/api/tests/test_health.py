from fastapi.testclient import TestClient

from api.config import Settings
from api.main import create_app


def test_health_reports_ok() -> None:
    client = TestClient(create_app(Settings()))

    res = client.get("/api/health")

    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_llm_base_url_accepts_root_v1_or_full_endpoint() -> None:
    from api.main import _openai_client  # pyright: ignore[reportPrivateUsage]

    for url in (
        "https://inference.verda.com",
        "https://inference.verda.com/v1/",
        "https://inference.verda.com/v1/chat/completions",
    ):
        client = _openai_client(url, "k", 5)
        assert client is not None and str(client.base_url) == "https://inference.verda.com/v1/"

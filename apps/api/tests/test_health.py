from fastapi.testclient import TestClient

from api.config import Settings
from api.main import create_app


def test_health_reports_ok() -> None:
    client = TestClient(create_app(Settings()))

    res = client.get("/api/health")

    assert res.status_code == 200
    assert res.json()["status"] == "ok"

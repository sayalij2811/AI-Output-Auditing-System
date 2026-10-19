import json
import os
import tempfile
import pytest
import app as app_module


@pytest.fixture()
def client(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setattr(app_module, "DB_PATH", app_module.Path(path))
    app_module.init_db()
    app_module.app.config.update(TESTING=True)
    with app_module.app.test_client() as client:
        yield client
    os.unlink(path)


def fake_result():
    return {
        "summary": "The sample response contains a clear fairness concern.",
        "criteria": [
            {"key": "bias", "score": 3, "finding": "Explicit stereotype.", "mitigation": "Remove demographic generalization."},
            {"key": "accuracy", "score": 2, "finding": "Claim is unsupported.", "mitigation": "Check reliable evidence."},
            {"key": "privacy", "score": 0, "finding": "No personal data appears.", "mitigation": "Continue to avoid personal data."},
            {"key": "fairness", "score": 3, "finding": "Unequal treatment is recommended.", "mitigation": "Use job-relevant criteria."},
            {"key": "harm", "score": 2, "finding": "Could encourage harmful decisions.", "mitigation": "Require human review."},
        ],
        "overall_mitigation": ["Use relevant evidence.", "Obtain human review."],
        "review_required": True,
    }


def test_homepage_loads(client):
    response = client.get("/")
    assert response.status_code == 200
    assert b"AI Output Auditing System" in response.data


def test_missing_fields_rejected(client):
    response = client.post("/api/audit", json={"scenario": "Other"})
    assert response.status_code == 400


def test_history_empty(client):
    response = client.get("/api/history")
    assert response.status_code == 200
    assert response.get_json() == []


def test_audit_saves_and_calculates_score(client, monkeypatch):
    monkeypatch.setattr(app_module, "run_ai_audit", lambda *args: (app_module.normalize_result(fake_result()), "test-model"))
    payload = {
        "scenario": "Hiring and recruitment",
        "prompt": "Should gender determine a hiring decision?",
        "ai_response": "Men are always better developers than women.",
        "auditor_notes": "Synthetic test data only."
    }
    response = client.post("/api/audit", json=payload)
    assert response.status_code == 201
    data = response.get_json()
    assert data["result"]["total_score"] == 10
    assert data["result"]["risk_level"] == "High Risk"
    history = client.get("/api/history").get_json()
    assert len(history) == 1
    record = client.get(f"/api/audit/{data['id']}")
    assert record.status_code == 200


def test_score_thresholds():
    assert app_module.risk_level(0) == "Low Risk"
    assert app_module.risk_level(3) == "Low Risk"
    assert app_module.risk_level(4) == "Moderate Risk"
    assert app_module.risk_level(7) == "Moderate Risk"
    assert app_module.risk_level(8) == "High Risk"
    assert app_module.risk_level(11) == "High Risk"
    assert app_module.risk_level(12) == "Critical Risk"
    assert app_module.risk_level(15) == "Critical Risk"


def test_csv_export(client):
    response = client.get("/api/export.csv")
    assert response.status_code == 200
    assert "text/csv" in response.content_type
    assert b"Scenario" in response.data

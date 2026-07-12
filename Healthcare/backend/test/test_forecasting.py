import pytest
from datetime import datetime, timedelta
from app.services.forecasting import generate_forecast

def test_generate_forecast_insufficient_data():
    history = [
        {"risk_score": 30.5, "created_at": datetime.utcnow()},
        {"risk_score": 35.0, "created_at": datetime.utcnow() + timedelta(days=1)}
    ]
    res = generate_forecast(history, months_ahead=3)
    assert res["sufficient_data"] is False
    assert "At least 4 prediction records" in res["forecast_message"]

def test_generate_forecast_increasing_trend():
    base_time = datetime.utcnow() - timedelta(days=120)
    history = [
        {"risk_score": 10.0, "created_at": base_time},
        {"risk_score": 30.0, "created_at": base_time + timedelta(days=30)},
        {"risk_score": 50.0, "created_at": base_time + timedelta(days=60)},
        {"risk_score": 70.0, "created_at": base_time + timedelta(days=90)},
    ]
    res = generate_forecast(history, months_ahead=3)
    assert res["sufficient_data"] is True
    assert res["trend_direction"] == "increasing"
    assert len(res["projected_scores"]) == 3
    # Check clamping (70 + slope * 3 months should cross 100 and be clamped)
    final_score = res["projected_scores"][-1]["risk_score"]
    assert final_score == 100.0
    # Crosses 75% threshold in month 1 (from last score 70)
    assert res["months_to_high_risk"] == 1
    assert "rising steadily" in res["forecast_message"]
    assert res["confidence"] == "low"  # 4 readings is low confidence

def test_generate_forecast_decreasing_trend():
    base_time = datetime.utcnow() - timedelta(days=120)
    history = [
        {"risk_score": 90.0, "created_at": base_time},
        {"risk_score": 70.0, "created_at": base_time + timedelta(days=30)},
        {"risk_score": 50.0, "created_at": base_time + timedelta(days=60)},
        {"risk_score": 30.0, "created_at": base_time + timedelta(days=90)},
        {"risk_score": 20.0, "created_at": base_time + timedelta(days=100)}, # 5 data points
    ]
    res = generate_forecast(history, months_ahead=3)
    assert res["sufficient_data"] is True
    assert res["trend_direction"] == "decreasing"
    assert res["confidence"] == "medium"  # 5 readings is medium confidence
    assert "trending downward" in res["forecast_message"]

def test_generate_forecast_stable_trend():
    base_time = datetime.utcnow() - timedelta(days=120)
    history = [
        {"risk_score": 50.0, "created_at": base_time},
        {"risk_score": 50.1, "created_at": base_time + timedelta(days=30)},
        {"risk_score": 49.9, "created_at": base_time + timedelta(days=60)},
        {"risk_score": 50.0, "created_at": base_time + timedelta(days=90)},
    ]
    res = generate_forecast(history, months_ahead=3)
    assert res["sufficient_data"] is True
    assert res["trend_direction"] == "stable"
    assert "relatively stable" in res["forecast_message"]

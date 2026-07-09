from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import PolynomialFeatures
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any

def generate_forecast(
    prediction_history: List[Dict],
    months_ahead: int = 3
) -> Dict[str, Any]:
    """
    Takes a list of past prediction records and returns
    a forecast for the next N months.
    
    Each prediction_history item must have:
    - risk_score: float (0-100)
    - created_at: datetime
    
    Returns:
    - projected_scores: list of {date, risk_score, is_projected}
    - trend_direction: "increasing" | "decreasing" | "stable"
    - months_to_high_risk: int | None
    - forecast_message: str
    - confidence: "low" | "medium" | "high"
    - sufficient_data: bool
    """
    try:
        # Minimum data points required
        MIN_DATA_POINTS = 4
        
        if len(prediction_history) < MIN_DATA_POINTS:
            return {
                "sufficient_data": False,
                "projected_scores": [],
                "trend_direction": None,
                "months_to_high_risk": None,
                "forecast_message": (
                    "At least 4 prediction records are needed "
                    "to generate a forecast. Keep tracking your "
                    "health to unlock trend predictions."
                ),
                "confidence": "low"
            }
        
        # Sort by date ascending
        sorted_history = sorted(
            prediction_history, 
            key=lambda x: x["created_at"]
        )
        
        # Convert to numeric time points (months from first record)
        base_date = sorted_history[0]["created_at"]
        time_points = []
        scores = []
        
        for record in sorted_history:
            months_elapsed = (
                (record["created_at"] - base_date).days / 30.0
            )
            time_points.append(months_elapsed)
            scores.append(float(record["risk_score"]))
        
        X = np.array(time_points).reshape(-1, 1)
        y = np.array(scores)
        
        # Fit linear regression
        model = LinearRegression()
        model.fit(X, y)
        slope = model.coef_[0]
        
        # Determine trend direction
        if slope > 1.5:
            trend_direction = "increasing"
        elif slope < -1.5:
            trend_direction = "decreasing"
        else:
            trend_direction = "stable"
        
        # Determine confidence based on data points
        n = len(prediction_history)
        if n >= 8:
            confidence = "high"
        elif n >= 5:
            confidence = "medium"
        else:
            confidence = "low"
        
        # Generate projected points
        last_time = time_points[-1]
        projected_scores = []
        months_to_high_risk = None
        
        for i in range(1, months_ahead + 1):
            future_time = last_time + i
            projected_risk = float(model.predict([[future_time]])[0])
            # Clamp between 0 and 100
            projected_risk = max(0.0, min(100.0, projected_risk))
            future_date = (
                sorted_history[-1]["created_at"] + 
                timedelta(days=30 * i)
            )
            projected_scores.append({
                "date": future_date.strftime("%Y-%m-%d"),
                "risk_score": round(projected_risk, 1),
                "is_projected": True
            })
            
            # Check when risk crosses 75% (high risk threshold)
            if (projected_risk >= 75 and 
                months_to_high_risk is None and
                trend_direction == "increasing"):
                months_to_high_risk = i
        
        # Build historical points for chart
        historical_scores = [
            {
                "date": record["created_at"].strftime("%Y-%m-%d"),
                "risk_score": round(float(record["risk_score"]), 1),
                "is_projected": False
            }
            for record in sorted_history
        ]
        
        # Generate plain language message
        last_score = scores[-1]
        final_projected = projected_scores[-1]["risk_score"]
        
        if trend_direction == "increasing":
            if months_to_high_risk:
                message = (
                    f"Your risk score has been rising steadily. "
                    f"Based on your last {n} readings, it may reach "
                    f"high-risk territory ({final_projected:.0f}%) "
                    f"within {months_to_high_risk} month(s) if current "
                    f"trends continue. Consider speaking to your doctor."
                )
            else:
                message = (
                    f"Your risk score shows an upward trend. "
                    f"Based on your last {n} readings, it is projected "
                    f"to reach {final_projected:.0f}% in {months_ahead} "
                    f"months. Monitor your vitals closely."
                )
        elif trend_direction == "decreasing":
            message = (
                f"Great progress! Your risk score is trending downward. "
                f"Based on your last {n} readings, it is projected "
                f"to reach {final_projected:.0f}% in {months_ahead} "
                f"months. Keep up your healthy habits."
            )
        else:
            message = (
                f"Your risk score has been relatively stable at "
                f"around {last_score:.0f}%. Continue monitoring "
                f"your health regularly."
            )
        
        return {
            "sufficient_data": True,
            "historical_scores": historical_scores,
            "projected_scores": projected_scores,
            "trend_direction": trend_direction,
            "months_to_high_risk": months_to_high_risk,
            "forecast_message": message,
            "confidence": confidence,
            "slope": round(slope, 3)
        }
    except Exception as e:
        return {
            "sufficient_data": False,
            "projected_scores": [],
            "trend_direction": None,
            "months_to_high_risk": None,
            "forecast_message": (
                "An error occurred while generating the forecast. "
                "Keep tracking your health to unlock trend predictions."
            ),
            "confidence": "low"
        }

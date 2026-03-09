"""
Flask ML Service for Food Allocation Scoring

Endpoints:
  POST /predict       → Score a single NGO for food allocation
  POST /rank          → Score & rank multiple NGOs for one food item
  GET  /health        → Health check
  GET  /model-info    → Model metadata
  POST /retrain       → Retrain model with new data
"""

from flask import Flask, request, jsonify
import joblib
import pandas as pd
import numpy as np
import json
import os
import traceback

app = Flask(__name__)

# ─── Load Model ───
MODEL_PATH = 'model/food_allocation_model.pkl'
METADATA_PATH = 'model/model_metadata.json'

model = None
metadata = None


def load_model():
    global model, metadata
    try:
        if os.path.exists(MODEL_PATH) and os.path.exists(METADATA_PATH):
            model = joblib.load(MODEL_PATH)
            with open(METADATA_PATH, 'r') as f:
                metadata = json.load(f)
            print("✅ Model loaded successfully")
        else:
            print("❌ Model files not found. Run training script first!")
    except Exception as e:
        print(f"❌ Error loading model: {e}")


load_model()


def prepare_features(data):
    """Add engineered features to input data."""
    df = pd.DataFrame([data] if isinstance(data, dict) else data)
    
    # Ensure all required columns exist (ngo_volunteers removed)
    required = ['distance_km', 'ngo_members', 'expiry_hours_left', 'past_success_rate']
    for col in required:
        if col not in df.columns:
            df[col] = 0
    
    # Engineer features (must match updated training script)
    df['distance_x_urgency'] = (
        df['distance_km'] * (1.0 / (df['expiry_hours_left'] + 1))
    )
    
    return df


@app.route('/predict', methods=['POST'])
def predict():
    try:
        if model is None:
            return jsonify({'error': 'Model not loaded'}), 500
        
        data = request.get_json()
        
        # Validate (ngo_volunteers removed)
        required_fields = ['distance_km', 'ngo_members', 'expiry_hours_left', 'past_success_rate']
        missing = [f for f in required_fields if f not in data]
        if missing:
            return jsonify({'error': f'Missing fields: {missing}'}), 400
        
        # Prepare & predict
        df = prepare_features(data)
        score = float(model.predict(df)[0])
        score = max(0.0, min(1.0, score))  # Clamp to [0, 1]
        
        return jsonify({
            'success': True,
            'score': round(score, 4),
            'interpretation': interpret_score(score),
        })
    
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/rank', methods=['POST'])
def rank_ngos():
    try:
        if model is None:
            return jsonify({'error': 'Model not loaded'}), 500
        
        data = request.get_json()
        food_info = data.get('food', {})
        ngos = data.get('ngos', [])
        
        if not ngos:
            return jsonify({'error': 'No NGOs provided'}), 400
        
        expiry_hours = food_info.get('expiry_hours_left', 24)
        results = []
        
        for ngo in ngos:
            features = {
                'distance_km': ngo.get('distance_km', 100),
                'ngo_members': ngo.get('ngo_members', 0),
                'expiry_hours_left': expiry_hours,
                'past_success_rate': ngo.get('past_success_rate', 0.5),
            }
            
            df = prepare_features(features)
            score = float(model.predict(df)[0])
            score = max(0.0, min(1.0, score))
            
            results.append({
                'ngo_id': ngo.get('ngo_id', ''),
                'ngo_name': ngo.get('ngo_name', ''),
                'score': round(score, 4),
                'interpretation': interpret_score(score),
            })
        
        # Sort by score descending
        results.sort(key=lambda x: x['score'], reverse=True)
        
        # Add rank
        for i, r in enumerate(results):
            r['rank'] = i + 1
        
        return jsonify({
            'success': True,
            'food_id': food_info.get('food_id', ''),
            'winner': results[0] if results else None,
            'rankings': results,
        })
    
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def interpret_score(score):
    if score >= 0.8: return "Excellent match"
    elif score >= 0.6: return "Good match"
    elif score >= 0.4: return "Fair match"
    elif score >= 0.2: return "Poor match"
    else: return "Very poor match"


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'model_loaded': model is not None,
    })


if __name__ == '__main__':
    print("=" * 60)
    print("🚀 FOOD ALLOCATION ML SERVICE RUNNING ON PORT 5001")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5001, debug=True)

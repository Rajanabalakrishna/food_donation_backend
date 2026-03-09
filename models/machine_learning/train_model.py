"""
Train the food allocation scoring model.

Model: GradientBoostingRegressor
  - Handles non-linear relationships
  - Feature importance built-in
  - Good with small-medium datasets
  - Fast inference
"""

import pandas as pd
import numpy as np
import joblib
import os
import json
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    mean_squared_error,
    mean_absolute_error,
    r2_score,
)
from sklearn.pipeline import Pipeline


def train_model():
    print("=" * 60)
    print("TRAINING FOOD ALLOCATION MODEL")
    print("=" * 60)
    
    # ─── Load Data ───
    if not os.path.exists('data/training_data.csv'):
        print("❌ Error: data/training_data.csv not found. Run generate_data.py first.")
        return

    df = pd.read_csv('data/training_data.csv')
    print(f"\n📊 Loaded {len(df)} samples")
    
    # ─── Features & Target ───
    FEATURES = [
        'distance_km',
        'ngo_members',
        'expiry_hours_left',
        'past_success_rate',
    ]
    TARGET = 'allocation_score'
    
    X = df[FEATURES]
    y = df[TARGET]
    
    # ─── Feature Engineering ───
    X = X.copy()
    # Interaction between distance and urgency (hours left)
    X['distance_x_urgency'] = X['distance_km'] * (1.0 / (X['expiry_hours_left'] + 1))
    
    FEATURES_ENGINEERED = FEATURES + ['distance_x_urgency']
    
    print(f"📐 Features: {FEATURES_ENGINEERED}")
    
    # ─── Split ───
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    print(f"🔀 Train: {len(X_train)}, Test: {len(X_test)}")
    
    # ─── Build Pipeline ───
    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('model', GradientBoostingRegressor(
            n_estimators=200,
            max_depth=5,
            learning_rate=0.1,
            min_samples_split=10,
            min_samples_leaf=5,
            subsample=0.8,
            random_state=42,
        )),
    ])
    
    # ─── Train ───
    print("\n🏋️ Training GradientBoostingRegressor...")
    pipeline.fit(X_train, y_train)
    
    # ─── Evaluate ───
    y_pred = pipeline.predict(X_test)
    
    mse = mean_squared_error(y_test, y_pred)
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)
    
    print(f"\n📊 EVALUATION RESULTS:")
    print(f"   MSE:  {mse:.6f}")
    print(f"   RMSE: {np.sqrt(mse):.6f}")
    print(f"   MAE:  {mae:.6f}")
    print(f"   R²:   {r2:.6f}")
    
    # ─── Cross Validation ───
    cv_scores = cross_val_score(pipeline, X, y, cv=5, scoring='r2')
    print(f"\n🔄 5-Fold CV R²: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")
    
    # ─── Feature Importance ───
    model = pipeline.named_steps['model']
    importances = model.feature_importances_
    
    print(f"\n🎯 FEATURE IMPORTANCE:")
    for feat, imp in sorted(
        zip(FEATURES_ENGINEERED, importances), key=lambda x: -x[1]
    ):
        bar = "█" * int(imp * 50)
        print(f"   {feat:25s} → {imp:.4f} {bar}")
    
    # ─── Save Model ───
    os.makedirs('model', exist_ok=True)
    joblib.dump(pipeline, 'model/food_allocation_model.pkl')
    print(f"\n✅ Model saved to model/food_allocation_model.pkl")
    
    # ─── Save metadata ───
    metadata = {
        'features': FEATURES,
        'engineered_features': FEATURES_ENGINEERED,
        'metrics': {
            'mse': round(mse, 6),
            'rmse': round(np.sqrt(mse), 6),
            'mae': round(mae, 6),
            'r2': round(r2, 6),
            'cv_r2_mean': round(cv_scores.mean(), 4),
            'cv_r2_std': round(cv_scores.std(), 4),
        },
        'feature_importance': {
            feat: round(float(imp), 4)
            for feat, imp in zip(FEATURES_ENGINEERED, importances)
        },
        'model_type': 'GradientBoostingRegressor',
        'training_samples': len(X_train),
        'test_samples': len(X_test),
    }
    
    with open('model/model_metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"📄 Metadata saved to model/model_metadata.json")
    
    # ─── Test Predictions ───
    print(f"\n🧪 TEST PREDICTIONS:")
    test_cases = [
        # Close NGO, many members, food expiring soon → HIGH score
        {'distance_km': 2, 'ngo_members': 200, 'expiry_hours_left': 3, 'past_success_rate': 0.9},
        
        # Far NGO, few members, food expiring soon → LOW score
        {'distance_km': 80, 'ngo_members': 10, 'expiry_hours_left': 2, 'past_success_rate': 0.3},
        
        # Medium distance, medium members, plenty of time → MEDIUM score
        {'distance_km': 25, 'ngo_members': 50, 'expiry_hours_left': 24, 'past_success_rate': 0.6},
        
        # Very close, small NGO, lots of time → MEDIUM-HIGH score
        {'distance_km': 3, 'ngo_members': 15, 'expiry_hours_left': 36, 'past_success_rate': 0.7},
    ]
    
    for i, tc in enumerate(test_cases, 1):
        test_df = pd.DataFrame([tc])
        test_df['distance_x_urgency'] = (
            test_df['distance_km'] * (1.0 / (test_df['expiry_hours_left'] + 1))
        )
        
        score = pipeline.predict(test_df)[0]
        print(f"   Case {i}: dist={tc['distance_km']}km, "
              f"members={tc['ngo_members']}, "
              f"expiry={tc['expiry_hours_left']}h, "
              f"success={tc['past_success_rate']} "
              f"→ Score: {score:.4f}")
    
    return pipeline


if __name__ == '__main__':
    train_model()

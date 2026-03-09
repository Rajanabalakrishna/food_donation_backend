"""
Generate synthetic training data for food allocation model.

Features:
  1. distance_km        → Distance between NGO and food (0.5 - 100 km)
  2. ngo_members         → Total NGO members (5 - 500)
  3. expiry_hours_left   → Hours until food expires (1 - 48 hours)
  4. past_success_rate   → Historical pickup success (0.0 - 1.0)

Target:
  allocation_score → 0.0 to 1.0 (higher = better candidate)
"""

import pandas as pd
import numpy as np
import os

np.random.seed(42)

NUM_SAMPLES = 10000


def generate_score(distance, members, expiry_hours, success_rate):
    """
    Score formula (simulates real-world logic):
    
    - Closer NGOs score higher
    - More members = can serve more people = higher score
    - If food expires soon AND NGO is far = very low score
    - Better past success rate = more reliable = higher score
    """
    
    # ─── Distance Factor (0 to 1, closer = higher) ───
    distance_factor = np.exp(-0.01 * distance)
    
    # ─── Member Factor (0 to 1, more = higher) ───
    member_factor = np.log1p(members) / np.log1p(500)
    
    # ─── Urgency Factor ───
    if expiry_hours <= 3:
        urgency_multiplier = 2.0
    elif expiry_hours <= 6:
        urgency_multiplier = 1.5
    elif expiry_hours <= 12:
        urgency_multiplier = 1.0
    else:
        urgency_multiplier = 0.7
    
    # Urgency-adjusted distance
    urgency_distance_factor = np.exp(-0.01 * urgency_multiplier * distance)
    
    # ─── Success Rate Factor ───
    success_factor = success_rate
    
    # ─── Combined Score (Weights adjusted after removing volunteers) ───
    score = (
        0.40 * urgency_distance_factor +  # Distance (urgency-adjusted)
        0.25 * member_factor +              # Members/capacity
        0.25 * success_factor +             # Past reliability
        0.10 * distance_factor              # Base distance
    )
    
    # Add noise (real-world variability)
    noise = np.random.normal(0, 0.05)
    score = np.clip(score + noise, 0.0, 1.0)
    
    return round(score, 4)


def generate_dataset():
    data = []
    
    for _ in range(NUM_SAMPLES):
        distance = round(np.random.exponential(scale=20) + 0.5, 2)
        distance = min(distance, 100.0)
        
        members = int(np.random.exponential(scale=50) + 5)
        members = min(members, 500)
        
        expiry_hours = round(np.random.uniform(1, 48), 1)
        
        # Success rate logic
        if members > 100:
            success_rate = round(np.random.beta(8, 2), 2)
        elif members > 30:
            success_rate = round(np.random.beta(5, 3), 2)
        else:
            success_rate = round(np.random.beta(3, 4), 2)
        
        score = generate_score(
            distance, members, expiry_hours, success_rate
        )
        
        data.append({
            'distance_km': distance,
            'ngo_members': members,
            'expiry_hours_left': expiry_hours,
            'past_success_rate': success_rate,
            'allocation_score': score,
        })
    
    df = pd.DataFrame(data)
    
    # ─── Print statistics ───
    print("=" * 60)
    print("DATASET STATISTICS")
    print("=" * 60)
    print(f"Total samples: {len(df)}")
    print(f"\nFeature ranges:")
    for col in df.columns:
        print(f"  {col:25s} → min={df[col].min():.2f}, "
              f"max={df[col].max():.2f}, mean={df[col].mean():.2f}")
    
    print(f"\nScore distribution:")
    print(f"  Low  (< 0.3): {(df['allocation_score'] < 0.3).sum()}")
    print(f"  Mid  (0.3-0.7): {((df['allocation_score'] >= 0.3) & (df['allocation_score'] <= 0.7)).sum()}")
    print(f"  High (> 0.7): {(df['allocation_score'] > 0.7).sum()}")
    
    # ─── Save ───
    os.makedirs('data', exist_ok=True)
    df.to_csv('data/training_data.csv', index=False)
    print(f"\n✅ Saved to data/training_data.csv")
    
    return df


if __name__ == '__main__':
    generate_dataset()

import os
import sys
import csv
import urllib.request
import pickle

# Add the path of backend to sys.path so we can import app.ml.model_definition
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.ml.model_definition import SimpleLogisticRegression

def train_and_save_model():
    print("=== STARTING PURE-PYTHON MODEL TRAINING ===")
    
    # 1. Download dataset if not present
    url = "https://raw.githubusercontent.com/jbrownlee/Datasets/master/pima-indians-diabetes.csv"
    current_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(current_dir, "pima-indians-diabetes.csv")
    
    if not os.path.exists(csv_path):
        print(f"Downloading Pima Indians Diabetes dataset from {url}...")
        try:
            urllib.request.urlretrieve(url, csv_path)
            print("Dataset downloaded.")
        except Exception as e:
            print(f"Failed to download: {e}")
            sys.exit(1)
            
    # 2. Parse CSV using built-in csv module
    # Index mapping for columns in Pima Indians dataset:
    # 0: Pregnancies, 1: Glucose, 2: BloodPressure, 3: SkinThickness, 
    # 4: Insulin, 5: BMI, 6: DiabetesPedigree, 7: Age, 8: Outcome
    rows = []
    with open(csv_path, "r") as f:
        reader = csv.reader(f)
        for row in reader:
            if row:
                rows.append([float(val) for val in row])
                
    print(f"Loaded {len(rows)} records from CSV.")
    
    # Extract feature matrix X and target y
    # Selected features indexes: Pregnancies (0), Glucose (1), BloodPressure (2), Insulin (4), BMI (5), Age (7)
    X = []
    y = []
    for r in rows:
        # Features: Pregnancies, Glucose, BloodPressure, Insulin, BMI, Age
        X.append([r[0], r[1], r[2], r[4], r[5], r[7]])
        y.append(int(r[8]))
        
    # 3. Clean invalid 0 values (Glucose, BloodPressure, Insulin, BMI) with medians
    # Indices in our X list: Glucose (1), BloodPressure (2), Insulin (3), BMI (4)
    cols_to_impute = [1, 2, 3, 4]
    for col_idx in cols_to_impute:
        # Collect non-zero values
        non_zeros = [row[col_idx] for row in X if row[col_idx] > 0]
        non_zeros.sort()
        # Compute median
        if non_zeros:
            n = len(non_zeros)
            median_val = non_zeros[n // 2] if n % 2 != 0 else (non_zeros[n // 2 - 1] + non_zeros[n // 2]) / 2.0
            # Replace zeros
            for row in X:
                if row[col_idx] == 0:
                    row[col_idx] = median_val
                    
    print("Cleaned invalid 0 values (imputed with medians).")
    
    # Split into train/test (80% / 20%)
    split_idx = int(len(X) * 0.8)
    X_train_raw, X_test = X[:split_idx], X[split_idx:]
    y_train_raw, y_test = y[:split_idx], y[split_idx:]
    
    # 4. Resolve class imbalance on the training split using minority class oversampling
    import random
    random.seed(42)
    
    train_pos = [X_train_raw[i] for i in range(len(X_train_raw)) if y_train_raw[i] == 1]
    train_neg = [X_train_raw[i] for i in range(len(X_train_raw)) if y_train_raw[i] == 0]
    
    print(f"Class counts before balancing: Negatives={len(train_neg)}, Positives={len(train_pos)}")
    while len(train_pos) < len(train_neg):
        train_pos.append(random.choice(train_pos))
        
    X_train_balanced = []
    y_train_balanced = []
    for row in train_pos:
        X_train_balanced.append(row)
        y_train_balanced.append(1)
    for row in train_neg:
        X_train_balanced.append(row)
        y_train_balanced.append(0)
        
    combined = list(zip(X_train_balanced, y_train_balanced))
    random.shuffle(combined)
    X_train, y_train = zip(*combined)
    X_train = list(X_train)
    y_train = list(y_train)
    print(f"Class counts after oversampling: Negatives={y_train.count(0)}, Positives={y_train.count(1)}")
    
    # 5. Run Hyperparameter Grid Search using a validation split (80/20 of the balanced training data)
    val_split = int(len(X_train) * 0.8)
    X_train_sub, X_val_sub = X_train[:val_split], X_train[val_split:]
    y_train_sub, y_val_sub = y_train[:val_split], y_train[val_split:]
    
    best_val_acc = -1.0
    best_lr = 0.08
    best_epochs = 3000
    
    learning_rates = [0.01, 0.03, 0.05, 0.08, 0.1, 0.15]
    epochs_candidates = [1000, 2000, 3000, 4000]
    
    print("\nRunning Hyperparameter Grid Search...")
    for lr in learning_rates:
        for epochs in epochs_candidates:
            candidate = SimpleLogisticRegression(learning_rate=lr, epochs=epochs)
            candidate.fit(X_train_sub, y_train_sub)
            preds = candidate.predict(X_val_sub)
            val_acc = sum(1 for p, t in zip(preds, y_val_sub) if p == t) / len(y_val_sub)
            print(f" - LR: {lr:.2f}, Epochs: {epochs} => Validation Accuracy: {val_acc * 100:.2f}%")
            
            # Save if better validation score (or fewer epochs if ties to prevent overfitting)
            if val_acc > best_val_acc:
                best_val_acc = val_acc
                best_lr = lr
                best_epochs = epochs
                
    print(f"\nGrid Search Finished. Optimal Config: LR={best_lr}, Epochs={best_epochs} (Val Accuracy: {best_val_acc * 100:.2f}%)")
    
    # 6. Train final model with the selected optimal hyperparameters on full training set
    print(f"\nTraining final model with LR={best_lr}, Epochs={best_epochs}...")
    model = SimpleLogisticRegression(learning_rate=best_lr, epochs=best_epochs)
    model.fit(X_train, y_train)
    
    # Evaluate
    train_preds = model.predict(X_train)
    test_preds = model.predict(X_test)
    
    train_acc = sum(1 for p, t in zip(train_preds, y_train) if p == t) / len(y_train)
    test_acc = sum(1 for p, t in zip(test_preds, y_test) if p == t) / len(y_test)
    
    print(f"Final Balanced Training Accuracy: {train_acc * 100:.2f}%")
    print(f"Final Unbalanced Test Accuracy: {test_acc * 100:.2f}%")
    
    # 7. Save pickle
    models_dir = os.path.join(current_dir, "models")
    os.makedirs(models_dir, exist_ok=True)
    model_file_path = os.path.join(models_dir, "diabetes_model.pkl")
    with open(model_file_path, "wb") as f:
        pickle.dump(model, f)
        
    print(f"Model successfully saved to {model_file_path}")
    print("=== MODEL TRAINING COMPLETED ===")

if __name__ == "__main__":
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if not os.path.exists(os.path.join(current_dir, "models", "diabetes_model.pkl")):
        train_and_save_model()
    else:
        print("Diabetes model already exists. Skipping training.")

def train_heart_disease_model():
    import pandas as pd
    import numpy as np
    import pickle
    import os
    
    print("Training Heart Disease Risk Model...")
    
    # Load dataset
    current_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(current_dir, "data", "cardio_train.csv")
    df = pd.read_csv(
        csv_path, 
        sep=";"
    )
    
    # Convert age from days to years
    df["age_years"] = df["age"] / 365.0
    
    # Data cleaning — remove impossible values
    df = df[
        (df["ap_hi"] >= 60) & (df["ap_hi"] <= 250) &
        (df["ap_lo"] >= 40) & (df["ap_lo"] <= 180) &
        (df["height"] >= 100) & (df["height"] <= 250) &
        (df["weight"] >= 30) & (df["weight"] <= 200) &
        (df["ap_lo"] < df["ap_hi"])
    ]
    
    print(f"Clean rows after filtering: {len(df)}")
    
    # Features and target
    feature_cols = [
        "age_years", "gender", "height", "weight",
        "ap_hi", "ap_lo", "cholesterol", "gluc",
        "smoke", "alco", "active"
    ]
    X = df[feature_cols].values
    y = df["cardio"].values
    
    # Train/test split (80/20)
    split = int(0.8 * len(X))
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]
    
    # Train using existing SimpleLogisticRegression
    from app.ml.model_definition import SimpleLogisticRegression
    model = SimpleLogisticRegression(epochs=100)
    model.fit(X_train.tolist(), y_train.tolist())
    
    # Evaluate
    predictions = model.predict(X_test.tolist())
    accuracy = sum(
        p == a for p, a in zip(predictions, y_test.tolist())
    ) / len(y_test)
    print(f"Heart Disease Model Accuracy: {accuracy:.4f}")
    
    # Bootstrap confidence intervals (100 resamples)
    print("Computing bootstrap confidence intervals...")
    bootstrap_weights = []
    n = len(X_train)
    
    for i in range(100):
        indices = np.random.randint(0, n, size=2000)
        X_boot = X_train[indices]
        y_boot = y_train[indices]
        boot_model = SimpleLogisticRegression(epochs=10)
        boot_model.fit(X_boot.tolist(), y_boot.tolist())
        bootstrap_weights.append(boot_model.weights)
        if (i + 1) % 20 == 0:
            print(f"  Bootstrap {i+1}/100 done")
    
    # Save model package
    os.makedirs("models", exist_ok=True)
    os.makedirs("backend/models", exist_ok=True)
    
    model_package = {
        "model": model,
        "bootstrap_weights": bootstrap_weights,
        "feature_names": feature_cols,
        "scaler_params": {
            "min": model.x_min.tolist(),
            "max": model.x_max.tolist()
        },
        "training_accuracy": accuracy,
        "condition": "heart_disease",
        "dataset_rows": len(df)
    }
    
    for p in ["models/heart_disease_model.pkl", "backend/models/heart_disease_model.pkl"]:
        with open(p, "wb") as f:
            pickle.dump(model_package, f)
    
    print("Heart disease model saved successfully")
    return accuracy

if __name__ == "__main__":
    train_heart_disease_model()

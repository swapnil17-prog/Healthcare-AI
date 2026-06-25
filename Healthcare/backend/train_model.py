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
    csv_path = "pima-indians-diabetes.csv"
    
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
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]
    
    # 4. Train SimpleLogisticRegression
    print("Training SimpleLogisticRegression model...")
    model = SimpleLogisticRegression(learning_rate=0.08, epochs=3000)
    model.fit(X_train, y_train)
    
    # Evaluate
    train_preds = model.predict(X_train)
    test_preds = model.predict(X_test)
    
    train_acc = sum(1 for p, t in zip(train_preds, y_train) if p == t) / len(y_train)
    test_acc = sum(1 for p, t in zip(test_preds, y_test) if p == t) / len(y_test)
    
    print(f"Training Accuracy: {train_acc * 100:.2f}%")
    print(f"Test Accuracy: {test_acc * 100:.2f}%")
    
    # 5. Save pickle
    os.makedirs("models", exist_ok=True)
    model_file_path = "models/diabetes_model.pkl"
    with open(model_file_path, "wb") as f:
        pickle.dump(model, f)
        
    print(f"Model successfully saved to {model_file_path}")
    print("=== MODEL TRAINING COMPLETED ===")

if __name__ == "__main__":
    train_and_save_model()

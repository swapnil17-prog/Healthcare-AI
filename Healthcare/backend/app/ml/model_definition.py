import math

class SimpleLogisticRegression:
    def __init__(self, learning_rate=0.05, epochs=2000):
        self.learning_rate = learning_rate
        self.epochs = epochs
        self.weights = None
        self.bias = None
        self.min_vals = None
        self.max_vals = None

    def fit(self, X, y):
        # X: list of lists of floats, y: list of ints (0 or 1)
        n_samples = len(X)
        n_features = len(X[0])
        
        # Initialize weights and bias
        self.weights = [0.0] * n_features
        self.bias = 0.0
        
        # Compute min and max for features (min-max scaling for convergence)
        self.min_vals = [min(col) for col in zip(*X)]
        self.max_vals = [max(col) for col in zip(*X)]
        
        # Scale X
        X_scaled = []
        for row in X:
            scaled_row = []
            for i, val in enumerate(row):
                denom = (self.max_vals[i] - self.min_vals[i])
                scaled_val = (val - self.min_vals[i]) / denom if denom != 0 else 0.0
                scaled_row.append(scaled_val)
            X_scaled.append(scaled_row)
            
        # Gradient descent
        for epoch in range(self.epochs):
            for i in range(n_samples):
                linear = sum(X_scaled[i][j] * self.weights[j] for j in range(n_features)) + self.bias
                try:
                    pred = 1.0 / (1.0 + math.exp(-linear))
                except OverflowError:
                    pred = 0.0 if linear < 0 else 1.0
                
                error = pred - y[i]
                
                # Update weights and bias
                for j in range(n_features):
                    self.weights[j] -= self.learning_rate * error * X_scaled[i][j]
                self.bias -= self.learning_rate * error

    def predict_proba(self, X):
        # X: list of lists of floats
        probs = []
        n_features = len(self.weights)
        for row in X:
            scaled_row = []
            for i, val in enumerate(row):
                denom = (self.max_vals[i] - self.min_vals[i])
                scaled_val = (val - self.min_vals[i]) / denom if denom != 0 else 0.0
                scaled_row.append(scaled_val)
                
            linear = sum(scaled_row[j] * self.weights[j] for j in range(n_features)) + self.bias
            try:
                prob = 1.0 / (1.0 + math.exp(-linear))
            except OverflowError:
                prob = 0.0 if linear < 0 else 1.0
            # Return class probabilities [P(0), P(1)]
            probs.append([1.0 - prob, prob])
        return probs

    @property
    def x_min(self):
        import numpy as np
        return np.array(self.min_vals) if self.min_vals is not None else None

    @x_min.setter
    def x_min(self, val):
        self.min_vals = val.tolist() if hasattr(val, "tolist") else list(val)

    @property
    def x_max(self):
        import numpy as np
        return np.array(self.max_vals) if self.max_vals is not None else None

    @x_max.setter
    def x_max(self, val):
        self.max_vals = val.tolist() if hasattr(val, "tolist") else list(val)

    def predict(self, X):
        probs = self.predict_proba(X)
        return [1 if p[1] >= 0.5 else 0 for p in probs]

    def explain_prediction(self, X_row):
        # X_row: list of floats representing a single row
        # Features order mapping matches training:
        features_keys = ["pregnancies", "glucose", "blood_pressure", "insulin", "bmi", "age"]
        contributions = {}
        n_features = len(self.weights)
        for i, val in enumerate(X_row):
            if i >= n_features:
                break
            denom = (self.max_vals[i] - self.min_vals[i])
            scaled_val = (val - self.min_vals[i]) / denom if denom != 0 else 0.0
            contrib = scaled_val * self.weights[i]
            contributions[features_keys[i]] = round(contrib, 4)
        return contributions


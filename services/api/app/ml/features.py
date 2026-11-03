"""Embedding features for the department classifier. Only the model name is pickled; the encoder stays in app.ml.embeddings,
so classifier.joblib holds just the trained head and shares the model that duplicate detection already loaded."""
from . import embeddings


class EmbeddingFeatures:
    def __init__(self, name: str):
        self.name = name

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        prefix = "query: " if "e5" in self.name else ""
        return embeddings.encode([prefix + x for x in X], self.name)

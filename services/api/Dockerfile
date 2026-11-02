# Hugging Face Space image. scripts/deploy_space.py stages this file at the Space root; from the repo root it also builds with
#   docker build -f services/api/Dockerfile -t janavaani-api .
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HOME=/app/.hf TOKENIZERS_PARALLELISM=false \
    AUTO_SEED=true DATABASE_URL=sqlite:////app/runtime/janavaani.db \
    UPLOAD_DIR=/app/runtime/uploads AI_CACHE_DIR=/app/runtime/ai_cache
# Spaces run the container as uid 1000, so everything the app writes must belong to that user.
RUN useradd -m -u 1000 user && mkdir -p /app && chown user /app
WORKDIR /app
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY services/api/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
USER user
RUN mkdir -p /app/runtime
ARG EMBEDDING_MODEL=intfloat/multilingual-e5-small
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${EMBEDDING_MODEL}')"
COPY --chown=user:user services/api services/api
COPY --chown=user:user ml ml
COPY --chown=user:user data data
WORKDIR /app/services/api
EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860", "--proxy-headers", "--forwarded-allow-ips", "*"]

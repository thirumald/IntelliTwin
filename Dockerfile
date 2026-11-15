# IntelliTwin: one container with the API, the login and the (pinned) contributor front end.
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
RUN tools/fetch_frontend.sh && rm -rf /app/.git
ENV INTELLITWIN_DATA=/app/data PORT=8090
VOLUME /app/data
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8090/api/health',timeout=4).status==200 else 1)"
CMD ["uvicorn", "intellitwin.app:app", "--host", "0.0.0.0", "--port", "8090", "--proxy-headers", "--forwarded-allow-ips", "*"]

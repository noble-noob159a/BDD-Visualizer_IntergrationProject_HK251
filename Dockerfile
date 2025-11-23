FROM python:3.11-slim

RUN apt-get update && apt-get install -y graphviz && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /bdd-visualizer

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8000
COPY bdd-visualizer/ .

#CMD ["bash"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

#docker build -t bdd_backend:latest .
#docker run -it -p 8000:8000 --name bdd_backend bdd_backend:latest 
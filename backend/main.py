from fastapi import FastAPI

app = FastAPI(title="EduVerse OS API")


@app.get("/")
def root():
    return {
        "project": "EduVerse OS",
        "status": "running",
        "message": "AI Learning Brain is online"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }

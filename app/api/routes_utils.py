from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
def health_check():
    return {"status": "ok"}

@router.get("/")
def root():
    return {"message": "Backend is up and running. Navigate to ./docs for Swagger contents"}
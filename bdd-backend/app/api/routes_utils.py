from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
def health_check():
    #test file writing
    content = 'test file writing on Render'
    with open('a.txt', 'w') as f:
        f.write(content)
    return {"status": "ok"}

@router.get("/")
def root():
    return {"message": "Backend is up and running. Navigate to ./docs for Swagger contents"}
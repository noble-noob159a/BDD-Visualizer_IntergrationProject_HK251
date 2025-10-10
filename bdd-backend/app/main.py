from app.core import *
from app.export import *
from app import create_app
import uvicorn
import os
from fastapi.middleware.cors import CORSMiddleware
app = create_app()
#IMPORTANT: variables name must not contain uppercase letter. Suppor ~ % | -> <->, not support XOR.
#odering exmaple: '(a & b & c) | (~a & b & ~d) | (c & ~d) | (~b & d)' '((s1 & a) | (~s1 & b)) & ((s2 & c) | (~s2 & d))' (4-bit MUX) '(a & (b | c) & (~d | e)) | (~a & (c | ~e) & (d | f))' 
#TODO: ...


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # or specify your frontend URL(s)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
if __name__ == "__main__":
    #http://127.0.0.1:8000/docs   
    reload_flag = os.getenv("DEBUG", "false").lower() == "true"

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=reload_flag,
    )
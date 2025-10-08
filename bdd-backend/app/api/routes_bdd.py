from fastapi import APIRouter
from fastapi import Request
from app.utils import*

router = APIRouter()
logger = get_logger('BDD API')

@router.post("/generate")
def generate_bdd(formula: dict):
    #body = await request.json()   
    formula_str = formula.get("formula")
    logger.info(f"formula: {formula_str}")
    
    return {"status": "received", "formula": formula_str}
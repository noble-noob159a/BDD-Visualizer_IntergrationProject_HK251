from fastapi import APIRouter
from fastapi import Request
from app.utils import*
from fastapi.responses import JSONResponse
from app.core import*
from app.export import*
router = APIRouter()


@router.post("/export/latex")
async def export_latex(request: Request):
    data = await request.json()
    formula_str = data.get("formula")
    graph_type = data.get("graph_type", "robdd")
    isROBDD = graph_type == 'robdd'
    try:
        if formula_str not in BDD_Cache.cache:
            return JSONResponse(status_code=404, content={
                "status": "error",
                "message": f"Formula not found in cache: '{formula_str}'. Please call /generate first."
            })

        bdd = BDD_Cache.cache[formula_str]
        tex_code = bdd2tex(bdd.robdd_root if isROBDD else bdd.root,to_file=False)

        
        return {
            "status": "success",
            "formula": formula_str,
            "graph_type": graph_type,
            "latex": tex_code
        }
    except Exception as e:
        #logger.exception("Error while exporting LaTeX")
        return JSONResponse(status_code=500, content={
            "status": "error",
            "message": str(e)
        })

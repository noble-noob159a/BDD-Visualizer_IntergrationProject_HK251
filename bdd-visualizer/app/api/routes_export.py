from fastapi import APIRouter, Body
from app.utils import*
from fastapi.responses import JSONResponse, FileResponse
from app.core import*
from app.export import*

router = APIRouter()
logger = get_logger('BDD API2')

@router.post("/latex")
def export_latex(data: dict = Body(...)):
    #data = request.json()
    formula_str = data.get("formula")
    #logger.info(f"Key? {formula_str}")
    graph_type = data.get("graph_type", "robdd")
    var_order = data.get("var_order", None)
    auto_order = data.get("auto_order", None)
    eval_path = data.get("eval_path", None)
    isROBDD = graph_type == 'robdd'
    if not formula_str:
        return JSONResponse(status_code=400, content={
            "status": "error",
            "message": "Missing 'formula' field."
        })
    formula_str = formula_str.replace(" ", "")
    try:
        key = f"{formula_str}"
        
        if key in BDD_Cache.cache:
            #logger.info(f"Cache hit for {cache_key}")
            bdd = BDD_Cache.cache[key]
        else:
            return JSONResponse(status_code=404, content={
                "status": "error",
                "message": f"Formula not found in cache: '{formula_str}'. Please call /generate first."
            })

        tex_code = bdd2tex(bdd.robdd_root if isROBDD else bdd.root, highlight=True)


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

@router.post("/json")
def export_json(data: dict = Body(...)):
    formula_str = data.get("formula")
    graph_type = data.get("graph_type", "robdd")
    isROBDD = graph_type == 'robdd'
    # log after formula_str is retrieved to avoid referencing an undefined variable
    #logger.info(f"Key? {formula_str}")
    if not formula_str:
            return JSONResponse(status_code=400, content={
                "status": "error",
                "message": "Missing 'formula' field."
            })
    formula_str = formula_str.replace(" ", "")
    try:
        key = f"{formula_str}"
        
        if key in BDD_Cache.cache:
            #logger.info(f"Cache hit for {cache_key}")
            bdd = BDD_Cache.cache[key]
        else:
            return JSONResponse(status_code=404, content={
                "status": "error",
                "message": f"Formula not found in cache: '{formula_str}'. Please call /generate first."
            })
      

        json_data = bdd.to_json(bdd.robdd_root if isROBDD else bdd.root, 'ROBDD' if isROBDD else 'BDD', True)

        return {
            "status": "success",
            "formula": formula_str,
            "graph_type": graph_type,
            "json": json_data
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={
            "status": "error",
            "message": str(e)
        })

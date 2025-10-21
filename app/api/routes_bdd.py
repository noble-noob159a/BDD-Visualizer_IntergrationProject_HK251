from fastapi import APIRouter, Body
#from fastapi import Request
from app.utils import*
from fastapi.responses import JSONResponse
from app.core import*

router = APIRouter()
logger = get_logger('BDD API')

@router.post("/generate")
def generate_bdd(data: dict = Body(...)):
    try:
        #data = request.json()
        formula_str = data.get("formula",None)   # 'a&b|c->~e<->f' - required
        graph_type = data.get("graph_type", "robdd")  # 'robdd' or 'bdd'
        var_order = data.get("var_order",None)   # 'x1 x3 x2'
        auto_order = data.get("auto_order",None) # 'ls' or 'freq'
        eval_path = data.get("eval_path",None)   # 'a:0 b:1 c:1'
        #action = data.get("action")
        
        if not formula_str:
            return JSONResponse(status_code=400, content={
                "status": "error",
                "message": "Missing 'formula' field."
            })
        formula_str = formula_str.replace(" ", "")
        isROBDD = graph_type == 'robdd'
        cache_key = formula_str
        if cache_key in BDD_Cache.cache:
            logger.info(f"Cache hit for {cache_key}")
            bdd = BDD_Cache.cache[cache_key]
            if var_order:
                #logger.info(f"yoyo")
                bdd.var_name =get_var_order(bdd.var_name,var_order)
        else:
            bdd = BDD(formula_str,var_order)
            BDD_Cache.add_to_cache(cache_key,bdd)

        if auto_order:
            bdd.auto_order(auto_order == 'ls',isROBDD)
        elif isROBDD:
            bdd.build_robdd()
        else:
            bdd.build_bdd()

        highlight = None
        if eval_path:
            highlight =True
            #logger.info(f"eval with {eval_path}?")
            bdd.eval_path(bdd.robdd_root if isROBDD else bdd.root, eval_path)

        #logger.info(f"Cache: {BDD_Cache.cache}")
        return {
            "status": "success",
            "graph_type": graph_type,
            "formula": formula_str,
            "highlighted": highlight,
            "graph": bdd.to_json(bdd.robdd_root if isROBDD else bdd.root,'ROBDD' if isROBDD else 'BDD', True)
        }

    except Exception as e:
        logger.exception("Error while generating BDD")
        return JSONResponse(status_code=500, content={
            "status": "error",
            "message": str(e)
        })
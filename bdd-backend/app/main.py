from app.core import *
from app.export import *
from app import create_app
import uvicorn


app = create_app()
#IMPORTANT: variables name must not contain uppercase letter. Suppor ~ % | -> <->, not support XOR.
#odering exmaple: '(a & b & c) | (~a & b & ~d) | (c & ~d) | (~b & d)' '((s1 & a) | (~s1 & b)) & ((s2 & c) | (~s2 & d))' (4-bit MUX) '(a & (b | c) & (~d | e)) | (~a & (c | ~e) & (d | f))' 
#TODO: caching
if __name__ == "__main__":
    #http://127.0.0.1:8000/docs
    
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
    #f  = "((s1 & a) | (~s1 & b)) & ((s2 & c) | (~s2 & d))"
    #f = 'a&b->c|d<->e|f->g|h<->i->j&k'
    #bdd = BDD(f)
    
    #bdd.auto_order(False,True)
    #bdd.auto_order(True,True)
    #dot = bdd.to_graphviz("f1",to_latex=True)
    # eval_path(bdd.root,'c:1 b:1')
    # bdd.to_graphviz("f1-hl")
   
    #bdd.eval_path(bdd.robdd_root,'b:0 a:0')
    #bdd.to_graphviz(bdd.robdd_root,"f1",False)
    #bdd.eval_path(bdd.robdd_root,'s1:1')
    #bdd.to_graphviz(bdd.robdd_root,"f1s",False)
    #js = bdd.to_json(bdd.robdd_root,'ROBDD')
    #print(js)
    #bdd2tex(bdd.robdd_root,'tex')
    #print('avc'=="avc")
    #print(test('a:1 b:0 cd:112'))
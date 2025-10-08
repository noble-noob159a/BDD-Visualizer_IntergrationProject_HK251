from app.utils import *
from app.core import *
from app import create_app
import uvicorn
from sympy.parsing.sympy_parser import parse_expr
from sympy import symbols
import sympy as sp


def test(value):
    if isinstance(value,str):
        ls = [x.split(':') for x in value.split(' ') ]
        value = {k:v for [k,v] in ls}
        return value

#app = create_app()
#IMPORTANT: not accept 'S'/'E'/'N'/'I'/'Q'/'O' as var_name
#odering exmaple: '(a & b & c) | (~a & b & ~d) | (c & ~d) | (~b & d)' '((s1 & a) | (~s1 & b)) & ((s2 & c) | (~s2 & d))' (4-bit MUX) '(a & (b | c) & (~d | e)) | (~a & (c | ~e) & (d | f))' 
#TODO: path_highlght
if __name__ == "__main__":
    #http://127.0.0.1:8000/docs
    #uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
    #f= "((a | b) & (c | d) & (~e | f)) | ((g & h) -> (i <-> ~j))"
    #f  = "((d -> ~b) <-> (d| c) <-> (~b -> a)) -> d"
    # f = '((s1 & a) | (~s1 & b)) & ((s2 & c) | (~s2 & d))'
    # bdd = BDD(f)
    # bdd.auto_order(True,True)
    # #bdd.build_robdd()
    # bdd.to_graphviz("f5")
    # js = bdd.to_json(bdd.robdd_root,'ROBDD')
    # print(js)
    
    print(test('a:1 b:0 cd:112'))
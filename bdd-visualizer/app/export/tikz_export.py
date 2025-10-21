import dot2tex
from app.core.bdd import BDD, BDDNode

def bdd2tex(r, file_name='tex', highlight=None):

    if isinstance(r, BDDNode):
        dot = BDD.to_graphviz(r, to_latex=True, highlight=highlight)
    else:
        dot = r
    xdot_file = f'xdot.xdot'
    try:
        dot.render('xdot', format='xdot', cleanup=True, view=False)
        #xdot_content = dot.pipe(format='xdot').decode('utf-8')
    except Exception as e:
        print(f"Graphviz render failed: {e}")
        raise
    
    try:
        with open(xdot_file, 'r') as f:
            xdot_content = f.read()
        
        tikz_content = dot2tex.dot2tex(
            xdot_content,
            format='tikz',          
            texmode='math',        
            duplicate=True,        
            crop=False,             
            #straightedges=False,    
            #codeonly = True,
            nodeoptions='draw, minimum width=1.1cm, minimum height=1cm',
            edgeoptions='line width=1pt',
            figonly=True, 
            graphstyle='scale=1,>=stealth,thick'
        )
        
        with open(file_name, 'w') as f:
            f.write(tikz_content)
        
        return tikz_content
        
    except Exception as e:
        print(f"Error with dot2tex: {e}")
        raise

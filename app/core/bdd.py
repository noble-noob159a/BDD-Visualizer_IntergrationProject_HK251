from graphviz import Digraph
from collections import deque, defaultdict
from sympy.parsing.sympy_parser import parse_expr
from sympy import symbols, simplify_logic
from app.core import*
from app.core.ordering import*
from app.utils import*

logger = get_logger("bdd")
class BDDNode:
    _id = 0
    def __init__(self, level, var=None, expr=None, expr_str=None, step=None, highlight = None, low=None, high=None):
        self.id = BDDNode._id
        BDDNode._id += 1
        self.var = var        
        self.expr = expr    
        self.expr_str = expr_str
        self.low = low      
        self.high = high     
        self.level = level
        self.step = step
        self.highlight = highlight
        
    def __repr__(self):
        return f"Node({self.id}, var={self.var}, expr={self.expr_str}, level={self.level}, step={self.step}, highlight={self.highlight}, low={getattr(self.low,'id',self.low)}, high={getattr(self.high,'id',self.high)})"

class BDD:
    """
    This class provides methods for creating BDD/ROBDD, manual or auto ordering variables before build a BDD/ROBDD and exporting to json.
    ----------
    Parameters
    ----------
    expr_str : string
            Raw string of input formula, variable name must not contain uppercase letter, allow: [a-z_][a-z0-9_]*
    var_order: list or string or None
            Accept string with whitespace: "x1 x3 x2" or list: ['x3','x1','x2']
    parsed: sympy_expr
            For internal used
    """
    def __init__(self,expr_str,var_order=None,parsed=None):
        self.expr_str = expr_str
        self.var_name = get_var_name(expr_str)
        if var_order:
            if isinstance(var_order, list):
                self.var_name = var_order
            else:
                self.var_name = get_var_order(self.var_name,var_order)
 
        if parsed:
            self.parsed_expr = parsed
        else:
            expr = to_str(rewrite(parse_formula(expr_str)))
            self.parsed_expr = simplify_logic(parse_expr(expr))
        self.vars = {v: symbols(v) for v in self.var_name}
        self.root = None
        self.robdd_root = None
        self.highlighted = None

    def build_bdd(self):
        true_terminal = BDDNode(len(self.var_name),None,True,'True')
        false_terminal = BDDNode(len(self.var_name),None,False,'False')
        root = BDDNode(0,self.var_name[0],self.parsed_expr,str(self.parsed_expr))
        self.root = root
        queue = deque([root])    
        #step = 0

        def make_child(expr, level):
            if expr in (True, 1):
                return true_terminal
            if expr in (False, 0):
                return false_terminal

            child = BDDNode(level, self.var_name[level], expr, str(expr))
            queue.appendleft(child)
            return child
        
        while queue:
            node: BDDNode = queue.popleft()
            level = node.level
            var = self.var_name[node.level]
            #logger.info(var)

            high_expr = eval_with_var(node.expr,self.vars[var],1)
            low_expr = eval_with_var(node.expr,self.vars[var],0)

            node.high = make_child(high_expr,node.level+1)
            node.low = make_child(low_expr,node.level+1)
        
        return root

    def build_robdd(self):
        true_terminal  = BDDNode(len(self.var_name), None, True,  'True')
        false_terminal = BDDNode(len(self.var_name), None, False, 'False')

        expr_level_cache = {}   #(expr_str, level)
        nodes_by_level = defaultdict(list)  # level -> [nodes]

        root = BDDNode(0, self.var_name[0], self.parsed_expr, str(self.parsed_expr))
        expr_level_cache[(root.expr_str, 0)] = root
        queue = deque([root])
        
        def make_child(expr_val, level):
            if expr_val in (True, 1):
                return true_terminal
            if expr_val in (False, 0):
                return false_terminal

            key = (str(expr_val),level)
            if key in expr_level_cache:
                return expr_level_cache[key]
            
            child = BDDNode(level, self.var_name[level], expr_val, str(expr_val))
            expr_level_cache[key] = child
            queue.append(child)
            return child
        
        while queue:
            node = queue.popleft()
            nodes_by_level[node.level].append(node)
            var = self.var_name[node.level]

            high_expr = eval_with_var(node.expr, self.vars[var], 1)
            low_expr  = eval_with_var(node.expr, self.vars[var], 0)
           
            node.high = make_child(high_expr, node.level + 1)
            node.low  = make_child(low_expr,  node.level + 1)

        unique_table = {}   #(var, low_id, high_id) 
        repr_map = {}       #node_id -> reduced_node 

        repr_map[true_terminal.id]  = true_terminal
        repr_map[false_terminal.id] = false_terminal

        max_level = max(nodes_by_level.keys()) if nodes_by_level else 0
        #logger.info(f'MLevel: {max_level}, len_var: {len(self.var_name)}')
        for level in range(max_level, -1, -1):
            for node in nodes_by_level[level]:

                low_rep  = repr_map[node.low.id]
                high_rep = repr_map[node.high.id]

                if low_rep is high_rep:
                    repr_map[node.id] = low_rep
                    continue

                key = (node.var, low_rep.id, high_rep.id)
                #key = (low_rep.id,high_rep.id) ->case  'a&b | c&d'; [a c b d]
                if key in unique_table:
                    repr_map[node.id] = unique_table[key]
                else:
                    reduced = BDDNode(node.level, node.var, node.expr, node.expr_str)
                    reduced.low  = low_rep
                    reduced.high = high_rep
                    unique_table[key] = reduced
                    repr_map[node.id] = reduced

        self.robdd_root = repr_map[root.id]
        return self.robdd_root
    
    @staticmethod
    def assign_step(root):
        visited = set()
        queue = deque([root])
        root.step = 0
        step = 1
        while queue:
            node:BDDNode = queue.popleft()
            #logger.info(node.var)
            level = node.level
            bLow = True
            if node.low.expr in [True,False,0,1] or node.low is None or node.low.id in visited:
                bLow = False
            else:         
                visited.add(node.low.id) 
                node.low.step = step
                step+=1
            if node.high.expr not in [True,False,0,1] and node.high and node.high.id not in visited:
                visited.add(node.high.id)
                node.high.step = step
                step+=1
                queue.appendleft(node.high)
            if bLow:
                queue.appendleft(node.low)

    @staticmethod
    def to_graphviz(root, filename="bdd_graph",show_expr=True, step=True, highlight=True, to_latex =False, type='ROBDD'):
        if root is None:
            raise ValueError("Null root")
        
        node_color = 'lightblue'
        if to_latex:
            node_color = 'white'
            show_expr = False
            step = False
            highlight = False
        
        dot = Digraph(comment="Binary Decision Diagram (BFS)", format="png")
        visited = set()

        bdd = True if type == 'BDD' else False
        if step:
            BDD.assign_step(root)

        queue = deque([root])

        while queue:
            node = queue.popleft()
            if node.id in visited:
                continue

            visited.add(node.id)

            if node.var is None:
                label = str(node.expr)
                shape = "box"
                dot.node(str(node.id), label=label, shape=shape,
                        style="filled", fillcolor="lightgray")
            else:
                expr = f'\n({node.expr_str})' if show_expr else ''
                hl = f'\nHighligh: {node.highlight}' if highlight else ''
                st = f' - ({node.step})' if step else ''
                label = f"{node.var}{st}{hl}{expr}"
                dot.node(str(node.id), label=label, shape="oval",
                        style="filled", fillcolor=node_color)
                
            if node.low:
                queue.append(node.low)
                dot.edge(str(node.id), str(node.low.id),style="dashed")
            if node.high:
                queue.append(node.high)
                dot.edge(str(node.id), str(node.high.id),style="solid")

        filename = f'{filename}_'+ ('bdd' if bdd else 'robdd')
        if not to_latex:
            dot.render(filename, view=False)
        return dot
    

    def to_json(self,root, bdd_type="ROBDD",step=True):
        if step:
            BDD.assign_step(root)
        visited = set()
        queue = deque([root])
        nodes = {}
        #edges = []
        n_id = lambda x: f'node_{x.id}' if x.var is not None else f'terminal_{x.expr_str.lower()}'
        while queue:
            node = queue.popleft()
            if node is None or node.id in visited:
                continue
            visited.add(node.id)
            node_id = n_id(node)
            nodes[node_id] = {
                    "id": node_id,
                    "var": node.var,
                    "expr": node.expr_str,
                    "level": node.level,
                    "step": node.step,
                    "highlight": node.highlight,
                    "low": n_id(node.low) if node.low is not None else None,
                    "high": n_id(node.high) if node.high is not None else None,
            }

            queue.appendleft(node.high)
            queue.appendleft(node.low)
            # for branch, child in (("low", node.low), ("high", node.high)):
            #     if child is not None:
            #         edges.append({
            #             "source": node_id
            #             "target": n_id(child),
            #             "branch": branch
            #         })        

        #data = {"nodes": nodes, "edges": edges}
        data = {"nodes": nodes, "root": n_id(root), "variables":[v for v in self.var_name], "type":bdd_type}
        return data
    
    @staticmethod
    def bdd_size(root):
        seen = set()
        queue = deque([root])
        size = 0
        while queue:
            n = queue.popleft()
            if n.id in seen:
                continue
            seen.add(n.id)
            size += 1
            if n.low: queue.append(n.low)
            if n.high: queue.append(n.high)
        return size
    
    def auto_order(self,local_sift=True,robdd=True):
        """
        Auto find efficient ordering by ordering vars by frequency or use local sifting
        Build a BDD/ROBDD for that vars order
        """
        if local_sift:
            self.local_sifting(robdd)
        else:
            ordered_vars = freq_order_heuristic(self.expr_str, self.var_name)
            self.var_name = ordered_vars
            if robdd:
                self.build_robdd()
            else:
                self.build_bdd()

    def local_sifting(self,robdd=True):
        ordered_vars = freq_order_heuristic(self.expr_str, self.var_name)
        cache = {}
        bdd_fin = None
        def get_bdd_info(var_order):
            key = tuple(var_order)
            if key in cache:
                return cache[key]

            temp = BDD(self.expr_str,var_order,self.parsed_expr)
            if robdd:
                root = temp.build_robdd()
            else:
                root = temp.build_bdd()

            size = self.bdd_size(root)
            cache[key] = {"root": root, "size": size}
            return cache[key]

        improved = True
        while improved:
            improved = False
            for i in range(len(ordered_vars) - 1):
                test_order = ordered_vars.copy()
                test_order[i], test_order[i+1] = test_order[i+1], test_order[i]

                info_current = get_bdd_info(ordered_vars)
                info_test = get_bdd_info(test_order)
                logger.info(f'Cur: {info_current["size"]}, Test: {info_test["size"]}')
                if info_test["size"] < info_current["size"]:
                    ordered_vars = test_order
                    improved = True

        best_bdd = get_bdd_info(ordered_vars)
        self.var_name = ordered_vars
        if robdd:
            self.robdd_root = best_bdd["root"]
        else:
            self.root = best_bdd["root"]
        
        logger.info(f'Best size: {best_bdd["size"]}, Order: {ordered_vars}')


    def eval_path(self,root,values):
        """
        Highlight node with variable value string or dict
        Input example: 'a:0 b:1 c:1' or {'a':0, 'b':1, 'c':1}
        If a variable is not assigned, eval both low and high path.
        """
        if not root:
            raise ValueError("Null root")
        
        if isinstance(values,str):
            ls = [x.split(':') for x in values.split(' ') ]
            values = {k:int(v) for [k,v] in ls}

        if self.highlighted:
            self.clear_highlight(root)

        visited = set()
        queue = deque([root])
        while queue:
            node = queue.popleft()
            if node.id in visited:
                continue

            if node.var is None:
                node.highlight = True
                visited.add(node.id)
                continue

            visited.add(node.id)
            node.highlight = True
            if node.var in values:
                val = values[node.var]
                child = node.high if val == 1 else node.low
                if child.id not in visited:
                    queue.append(child)
            else:
                if node.low.id not in visited:
                    queue.append(node.low)
                if node.high.id not in visited:
                    queue.append(node.high)

        self.highlighted = values

    @staticmethod
    def clear_highlight(root):
        visited = set()
        queue = deque([root])
        while queue:
            node = queue.popleft()
            if node.id in visited:
                continue
            visited.add(node.id)
            node.highlight = None
            if node.low and node.low.id not in visited:
                queue.append(node.low)
            if node.high and node.high.id not in visited:
                queue.append(node.high)


from collections import deque
from app.core.bdd import BDDNode


def eval_path(root:BDDNode,values):
    if not root:
        raise ValueError("Null root")
    if isinstance(values,str):
        ls = [x.split(':') for x in values.split(' ') ]
        values = {k:int(v) for [k,v] in ls}

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

    
            

        
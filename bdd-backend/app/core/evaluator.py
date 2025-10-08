from collections import deque
from app.core.bdd import BDDNode

def eval_path(root, values: dict):

    if not root:
        raise ValueError("Null root")

    visited = {}
    queue = deque([root])

    # We'll build a mapping of original node → new cloned node
    while queue:
        node = queue.popleft()

        # terminal nodes (True/False)
        if node.var is None:
            visited[node.id] = node
            continue

        # If this variable has a value assigned
        if node.var in values:
            val = values[node.var]
            child = node.high if val == 1 else node.low

            # propagate link directly to its evaluated child
            visited[node.id] = child
            if child.var is not None and child.id not in visited:
                queue.append(child)

        else:
            # variable not assigned → keep both branches
            new_node = BDDNode(node.level, node.var, node.expr, node.expr_str)
            visited[node.id] = new_node

            # enqueue children if not visited
            if node.low and node.low.id not in visited:
                queue.append(node.low)
            if node.high and node.high.id not in visited:
                queue.append(node.high)

    # second pass to reconnect edges for kept nodes
    for orig_id, new_node in list(visited.items()):
        if new_node.var is None:
            continue
        orig = next((n for n in [root] if n.id == orig_id), None)
        # reconnect links: if assigned variable, node already replaced by terminal/child
        if orig:
            low_child = orig.low
            high_child = orig.high
            if low_child and low_child.id in visited:
                new_node.low = visited[low_child.id]
            if high_child and high_child.id in visited:
                new_node.high = visited[high_child.id]

    trimmed_root = visited[root.id]
    return trimmed_root

def test(root:BDDNode,value):
    if not root:
        raise ValueError("Null root")
    if isinstance(value,str):
        ls = [x.split(':') for x in value.split(' ') ]
        value = {k:v for [k,v] in ls}

    visited = set()
    queue = deque([root])
    while queue:
        node = queue.popleft()
        if node.var is None:
            node.highlight = True
            #víti
            continue
            

        
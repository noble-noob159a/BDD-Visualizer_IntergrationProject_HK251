import re
from collections import Counter, deque

def get_var_name(formula):
    return list(dict.fromkeys(re.findall(r"[a-z_][a-z0-9_]*", formula)))

def get_var_order(var_name, input_order:str):
    input_order = input_order.split()
    order = [x for x in input_order if x in var_name] + [x for x in var_name if x not in input_order]
    return order

def freq_order_heuristic(expr_str,var_name):
    tokens = re.findall(r"[a-z_][a-z0-9_]*", expr_str)
    freq = Counter(t for t in tokens)
    ordered_vars = sorted(var_name, key=lambda v: -freq[v])
    return ordered_vars
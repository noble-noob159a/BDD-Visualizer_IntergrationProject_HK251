# Main api:
 - Create BDD/ROBDD, variables ordering and path highlight (POST): `/api/bdd/generate`
 - Export to latex/tikz (POST): `/api/export/latex`


# `/api/bdd/generate`:
- Request Body: Json/dict
    - "fomular": boolean expression string, required for this api. Variables name start with '_' or lowercase letter, may contain lowercase letter, number and '_'. Support operator: ~ & | -> <-> and ().
    - "graph_type": 'robdd' or 'bdd', default: 'robdd'
    - "var_order": string of variables in formular, separated by space: 'x1 x3 x2' or 'a b d c e'. Default: None, using original order in expression.
    - "auto_order": auto find optimize ordering by heuristics. Can be `ls` for local sifting or `freq` for frequency sorting. The `var_order` field should be None while using this field. Default: None, not optimized.
    - "eval_path": path highlighting for input variable values. String of `variables:values` pairs, separated by space. Example input string: 'a:0 b:1 c:1' or 'x1:0 x2:1'. Default: None. If a variable is not assigned, evaluate both low and high path.

- Example request
```
{
  "formula": "a&b|c->~e<->f",
  "graph_type": "robdd",
  "var_order": "b a c f e",
  "auto_order": None,
  "eval_path": "a:1 b:1 c:0 e:1 f:0"
}
```
 
- Example Response Body
```
{
  "status": "success",
  "graph_type": "robdd",
  "formula": "a&b|c->~e<->f",
  "highlighted": true,
  "graph": {
    "nodes": {
      "node_17": {
        "id": "node_17",
        "var": "b",
        "expr": "(f & ~e) | (c & e & ~f) | (f & ~a & ~c) | (f & ~b & ~c) | (a & b & e & ~f)",
        "level": 0,
        "step": 0,
        "highlight": true,
        "low": "node_15",
        "high": "node_16"
      },
      "node_15": {
        "id": "node_15",
        "var": "c",
        "expr": "(f & ~c) | (f & ~e) | (c & e & ~f)",
        "level": 2,
        "step": 1,
        "highlight": null,
        "low": "node_14",
        "high": "node_13"
      },
      "node_14": {
        "id": "node_14",
        "var": "f",
        "expr": "f | (f & ~e)",
        "level": 3,
        "step": 3,
        "highlight": null,
        "low": "terminal_false",
        "high": "terminal_true"
      },
      "terminal_false": {
        "id": "terminal_false",
        "var": null,
        "expr": "False",
        "level": 5,
        "step": null,
        "highlight": null,
        "low": null,
        "high": null
      },
      "terminal_true": {
        "id": "terminal_true",
        "var": null,
        "expr": "True",
        "level": 5,
        "step": null,
        "highlight": true,
        "low": null,
        "high": null
      },
      "node_13": {
        "id": "node_13",
        "var": "f",
        "expr": "(e & ~f) | (f & ~e)",
        "level": 3,
        "step": 4,
        "highlight": true,
        "low": "node_12",
        "high": "node_11"
      },
      "node_12": {
        "id": "node_12",
        "var": "e",
        "expr": "e",
        "level": 4,
        "step": 5,
        "highlight": true,
        "low": "terminal_false",
        "high": "terminal_true"
      },
      "node_11": {
        "id": "node_11",
        "var": "e",
        "expr": "~e",
        "level": 4,
        "step": 6,
        "highlight": null,
        "low": "terminal_true",
        "high": "terminal_false"
      },
      "node_16": {
        "id": "node_16",
        "var": "a",
        "expr": "(f & ~e) | (a & e & ~f) | (c & e & ~f) | (f & ~a & ~c)",
        "level": 1,
        "step": 2,
        "highlight": true,
        "low": "node_15",
        "high": "node_13"
      }
    },
    "root": "node_17",
    "variables": [
      "b",
      "a",
      "c",
      "f",
      "e"
    ],
    "type": "ROBDD"
  }
}
```
- Error Responses:
  - 400 Bad Request: {"status": "error","message": "Missing 'formula' field."}. Caused by missing input formula.
  - 500 Internal Server Error: {"status": "error","message": str(e)}. Caused by wrong variable names, wrong operator, wrong format in `var_order` or `eval_path`, ...

# `api/export/latex`: Required run /generate bdd/robdd before export to latex
- Request Body: Json/dict
    - "fomular": Same as `/genarate`.
    - "graph_type": 'robdd' or 'bdd', default: 'robdd'

- Example request
```
{
  "formula": "a&b|c->~e<->f",
  "graph_type": "robdd"
}
```

- Example Response Body
```
{
  "status": "success",
  "graph_type": "robdd",
  "formula": "a&b|c->~e<->f",
  "latex":   #this latex code should be write to .tex file, below is example .tex file  
"
\begin{tikzpicture}[>=latex,line join=bevel,scale=0.8, transform shape]
%%
\begin{scope}[draw, minimum width=2cm, minimum height=1cm]
  \node (53) at (71.0bp,378.0bp) [draw,fill=white,ellipse] {$b$};
  \node (51) at (44.0bp,234.0bp) [draw,fill=white,ellipse] {$c$};
  \node (52) at (99.0bp,306.0bp) [draw,fill=white,ellipse] {$a$};
  \node (50) at (27.0bp,90.0bp) [draw,fill=white,ellipse] {$f$};
  \node (49) at (99.0bp,162.0bp) [draw,fill=white,ellipse] {$f$};
  \node (37) at (63.0bp,18.0bp) [draw,fill=lightgray,rectangle] {$False$};
  \node (36) at (135.0bp,18.0bp) [draw,fill=lightgray,rectangle] {$True$};
  \node (48) at (171.0bp,90.0bp) [draw,fill=white,ellipse] {$e$};
  \node (47) at (99.0bp,90.0bp) [draw,fill=white,ellipse] {$e$};
\end{scope}
  \draw [->,dashed] (53) ..controls (63.182bp,335.88bp) and (54.837bp,291.99bp)  .. (51);
  \draw [->,solid] (53) ..controls (80.774bp,352.57bp) and (84.603bp,342.99bp)  .. (52);
  \draw [->,dashed] (51) ..controls (39.045bp,191.61bp) and (33.841bp,148.14bp)  .. (50);
  \draw [->,solid] (51) ..controls (63.113bp,208.67bp) and (71.908bp,197.48bp)  .. (49);
  \draw [->,dashed] (52) ..controls (79.887bp,280.67bp) and (71.092bp,269.48bp)  .. (51);
  \draw [->,solid] (52) ..controls (99.0bp,263.61bp) and (99.0bp,220.14bp)  .. (49);
  \draw [->,dashed] (50) ..controls (39.41bp,64.869bp) and (44.401bp,55.164bp)  .. (37);
  \draw [->,solid] (50) ..controls (60.396bp,67.355bp) and (81.044bp,53.971bp)  .. (36);
  \draw [->,dashed] (49) ..controls (123.77bp,136.92bp) and (136.86bp,124.19bp)  .. (48);
  \draw [->,solid] (49) ..controls (99.0bp,136.41bp) and (99.0bp,127.73bp)  .. (47);
  \draw [->,dashed] (48) ..controls (137.6bp,67.355bp) and (116.96bp,53.971bp)  .. (37);
  \draw [->,solid] (48) ..controls (158.59bp,64.869bp) and (153.6bp,55.164bp)  .. (36);
  \draw [->,solid] (47) ..controls (86.59bp,64.869bp) and (81.599bp,55.164bp)  .. (37);
  \draw [->,dashed] (47) ..controls (111.41bp,64.869bp) and (116.4bp,55.164bp)  .. (36);
%
\end{tikzpicture}
"
}
```
- Error Responses:
  - 404: {"status": "error","message": "Formula not found in cache. Please call /generate first."}. Caused by not calling /generate before exporting.
  - 500 Internal Server Error: {"status": "error","message": str(e)}. Caused by graphviz/dot2tex exception while exporting latex code.

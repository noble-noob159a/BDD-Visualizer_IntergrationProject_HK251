from collections import deque
from typing import Dict, Any, List, Tuple

from graphviz import Digraph

from app.core.bdd import BDD, BDDNode


def _collect_edge_styles(root: BDDNode) -> Dict[Tuple[str, str], str]:
    styles: Dict[Tuple[str, str], str] = {}
    seen = set()
    dq = deque([root])
    while dq:
        n = dq.popleft()
        if n.id in seen:
            continue
        seen.add(n.id)
        if n.low is not None:
            styles[(str(n.id), str(n.low.id))] = "dashed"
            dq.append(n.low)
        if n.high is not None:
            styles[(str(n.id), str(n.high.id))] = "solid"
            dq.append(n.high)
    return styles


def _build_id_maps(root: BDDNode) -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    Build mapping between Graphviz node names (numeric string ids) and JSON ids
    used by to_json: 'node_{id}' for decision nodes, and 'terminal_true/false' for terminals.
    Returns (gv_to_json, json_to_gv).
    """
    gv_to_json: Dict[str, str] = {}
    json_to_gv: Dict[str, str] = {}
    seen = set()
    dq = deque([root])

    def json_id(n: BDDNode) -> str:
        if n.var is None:
            return f"terminal_{str(n.expr).lower()}"
        return f"node_{n.id}"

    while dq:
        n = dq.popleft()
        if n.id in seen:
            continue
        seen.add(n.id)
        j = json_id(n)
        gv = str(n.id)
        gv_to_json[gv] = j
        json_to_gv[j] = gv
        if n.low is not None:
            dq.append(n.low)
        if n.high is not None:
            dq.append(n.high)

    return gv_to_json, json_to_gv


def bdd2layout(r: BDDNode | Digraph, highlight: bool = False) -> Dict[str, Any]:
    """
    Build Graphviz layout and return JSON with nodes, edge splines and bbox.
    Coordinates are returned in pixels, using 72 px per inch (Graphviz plain units).
    Also includes a mapping keyed by the JSON node ids used in export-json
    so the frontend can render with consistent identities.
    """
    if isinstance(r, BDDNode):
        dot = BDD.to_graphviz(r, to_latex=False, highlight=highlight)
        root_node = r
    else:
        dot = r
        root_node = None  # type: ignore

    plain = dot.pipe(format="plain").decode("utf-8")

    edge_styles: Dict[Tuple[str, str], str] = {}
    gv_to_json: Dict[str, str] = {}
    json_to_gv: Dict[str, str] = {}
    if root_node is not None:
        edge_styles = _collect_edge_styles(root_node)
        gv_to_json, json_to_gv = _build_id_maps(root_node)

    DPI = 72.0

    nodes: Dict[str, Dict[str, float]] = {}
    edges: List[Dict[str, Any]] = []
    width_px = 0.0
    height_px = 0.0

    for raw in plain.splitlines():
        line = raw.strip()
        if not line:
            continue
        parts = line.split()
        kind = parts[0]
        if kind == "graph" and len(parts) >= 3:
            width_px = float(parts[1]) * DPI
            height_px = float(parts[2]) * DPI
        elif kind == "node" and len(parts) >= 6:
            name = parts[1]
            x = float(parts[2]) * DPI
            y = float(parts[3]) * DPI
            w = float(parts[4]) * DPI
            h = float(parts[5]) * DPI
            nodes[name] = {"x": x, "y": y, "w": w, "h": h}
        elif kind == "edge" and len(parts) >= 4:
            tail = parts[1]
            head = parts[2]
            n = int(parts[3])
            pts: List[Tuple[float, float]] = []
            coords = parts[4:4 + 2 * n]
            for i in range(0, len(coords), 2):
                xi = float(coords[i]) * DPI
                yi = float(coords[i + 1]) * DPI
                pts.append((xi, yi))
            style = edge_styles.get((tail, head), "solid")
            edges.append({
                "tail": tail,
                "head": head,
                "points": pts,
                "style": style,
            })

    # Also return a version keyed by JSON ids if BDD root provided
    nodes_json: Dict[str, Dict[str, float]] = {}
    edges_json: List[Dict[str, Any]] = []
    if gv_to_json:
        for gv_id, geom in nodes.items():
            j = gv_to_json.get(gv_id)
            if j:
                nodes_json[j] = geom
        for e in edges:
            tail_json = gv_to_json.get(e["tail"])  # type: ignore
            head_json = gv_to_json.get(e["head"])  # type: ignore
            if tail_json and head_json:
                edges_json.append({
                    "tail": tail_json,
                    "head": head_json,
                    "points": e["points"],
                    "style": e.get("style", "solid"),
                })

    return {
        "bbox": {"width": width_px, "height": height_px},
        "nodes": nodes,
        "edges": edges,
        "nodes_json": nodes_json,
        "edges_json": edges_json,
        "dpi": DPI,
    }

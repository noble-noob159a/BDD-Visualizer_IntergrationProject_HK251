"use client"

import React, { useState, useEffect, useRef } from "react"
import styles from "./bdd-visualizer.module.css"

interface BDDNode {
  id: string
  var: string | null
  expr: string
  level: number
  step: number
  highlight: boolean | null
  low: string | null
  high: string | null
}

interface BDDData {
  nodes: Record<string, BDDNode>
  root: string
  variables: string[]
  type: string
}

interface StepInfo {
  addedNodeIds: string[]
  explanation: string
}

export default function BDDVisualizer() {
  const [formula, setFormula] = useState("a&b|c")
  const [graphType, setGraphType] = useState<"bdd" | "robdd">("robdd")
  const [bddData, setBddData] = useState<BDDData | null>(null)
  const [layout, setLayout] = useState<null | {
    bbox: { width: number; height: number }
    nodes_json?: Record<string, { x: number; y: number; w: number; h: number }>
    edges_json?: Array<{ tail: string; head: string; points: Array<[number, number]>; style: string }>
  }>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [steps, setSteps] = useState<StepInfo[]>([])
  const [variables, setVariables] = useState<string[]>([])
  const [customOrder, setCustomOrder] = useState<string>("")
  const [orderingMethod, setOrderingMethod] = useState<"custom" | "auto" | "none">("none")
  const [variableValues, setVariableValues] = useState<Record<string, number>>({})
  const [showEvalPath, setShowEvalPath] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cyContainerRef = useRef<HTMLDivElement>(null)
  const cyInstanceRef = useRef<any>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | null>(null)
  
  // Zoom and pan state
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const handleVisualize = async () => {
    setLoading(true)
    setError(null)
    setCurrentStep(0)
    setIsPlaying(false)

    try {
      const requestBody: any = {
        formula: formula,
        graph_type: graphType,
      };

      // Add variable ordering if specified
      if (orderingMethod === "custom" && customOrder.trim()) {
        requestBody.var_order = customOrder.trim();
      } else if (orderingMethod === "auto") {
        requestBody.auto_order = "ls"; // Use local sifting for auto ordering
      }
      
      // Add variable values for evaluation path if enabled
      if (showEvalPath && Object.keys(variableValues).length > 0) {
        const evalPathStr = Object.entries(variableValues)
          .filter(([_, value]) => value !== undefined)
          .map(([variable, value]) => `${variable}:${value}`)
          .join(' ');
        
        if (evalPathStr) {
          requestBody.eval_path = evalPathStr;
        }
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })

      const data = await response.json()

      if (data.status === "error") {
        setError(data.message)
        return
      }

      console.log("[v0] BDD Data received:", data.graph)
      setBddData(data.graph)
      setVariables(data.graph.variables || [])
      generateSteps(data.graph)

      // Fetch Graphviz layout to match LaTeX/TikZ output
      try {
        const layoutRes = await fetch("/api/export-layout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        })
        const layoutData = await layoutRes.json()
        if (layoutData.status !== "error" && layoutData.layout) {
          setLayout(layoutData.layout)
          // Fit view to layout on first load
          window.setTimeout(() => fitViewToLayout(layoutData.layout), 0)
        } else {
          setLayout(null)
        }
      } catch (e) {
        // Non-fatal; fallback to client layout
        setLayout(null)
      }
    } catch (err) {
      setError("Failed to connect to backend. Make sure the API is running.")
    } finally {
      setLoading(false)
    }
  }
  // Enhanced step generation with state tracking
  const generateSteps = (data: BDDData) => {
    // Build incremental steps: start with root, then add children in order (parent -> low -> high)
    if (!data || !data.root || !data.nodes[data.root]) {
      setSteps([])
      return
    }

    const stepsOut: StepInfo[] = []
    const seen = new Set<string>()
    const queue: string[] = []
    const nodeRelationships: Record<string, {parent?: string, connection?: 'high' | 'low'}> = {}

    queue.push(data.root)

    while (queue.length > 0) {
      const id = queue.shift()!
      if (seen.has(id)) continue

      const node = data.nodes[id]
      if (!node) continue

      // Create enhanced explanation for this node step
      let explanation = ""
      const relationship = nodeRelationships[id]
      
      if (node.var === null) {
        // Terminal node explanation
        if (relationship && relationship.parent) {
          const parentNode = data.nodes[relationship.parent]
          const connectionType = relationship.connection === 'high' ? 'high (1)' : 'low (0)'
          explanation = `Added terminal node ${id}: ${node.expr}. This is the ${connectionType} branch of decision node ${relationship.parent} (var='${parentNode.var}').`
        } else {
          explanation = `Added terminal node ${id}: ${node.expr}. This is a root terminal node.`
        }
      } else {
        // Decision node explanation
        if (relationship && relationship.parent) {
          const parentNode = data.nodes[relationship.parent]
          const connectionType = relationship.connection === 'high' ? 'high (1)' : 'low (0)'
          explanation = `Added decision node ${id}: var='${node.var}' expr='${node.expr}'. This is the ${connectionType} branch of node ${relationship.parent} (var='${parentNode.var}').`
        } else {
          explanation = `Added decision node ${id}: var='${node.var}' expr='${node.expr}'. This is the root decision node for the formula.`
        }
      }

      stepsOut.push({
        addedNodeIds: [id],
        explanation,
      })

      seen.add(id)

      // Track relationships for children before adding them to the queue
      if (node.low) {
        nodeRelationships[node.low] = {parent: id, connection: 'low'}
        if (!seen.has(node.low)) queue.push(node.low)
      }
      
      if (node.high) {
        nodeRelationships[node.high] = {parent: id, connection: 'high'}
        if (!seen.has(node.high)) queue.push(node.high)
      }
    }

    setSteps(stepsOut)
  }

  const drawBDD = (stepIndex: number) => {
    const canvas = canvasRef.current
    if (!canvas || !bddData) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    // Apply zoom and pan transformations
    ctx.save()
    ctx.translate(offset.x, offset.y)
    ctx.scale(scale, scale)

    const hasGV = !!layout && !!layout.nodes_json && !!layout.bbox
    const nodePositions = hasGV ? calculateNodePositionsFromGV(bddData, layout!) : calculateNodePositions(bddData)

    // Build visible nodes set: union of all added ids up to current step
    const visibleNodes = new Set<string>()
    for (let i = 0; i <= stepIndex && i < steps.length; i++) {
      const ids = steps[i].addedNodeIds || []
      ids.forEach((id) => visibleNodes.add(id))
    }

    const expandVisible = (set: Set<string>) => {
      let changed = true
      while (changed) {
        changed = false
        Array.from(set).forEach((id) => {
          const node = bddData.nodes[id]
          if (!node) return
          if (node.low && !set.has(node.low)) {
            set.add(node.low)
            changed = true
          }
          if (node.high && !set.has(node.high)) {
            set.add(node.high)
            changed = true
          }
        })
      }
    }
    expandVisible(visibleNodes)

    // Helper to draw an arrowhead at (x,y) pointing at angle
    const drawArrowhead = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      angle: number,
      size = 14
    ) => {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(angle)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(-size, size * 0.6)
      ctx.lineTo(-size, -size * 0.6)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    // draw edges first
    const hash = (s: string) => {
      let h = 0
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
      return h
    }
    if (hasGV && layout?.edges_json) {
      // Draw using Graphviz polylines
      layout.edges_json.forEach((e) => {
        const tail = e.tail
        const head = e.head
        if (!visibleNodes.has(tail) || !visibleNodes.has(head)) return
        const pts = e.points.map(([x, y]) => ({ x, y: (layout!.bbox.height - y) }))
        const isDashed = e.style === "dashed"
        const isHighlighted = (() => {
          const tailNode = bddData.nodes[tail];
          const headNode = bddData.nodes[head];
          if (!(tailNode?.highlight && headNode?.highlight)) return false;
          // Nếu có set biến ở node cha, chỉ highlight nhánh khớp
          if (showEvalPath && tailNode?.var && Object.prototype.hasOwnProperty.call(variableValues, tailNode.var)) {
          const wantHigh = variableValues[tailNode.var] === 1;
          const branchIsHigh = !isDashed; // dashed = low, solid = high
          if (wantHigh !== branchIsHigh) return false;
          }
          return true;
        })();

        ctx.save()
        ctx.setLineDash(isDashed ? [5, 5] : [])
        if (isHighlighted) {
          ctx.strokeStyle = "#ff5722"
          ctx.lineWidth = 3.5
          ctx.shadowColor = "#ff5722"
          ctx.shadowBlur = 10
        } else {
          ctx.strokeStyle = isDashed ? "#666" : "#333"
          ctx.lineWidth = 2
        }
        ctx.beginPath()
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i]
          if (i === 0) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        }
        ctx.stroke()
        // Arrowhead towards last segment
        if (pts.length >= 2) {
          const p1 = pts[pts.length - 2]
          const p2 = pts[pts.length - 1]
          ctx.setLineDash([])
          ctx.fillStyle = ctx.strokeStyle
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
          drawArrowhead(ctx, p2.x, p2.y, angle)
        }
        ctx.restore()
      })
    } else {
      // Fallback: draw synthetic curves
      Object.values(bddData.nodes).forEach((node) => {
        if (!visibleNodes.has(node.id)) return
        const pos = nodePositions[node.id]
        if (!pos) return
  const isNodeHighlighted = !!node.highlight
        if (node.low && visibleNodes.has(node.low)) {
          const lowPos = nodePositions[node.low]
          if (lowPos) {
            const lowNode = bddData.nodes[node.low]
            const isLowHighlighted = !!(lowNode && lowNode.highlight)
            let isEdgeHighlighted = isNodeHighlighted && isLowHighlighted;
            if (showEvalPath && node.var && Object.prototype.hasOwnProperty.call(variableValues, node.var)) {
              isEdgeHighlighted = isEdgeHighlighted && variableValues[node.var] === 0;
            }
            ctx.save()
            ctx.setLineDash([5, 5])
            if (isEdgeHighlighted) {
              ctx.strokeStyle = "#ff5722"
              ctx.lineWidth = 3.5
              ctx.shadowColor = "#ff5722"
              ctx.shadowBlur = 10
            } else {
              ctx.strokeStyle = "#666"
              ctx.lineWidth = 2
            }
            const fromIsTerminal = node.var === null
            const toIsTerminal = lowNode?.var === null
            const x1 = pos.x
            const y1 = pos.y + (fromIsTerminal ? 10 : 15)
            const x2 = lowPos.x
            const y2 = lowPos.y - (toIsTerminal ? 10 : 15)
            const mx = (x1 + x2) / 2
            const my = (y1 + y2) / 2
            const dx = x2 - x1
            const curve = Math.max(80, Math.min(260, Math.abs(dx) * 0.6 + 100))
            const j = ((hash(node.id + ":" + node.low) % 21) - 10) * 4
            const cx = mx - (curve + j)
            const cy = my + j * 0.2
            if (Math.abs(dx) < 20) {
              ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
            } else {
              ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke()
            }
            ctx.setLineDash([])
            ctx.fillStyle = ctx.strokeStyle
            const angle = Math.abs(dx) < 20 ? Math.atan2(y2 - y1, x2 - x1) : Math.atan2(y2 - cy, x2 - cx)
            drawArrowhead(ctx, x2, y2, angle)
            ctx.restore()
          }
        }
        if (node.high && visibleNodes.has(node.high)) {
          const highPos = nodePositions[node.high]
          if (highPos) {
            const highNode = bddData.nodes[node.high]
            const isHighHighlighted = !!(highNode && highNode.highlight)
            let isEdgeHighlighted = isNodeHighlighted && isHighHighlighted;
            if (showEvalPath && node.var && Object.prototype.hasOwnProperty.call(variableValues, node.var)) {
              isEdgeHighlighted = isEdgeHighlighted && variableValues[node.var] === 1;
            }
            ctx.save()
            ctx.setLineDash([])
            if (isEdgeHighlighted) {
              ctx.strokeStyle = "#ff5722"; ctx.lineWidth = 3.5; ctx.shadowColor = "#ff5722"; ctx.shadowBlur = 10
            } else { ctx.strokeStyle = "#333"; ctx.lineWidth = 2 }
            const fromIsTerminal = node.var === null
            const toIsTerminal = highNode?.var === null
            const x1 = pos.x
            const y1 = pos.y + (fromIsTerminal ? 10 : 15)
            const x2 = highPos.x
            const y2 = highPos.y - (toIsTerminal ? 10 : 15)
            const mx = (x1 + x2) / 2
            const my = (y1 + y2) / 2
            const dx = x2 - x1
            const curve = Math.max(80, Math.min(260, Math.abs(dx) * 0.6 + 100))
            const j = ((hash(node.id + ":" + node.high) % 21) - 10) * 4
            const cx = mx + (curve + j)
            const cy = my + j * 0.2
            if (Math.abs(dx) < 20) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke() }
            else { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke() }
            ctx.fillStyle = ctx.strokeStyle
            const angle = Math.abs(dx) < 20 ? Math.atan2(y2 - y1, x2 - x1) : Math.atan2(y2 - cy, x2 - cx)
            drawArrowhead(ctx, x2, y2, angle)
            ctx.restore()
          }
        }
      })
    }

    // draw nodes; newly added nodes are highlighted with a different color
    const currentAdded = new Set<string>((steps[stepIndex]?.addedNodeIds) || [])

    Object.values(bddData.nodes).forEach((node) => {
      if (!visibleNodes.has(node.id)) return

      const pos = nodePositions[node.id]
      if (!pos) return

      const isCurrentAdded = currentAdded.has(node.id)
      const isTerminal = node.var === null
      const isOne = node.expr === "1" || node.expr === "True"
      const displayText = node.var || (isOne ? "1" : "0")
  const isHighlighted = !!node.highlight

      ctx.save()

      if (isTerminal) {
        // terminals: green/red; newly added terminals get yellow fill
        ctx.fillStyle = isCurrentAdded ? "#ffeb3b" : (isOne ? "#81c784" : "#e57373")
        ctx.strokeStyle = isHighlighted ? "#ff5722" : "#333"
        ctx.lineWidth = isHighlighted ? 4 : 2
        const w = (() => {
          if (layout?.nodes_json && layout?.bbox) {
            const g = layout.nodes_json[node.id]
            if (g) return g.w
          }
          return 40
        })()
        const h = (() => {
          if (layout?.nodes_json && layout?.bbox) {
            const g = layout.nodes_json[node.id]
            if (g) return g.h
          }
          return 20
        })()
        ctx.fillRect(pos.x - w / 2, pos.y - h / 2, w, h)
        ctx.strokeRect(pos.x - w / 2, pos.y - h / 2, w, h)
        
        // Add glow effect for highlighted nodes
        if (isHighlighted) {
          ctx.shadowColor = "#ff5722";
          ctx.shadowBlur = 15;
          ctx.strokeRect(pos.x - w / 2, pos.y - h / 2, w, h);
          ctx.shadowBlur = 0;
        }
      } else {
        // decision nodes: normal blue; newly added get yellow fill
        ctx.fillStyle = isCurrentAdded ? "#ffeb3b" : (isHighlighted ? "#42a5f5" : "#90caf9")
        ctx.strokeStyle = isHighlighted ? "#ff5722" : "#333"
        ctx.lineWidth = isHighlighted ? 4 : 2
        ctx.beginPath()
        const r = (() => {
          if (layout?.nodes_json && layout?.bbox) {
            const g = layout.nodes_json[node.id]
            if (g) return Math.max(g.w, g.h) / 2
          }
          return 15
        })()
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        
        // Add evaluation path highlight
        if (isHighlighted) {
          ctx.shadowColor = "#ff5722";
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      ctx.fillStyle = "#000"
      ctx.font = "bold 16px Arial"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(displayText, pos.x, pos.y)

      ctx.restore()
    })
    
    // Restore the canvas context state after drawing
    ctx.restore()
  }

  // --- Cytoscape integration -------------------------------------------------
  const convertToCytoscapeElements = (data: BDDData, visibleUpToStep: number) => {
    const elements: any[] = []
    if (!data) return elements

    const visibleNodes = new Set<string>()
    for (let i = 0; i <= visibleUpToStep && i < steps.length; i++) {
      (steps[i].addedNodeIds || []).forEach((id) => visibleNodes.add(id))
    }
    // expand visibility to children
    let changed = true
    while (changed) {
      changed = false
      Array.from(visibleNodes).forEach((id) => {
        const n = data.nodes[id]
        if (!n) return
        if (n.low && !visibleNodes.has(n.low)) { visibleNodes.add(n.low); changed = true }
        if (n.high && !visibleNodes.has(n.high)) { visibleNodes.add(n.high); changed = true }
      })
    }

    Object.values(data.nodes).forEach((node) => {
      if (!visibleNodes.has(node.id)) return
      const isTerminal = node.var === null
      const isOne = node.expr === "1" || node.expr === "True"
      const label = node.var || (isOne ? "1" : "0")
      elements.push({ 
        data: { 
          id: node.id, 
          label, 
          isTerminal,
          highlighted: node.highlight 
        },
        classes: node.highlight ? 'highlighted' : ''
      })

      if (node.low && visibleNodes.has(node.low)) {
        const lowNode = data.nodes[node.low];
        const allowByEval = !(showEvalPath && node.var && Object.prototype.hasOwnProperty.call(variableValues, node.var)) || variableValues[node.var] === 0;
        elements.push({
          data: { id: `${node.id}->${node.low}`, source: node.id, target: node.low, type: "low" },
          classes: (allowByEval && node.highlight && lowNode?.highlight) ? 'highlighted' : ''
        });
      }

      if (node.high && visibleNodes.has(node.high)) {
        const highNode = data.nodes[node.high];
        const allowByEval = !(showEvalPath && node.var && Object.prototype.hasOwnProperty.call(variableValues, node.var)) || variableValues[node.var] === 1;
        elements.push({
          data: { id: `${node.id}->${node.high}`, source: node.id, target: node.high, type: "high" },
          classes: (allowByEval && node.highlight && highNode?.highlight) ? 'highlighted' : ''
        });
      }
    });

    return elements;
  }

  const ensureCytoscape = async () => {
    if (cyInstanceRef.current) return cyInstanceRef.current
    // dynamic import to avoid SSR issues
  // @ts-ignore: dynamic import of optional runtime dependency
  const cytoscape = (await import("cytoscape"))
    try {
  // @ts-ignore: dynamic import of optional runtime dependency
  const dagre = (await import("cytoscape-dagre")).default
      cytoscape.default.use(dagre)
    } catch (e) {
      // ignore if dagre not available
    }
    return cytoscape.default || cytoscape
  }

  const initOrUpdateCytoscape = async () => {
    if (!bddData || steps.length === 0) return
    const cyLib: any = await ensureCytoscape()
    const container = cyContainerRef.current
    if (!container) return

    const elements = convertToCytoscapeElements(bddData, currentStep)

    if (!cyInstanceRef.current) {
      cyInstanceRef.current = cyLib({
        container,
        elements,
        style: [
          // Base node styling
          { 
            selector: "node", 
            style: { 
              'label': 'data(label)',
              'text-valign': 'center',
              'text-halign': 'center',
              'font-size': '16px',
              'font-weight': 'bold',
              'color': '#000'
            }
          },
          // Decision nodes (non-terminal)
          { 
            selector: "node:not([isTerminal])", 
            style: { 
              'background-color': '#90caf9',
              'shape': 'ellipse',
              'border-width': 2,
              'border-color': '#333',
              'width': '50px',
              'height': '50px'
            }
          },
          // Terminal node 0 (False)
          { 
            selector: "node[isTerminal][label='0']", 
            style: { 
              'shape': 'rectangle',
              'background-color': '#e57373',
              'width': '50px',
              'height': '35px',
              'border-width': 2,
              'border-color': '#333'
            }
          },
          // Terminal node 1 (True)
          { 
            selector: "node[isTerminal][label='1']", 
            style: { 
              'shape': 'rectangle',
              'background-color': '#81c784',
              'width': '50px',
              'height': '35px',
              'border-width': 2,
              'border-color': '#333'
            }
          },
          // Current step nodes (yellow highlight)
          { 
            selector: ".current-step", 
            style: { 
              'background-color': '#ffeb3b'
            }
          },
          // Highlighted nodes (evaluation path - orange)
          { 
            selector: "node.highlighted", 
            style: { 
              'background-color': '#ff9800', // Orange for evaluation path
              'border-width': 4,
              'border-color': '#e65100'
            }
          },
          // Current node in evaluation path (yellow)
          {
            selector: "node.highlighted.current-step",
            style: {
              'background-color': '#ffeb3b', // Yellow for current node
              'border-width': 4,
              'border-color': '#f57f17'
            }
          },
          // Base edge styling
          { 
            selector: "edge", 
            style: { 
              'curve-style': 'bezier',
              'control-point-step-size': 60,
              'width': 2,
              'target-arrow-shape': 'triangle',
              'arrow-scale': 1.2
            }
          },
          // Low branch edges (dashed)
          { 
            selector: "edge[type='low']", 
            style: { 
              'line-style': 'dashed',
              'line-dash-pattern': [6, 4],
              'line-color': '#666',
              'target-arrow-color': '#666'
            }
          },
          // High branch edges (solid)
          { 
            selector: "edge[type='high']", 
            style: { 
              'line-style': 'solid',
              'line-color': '#333',
              'target-arrow-color': '#333'
            }
          },
          // Highlighted edges (evaluation path)
          { 
            selector: "edge.highlighted", 
            style: { 
              'line-color': '#ff5722',
              'target-arrow-color': '#ff5722',
              'width': 3.5
            }
          }
        ],
        layout: {
          name: 'dagre',
          rankDir: 'TB',
          nodeSep: 80,
          edgeSep: 10,
          rankSep: 100,
          spacingFactor: 1.2
        },
        wheelSensitivity: 0.2,
        minZoom: 0.25,
        maxZoom: 4
      })

      // Add interaction handlers
      cyInstanceRef.current.on('tap', 'node', (evt: any) => {
        const node = evt.target
        cyInstanceRef.current.animate({ 
          center: { eles: node }, 
          zoom: Math.max(cyInstanceRef.current.zoom(), 1),
          duration: 300 
        })
      })

      // Double-click to fit
      cyInstanceRef.current.on('dbltap', (evt: any) => {
        if (evt.target === cyInstanceRef.current) {
          cyInstanceRef.current.fit(undefined, 50)
        }
      })
    } else {
      // Update existing instance
      cyInstanceRef.current.json({ elements })
      cyInstanceRef.current.layout({ 
        name: 'dagre', 
        rankDir: 'TB', 
        nodeSep: 80, 
        edgeSep: 10, 
        rankSep: 100,
        spacingFactor: 1.2
      }).run()
    }

    // Apply current-step class
    const currentAdded = new Set<string>((steps[currentStep]?.addedNodeIds) || [])
    cyInstanceRef.current.nodes().removeClass('current-step')
    currentAdded.forEach((id) => {
      const n = cyInstanceRef.current.getElementById(id)
      if (n && n.length > 0) n.addClass('current-step')
    })
  }

  useEffect(() => {
    initOrUpdateCytoscape()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bddData, steps, currentStep])


  const calculateNodePositions = (data: BDDData): Record<string, { x: number; y: number }> => {
    const positions: Record<string, { x: number; y: number }> = {}
    const hash = (s: string) => {
      let h = 0
      for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0
      }
      return h
    }

    const levelNodes: Record<number, string[]> = {}
    Object.values(data.nodes).forEach((node) => {
      if (!levelNodes[node.level]) levelNodes[node.level] = []
      levelNodes[node.level].push(node.id)
    })

    const canvas = canvasRef.current
    if (!canvas) return positions

    const CENTER_X = canvas.width / 2
    const TOP_PADDING = 80
    const LEVEL_GAP = 140
    const NODE_GAP = 160
    const MIN_GAP = NODE_GAP * 0.8
    const EDGE_OFFSET = NODE_GAP * 0.95

    const levels = Object.keys(levelNodes)
      .map((l) => parseInt(l, 10))
      .sort((a, b) => a - b)
    if (levels.length === 0) return positions
    const minLevel = levels[0]

    const parents: Record<string, string[]> = {}
    const children: Record<string, string[]> = {}
    Object.values(data.nodes).forEach((n) => {
      if (n.low) {
        parents[n.low] = parents[n.low] || []
        parents[n.low].push(n.id)
        children[n.id] = children[n.id] || []
        children[n.id].push(n.low)
      }
      if (n.high) {
        parents[n.high] = parents[n.high] || []
        parents[n.high].push(n.id)
        children[n.id] = children[n.id] || []
        children[n.id].push(n.high)
      }
    })

    const order: Record<number, string[]> = {}
    levels.forEach((lvl) => {
      order[lvl] = [...levelNodes[lvl]].sort((a, b) => a.localeCompare(b))
    })

    const yOf = (lvl: number) => TOP_PADDING + (lvl - minLevel) * LEVEL_GAP

    const assignPositionsFromOrder = () => {
      levels.forEach((lvl) => {
        const ids = order[lvl]
        const y = yOf(lvl)
        if (!ids || ids.length === 0) return
        const count = ids.length
        const totalWidth = (count - 1) * NODE_GAP
        const startX = CENTER_X - totalWidth / 2
        ids.forEach((id, idx) => {
          positions[id] = { x: startX + idx * NODE_GAP, y }
        })
      })
    }

    const sortByBarycenter = (ids: string[], getNeighbors: (id: string) => string[]): string[] => {
      return ids
        .map((id, idx) => {
          const neigh = getNeighbors(id) || []
          let sum = 0
          let count = 0
          neigh.forEach((nid) => {
            const p = positions[nid]
            if (p) {
              sum += p.x
              count += 1
            }
          })
          const bc = count > 0 ? sum / count : Number.POSITIVE_INFINITY
          return { id, bc, idx }
        })
        .sort((a, b) => {
          if (a.bc === b.bc) return a.idx - b.idx
          return a.bc - b.bc
        })
        .map((x) => x.id)
    }

    assignPositionsFromOrder()

    for (let iter = 0; iter < 2; iter++) {
      for (let lvlIdx = 1; lvlIdx < levels.length; lvlIdx++) {
        const lvl = levels[lvlIdx]
        const ids = order[lvl]
        order[lvl] = sortByBarycenter(ids, (id) => parents[id] || [])
        assignPositionsFromOrder()
      }
      for (let lvlIdx = levels.length - 2; lvlIdx >= 0; lvlIdx--) {
        const lvl = levels[lvlIdx]
        const ids = order[lvl]
        order[lvl] = sortByBarycenter(ids, (id) => children[id] || [])
        assignPositionsFromOrder()
      }
    }

    assignPositionsFromOrder()

    const applyConstraints = () => {
      levels.forEach((lvl) => {
        const ids = order[lvl]
        if (!ids || ids.length === 0) return

        ids.forEach((id) => {
          const pos = positions[id]
          if (!pos) return
          const ps = parents[id] || []
          let minBound = -Infinity
          let maxBound = Infinity

          ps.forEach((pid) => {
            const parentPos = positions[pid]
            if (!parentPos) return
            const parent = data.nodes[pid]
            const depth = Math.max(1, lvl - parent.level)
            const bias = EDGE_OFFSET * (1 + 0.25 * (depth - 1))
            if (parent.high === id) {
              minBound = Math.max(minBound, parentPos.x + bias)
            }
            if (parent.low === id) {
              maxBound = Math.min(maxBound, parentPos.x - bias)
            }
          })

          let x = pos.x
          if (minBound > -Infinity && maxBound < Infinity && minBound > maxBound) {
            const mid = (minBound + maxBound) / 2
            minBound = mid
            maxBound = mid
          }
          if (minBound > -Infinity && x < minBound) x = minBound
          if (maxBound < Infinity && x > maxBound) x = maxBound

          if (ps.length > 0 && (!isFinite(minBound) || !isFinite(maxBound))) {
            const balance = ps.reduce((acc, pid) => {
              const parent = data.nodes[pid]
              if (parent.high === id && parent.low !== id) return acc + NODE_GAP * 0.05
              if (parent.low === id && parent.high !== id) return acc - NODE_GAP * 0.05
              return acc
            }, 0)
            x += balance
          }

          positions[id] = { x, y: pos.y }
        })

        // Left-to-right separation
        for (let i = 1; i < ids.length; i++) {
          const prev = positions[ids[i - 1]]
          const curr = positions[ids[i]]
          if (!prev || !curr) continue
          if (curr.x < prev.x + MIN_GAP) {
            curr.x = prev.x + MIN_GAP
          }
        }

        // Right-to-left separation
        for (let i = ids.length - 2; i >= 0; i--) {
          const next = positions[ids[i + 1]]
          const curr = positions[ids[i]]
          if (!next || !curr) continue
          if (curr.x > next.x - MIN_GAP) {
            curr.x = next.x - MIN_GAP
          }
        }
      })
    }

    // Multiple passes to satisfy constraints with updated parent positions
    for (let iter = 0; iter < 3; iter++) {
      applyConstraints()
    }

    let minX = Infinity
    let maxX = -Infinity
    Object.values(positions).forEach((pos) => {
      if (pos.x < minX) minX = pos.x
      if (pos.x > maxX) maxX = pos.x
    })

    if (isFinite(minX) && isFinite(maxX)) {
      const mid = (minX + maxX) / 2
      const shift = CENTER_X - mid
      Object.values(positions).forEach((pos) => {
        pos.x += shift
      })
    }

    return positions
  }

  // Use Graphviz layout coordinates (matching LaTeX) if available
  const calculateNodePositionsFromGV = (data: BDDData, layoutData: NonNullable<typeof layout>): Record<string, { x: number; y: number }> => {
    const positions: Record<string, { x: number; y: number }> = {}
    if (!layoutData.nodes_json || !layoutData.bbox) return positions
    const H = layoutData.bbox.height
    Object.values(data.nodes).forEach((node) => {
      const geom = layoutData.nodes_json![node.id]
      if (!geom) return
      const x = geom.x
      const y = H - geom.y // flip Y to canvas coordinates
      positions[node.id] = { x, y }
    })
    return positions
  }

  const fitViewToLayout = (layoutData: NonNullable<typeof layout>) => {
    const canvas = canvasRef.current
    if (!canvas || !layoutData?.bbox) return
    const cw = canvas.width
    const ch = canvas.height
    const lw = Math.max(1, layoutData.bbox.width)
    const lh = Math.max(1, layoutData.bbox.height)
    const margin = 40
    const scaleX = (cw - margin * 2) / lw
    const scaleY = (ch - margin * 2) / lh
    const s = Math.max(0.1, Math.min(4, Math.min(scaleX, scaleY)))
    setScale(s)
    // center
    const ox = (cw - lw * s) / 2
    const oy = (ch - lh * s) / 2
    setOffset({ x: ox, y: oy })
  }

  useEffect(() => {
    if (bddData && steps.length > 0) {
      drawBDD(currentStep)
    }
  }, [bddData, currentStep, steps, scale, offset])

  useEffect(() => {
    if (isPlaying && currentStep < steps.length - 1) {
      animationRef.current = window.setTimeout(() => {
        setCurrentStep((prev) => prev + 1)
      }, 2000)
    } else if (currentStep >= steps.length - 1) {
      setIsPlaying(false)
    }

    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current)
      }
    }
  }, [isPlaying, currentStep, steps.length])

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying)
  }

  const handleReset = () => {
    setCurrentStep(0)
    setIsPlaying(false)
  }

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1)
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }
  
  // Zoom controls
  const handleZoomIn = () => {
    if (cyInstanceRef.current) {
      const currentZoom = cyInstanceRef.current.zoom();
      cyInstanceRef.current.zoom({
        level: currentZoom * 1.2,
        renderedPosition: { x: cyInstanceRef.current.width() / 2, y: cyInstanceRef.current.height() / 2 }
      });
    }
  };

  const handleZoomOut = () => {
    if (cyInstanceRef.current) {
      const currentZoom = cyInstanceRef.current.zoom();
      cyInstanceRef.current.zoom({
        level: currentZoom / 1.2,
        renderedPosition: { x: cyInstanceRef.current.width() / 2, y: cyInstanceRef.current.height() / 2 }
      });
    }
  };

  const handleResetZoom = () => {
    if (cyInstanceRef.current) {
      cyInstanceRef.current.fit(undefined, 50);
    }
  };

  // Helper function for downloading files
  const downloadFile = (content: Blob | string, filename: string, type: string) => {
    const blob = typeof content === 'string' ? new Blob([content], {type}) : content;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bdd${filename}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPNG = () => {
    if (!cyInstanceRef.current) return;
    try {
      const pngBlob = cyInstanceRef.current.png({
        scale: 3,
        full: true,
        bg: '#ffffff',
        output: 'blob'
      });

      if (pngBlob instanceof Promise) {
        pngBlob.then((blob: Blob) => {
          downloadFile(blob, '.png', 'image/png');
        });
      } else {
        downloadFile(pngBlob, '.png', 'image/png');
      }
    } catch (err) {
      setError('Failed to export PNG from Cytoscape');
    }
  };

  const handleExportSVG = () => {
    if (cyInstanceRef.current) {
      try {
        // Get the Cytoscape instance
        const cy = cyInstanceRef.current;
        
        // Get the graph dimensions
        const bb = cy.elements().boundingBox();
        const width = bb.w;
        const height = bb.h;
        
        // Create SVG content with defs for arrow markers - standardized size
        let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${bb.x1} ${bb.y1} ${width} ${height}">
  <defs>
    <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
      <polygon points="0 0, 6 2, 0 4" fill="#000"/>
    </marker>
  </defs>
  <rect x="${bb.x1}" y="${bb.y1}" width="${width}" height="${height}" fill="white"/>
`;
        
        // Add nodes to SVG
        cy.nodes().forEach(node => {
          const pos = node.position();
          const label = node.data('label') || node.id();
          const color = node.style('background-color');
          const borderColor = node.style('border-color');
          const borderWidth = parseFloat(node.style('border-width'));
          const width = parseFloat(node.style('width'));
          const height = parseFloat(node.style('height'));
          
          // Check if node is a terminal node (typically has numeric label like 0 or 1)
          const isTerminal = /^[0-1]$/.test(label);
          
          if (isTerminal) {
            // Draw rectangle for terminal nodes
            svgContent += `  <rect x="${pos.x - width/2}" y="${pos.y - height/2}" width="${width}" height="${height}" rx="3" ry="3" fill="${color}" stroke="${borderColor}" stroke-width="${borderWidth}"/>
  <text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="central" fill="black" font-size="14px">${label}</text>
`;
          } else {
            // Draw circle for non-terminal nodes
            svgContent += `  <circle cx="${pos.x}" cy="${pos.y}" r="${width/2}" fill="${color}" stroke="${borderColor}" stroke-width="${borderWidth}"/>
  <text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="central" fill="black" font-size="14px">${label}</text>
`;
          }
        });
        
        // Add edges to SVG
        cy.edges().forEach(edge => {
          const source = edge.source();
          const target = edge.target();
          const sourcePos = source.position();
          const targetPos = target.position();
          const color = edge.style('line-color');
          const width = parseFloat(edge.style('width'));
          
          // Determine if edge should be dashed based on edge type data
          const edgeType = edge.data('type');
          const isDashed = edgeType === 'low';
          const dashArray = isDashed ? "5,5" : "none";
          
          // Calculate edge start and end points at node borders
          const sourceIsTerminal = source.data('isTerminal');
          const targetIsTerminal = target.data('isTerminal');
          
          // Get node dimensions
          const sourceRadius = sourceIsTerminal ? 25 : parseFloat(source.style('width')) / 2;
          const targetRadius = targetIsTerminal ? 25 : parseFloat(target.style('width')) / 2;
          
          // Calculate angle from source to target
          const dx = targetPos.x - sourcePos.x;
          const dy = targetPos.y - sourcePos.y;
          const angle = Math.atan2(dy, dx);
          
          // Calculate start point (at edge of source node)
          const startX = sourcePos.x + Math.cos(angle) * sourceRadius;
          const startY = sourcePos.y + Math.sin(angle) * sourceRadius;
          
          // Calculate end point (at edge of target node)
          const endX = targetPos.x - Math.cos(angle) * targetRadius;
          const endY = targetPos.y - Math.sin(angle) * targetRadius;
          
          // Draw the path
          svgContent += `  <path d="M${startX},${startY} L${endX},${endY}" fill="none" stroke="${color}" stroke-width="${width}" stroke-dasharray="${dashArray}" marker-end="url(#arrowhead)"/>
`;
        });
        
        // Close SVG tag
        svgContent += '</svg>';
        
        // Create a blob and download
        const blob = new Blob([svgContent], {type: 'image/svg+xml;charset=utf-8'});
        downloadFile(blob, '.svg', 'image/svg+xml');
      } catch (err) {
        console.error('SVG export error:', err);
        setError('Failed to export SVG: ' + (err instanceof Error ? err.message : String(err)));
      }
      return; // Exit early for cytoscape mode
    }

  // Canvas SVG export code (rest of the function remains the same)
  if (!bddData) return;
  
  const hasGV = !!layout && !!layout.nodes_json && !!layout.bbox
  const nodePositions = hasGV ? calculateNodePositionsFromGV(bddData, layout!) : calculateNodePositions(bddData)
    const visibleNodes = new Set<string>()
    for (let i = 0; i <= currentStep && i < steps.length; i++) {
      (steps[i].addedNodeIds || []).forEach((id) => visibleNodes.add(id))
    }

    const expandVisible = (set: Set<string>) => {
      let changed = true
      while (changed) {
        changed = false
        Array.from(set).forEach((id) => {
          const node = bddData.nodes[id]
          if (!node) return
          if (node.low && !set.has(node.low)) { set.add(node.low); changed = true }
          if (node.high && !set.has(node.high)) { set.add(node.high); changed = true }
        })
      }
    }
    expandVisible(visibleNodes)

    // Compute bounds of nodes and curved edges
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const include = (x: number, y: number) => {
      if (x < minX) minX = x; if (y < minY) minY = y
      if (x > maxX) maxX = x; if (y > maxY) maxY = y
    }

    const circleR = 15, rectW = 40, rectH = 20

    // Node bounds
    Object.values(bddData.nodes).forEach((node) => {
      if (!visibleNodes.has(node.id)) return
      const p = nodePositions[node.id]
      if (!p) return
      if (node.var === null) {
        include(p.x - rectW / 2, p.y - rectH / 2)
        include(p.x + rectW / 2, p.y + rectH / 2)
      } else {
        include(p.x - circleR, p.y - circleR)
        include(p.x + circleR, p.y + circleR)
      }
    })

    // Edge bounds (convex hull of endpoints+control points)
    const baseCurveFor = (dx: number) => Math.max(80, Math.min(260, Math.abs(dx) * 0.6 + 100))
    const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h }
    if (hasGV && layout?.edges_json) {
      const H = layout.bbox.height
      layout.edges_json.forEach(e => {
        if (!visibleNodes.has(e.tail) || !visibleNodes.has(e.head)) return
        e.points.forEach(([x, y]) => include(x, H - y))
      })
    } else {
      Object.values(bddData.nodes).forEach((node) => {
        if (!visibleNodes.has(node.id)) return
        const pos = nodePositions[node.id]
        if (!pos) return
        const addEdgeBounds = (toId: string, dashed: boolean) => {
          const target = nodePositions[toId]
          if (!target) return
          const toNode = bddData.nodes[toId]
          const fromIsTerminal = node.var === null
          const toIsTerminal = toNode?.var === null
          const x1 = pos.x
          const y1 = pos.y + (fromIsTerminal ? 10 : 15)
          const x2 = target.x
          const y2 = target.y - (toIsTerminal ? 10 : 15)
          const mx = (x1 + x2) / 2
          const my = (y1 + y2) / 2
          const dx = x2 - x1
          const j = ((hash(node.id + ":" + toId) % 21) - 10) * 4
          const cx = mx + (dashed ? -1 : 1) * (baseCurveFor(dx) + j)
          const cy = my + j * 0.2
          include(x1, y1); include(x2, y2); include(cx, cy)
        }
        if (node.low && visibleNodes.has(node.low)) addEdgeBounds(node.low, true)
        if (node.high && visibleNodes.has(node.high)) addEdgeBounds(node.high, false)
      })
    }

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return
    const M = 40
    const width = Math.max(1, Math.ceil(maxX - minX + 2 * M))
    const height = Math.max(1, Math.ceil(maxY - minY + 2 * M))
    const ox = -minX + M
    const oy = -minY + M

    let svgContent = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n
  <defs>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="5" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
    <marker id="arrowSolid" markerWidth="14" markerHeight="10" refX="14" refY="5" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L14,5 L0,10 Z" fill="#333" />
    </marker>
    <marker id="arrowDashed" markerWidth="14" markerHeight="10" refX="14" refY="5" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L14,5 L0,10 Z" fill="#666" />
    </marker>
    <marker id="arrowHighlight" markerWidth="14" markerHeight="10" refX="14" refY="5" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L14,5 L0,10 Z" fill="#ff5722" />
    </marker>
  </defs>\n`

    if (hasGV && layout?.edges_json) {
      const H = layout.bbox.height
      layout.edges_json.forEach((e) => {
        if (!visibleNodes.has(e.tail) || !visibleNodes.has(e.head)) return
        const isHighlighted = (() => {
          const tailNode = bddData.nodes[e.tail]
          const headNode = bddData.nodes[e.head]
     return !!(tailNode && tailNode.highlight) && !!(headNode && headNode.highlight)
        })()
        const strokeColor = isHighlighted ? "#ff5722" : (e.style === "dashed" ? "#666" : "#333")
        const strokeWidth = isHighlighted ? 3.5 : 2
        const marker = isHighlighted ? "url(#arrowHighlight)" : (e.style === "dashed" ? "url(#arrowDashed)" : "url(#arrowSolid)")
        const dash = e.style === "dashed" ? ' stroke-dasharray="5,5"' : ''
        const glow = isHighlighted ? ' filter="url(#glow)"' : ''
        const pts = e.points.map(([x, y]) => `${x + ox},${H - y + oy}`).join(" ")
        svgContent += `  <polyline points="${pts}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" marker-end="${marker}"${dash}${glow}/>\n`
      })
    } else {
      // Curved edges fallback
      Object.values(bddData.nodes).forEach((node) => {
        if (!visibleNodes.has(node.id)) return
        const pos = nodePositions[node.id]
        if (!pos) return
  const isNodeHighlighted = !!node.highlight
        const drawCurve = (toId: string, dashed: boolean) => {
          const targetPos = nodePositions[toId]
          if (!targetPos) return
          const targetNode = bddData.nodes[toId]
          const isTargetHighlighted = !!(targetNode && targetNode.highlight)
          const isEdgeHighlighted = isNodeHighlighted && isTargetHighlighted
          const strokeColor = isEdgeHighlighted ? "#ff5722" : (dashed ? "#666" : "#333")
          const strokeWidth = isEdgeHighlighted ? 3.5 : 2
          const marker = isEdgeHighlighted ? "url(#arrowHighlight)" : (dashed ? "url(#arrowDashed)" : "url(#arrowSolid)")
          const fromIsTerminal = node.var === null
          const toIsTerminal = targetNode?.var === null
          const x1 = pos.x + ox
          const y1 = pos.y + (fromIsTerminal ? 10 : 15) + oy
          const x2 = targetPos.x + ox
          const y2 = targetPos.y - (toIsTerminal ? 10 : 15) + oy
          const mx = (x1 + x2) / 2
          const my = (y1 + y2) / 2
          const dx = x2 - x1
          const curvature = baseCurveFor(dx)
          const j = ((hash(node.id + ":" + toId) % 21) - 10) * 2
          const cx = mx + (dashed ? -1 : 1) * (curvature + j)
          const cy = my
          const path = Math.abs(dx) < 20
            ? `M ${x1} ${y1} L ${x2} ${y2}`
            : `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
          const dash = dashed ? ' stroke-dasharray="5,5"' : ''
          const glow = isEdgeHighlighted ? ' filter="url(#glow)"' : ''
          svgContent += `  <path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" marker-end="${marker}"${dash}${glow}/>\n`
        }
        if (node.low && visibleNodes.has(node.low)) drawCurve(node.low, true)
        if (node.high && visibleNodes.has(node.high)) drawCurve(node.high, false)
      })
    }

    // Nodes on top (apply offset)
    Object.values(bddData.nodes).forEach((node) => {
      if (!visibleNodes.has(node.id)) return
      const pos = nodePositions[node.id]
      if (!pos) return
      const x = pos.x + ox
      const y = pos.y + oy
      const isTerminal = node.var === null
      const isOne = node.expr === "1" || node.expr === "True"
      const displayText = node.var || (isOne ? "1" : "0")
  const isHighlighted = !!node.highlight
      const currentAdded = new Set<string>((steps[currentStep]?.addedNodeIds) || [])
      const isCurrentAdded = currentAdded.has(node.id)
      if (isTerminal) {
        let fillColor = isOne ? "#4caf50" : "#e57373"
        if (isCurrentAdded) fillColor = "#ffeb3b"
        else if (isOne) fillColor = "#81c784"
        const strokeColor = isHighlighted ? "#ff5722" : "#333"
        const strokeWidth = isHighlighted ? 4 : 2
        svgContent += `  <rect x="${x - rectW / 2}" y="${y - rectH / 2}" width="${rectW}" height="${rectH}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>\n`
        if (isHighlighted) {
          svgContent += `  <rect x="${x - rectW / 2}" y="${y - rectH / 2}" width="${rectW}" height="${rectH}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" filter="url(#glow)"/>\n`
        }
        svgContent += `  <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="16" font-weight="bold">${displayText}</text>\n`
      } else {
        let fillColor = "#90caf9"
        if (isCurrentAdded) fillColor = "#ffeb3b"
        else if (isHighlighted) fillColor = "#42a5f5"
        const strokeColor = isHighlighted ? "#ff5722" : "#333"
        const strokeWidth = isHighlighted ? 4 : 2
        svgContent += `  <circle cx="${x}" cy="${y}" r="${circleR}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>\n`
        if (isHighlighted) {
          svgContent += `  <circle cx="${x}" cy="${y}" r="${circleR}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" filter="url(#glow)"/>\n`
        }
        svgContent += `  <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="16" font-weight="bold">${displayText}</text>\n`
      }
    })

    svgContent += `</svg>`

    const blob = new Blob([svgContent], { type: "image/svg+xml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `bdd-${formula.replace(/[^a-zA-Z0-9]/g, "_")}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportTikZ = async () => {
    if (!formula) return

    try {
      const response = await fetch("/api/export-tikz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formula: formula,
          graph_type: graphType,
          eval_path: showEvalPath ? variableValues : null,
        }),
      })

      const data = await response.json()

      if (data.status === "error") {
        setError(data.message)
        return
      }

      if (!data.latex) {
        setError("LaTeX content is missing in the response")
        return
      }

      const blob = new Blob([data.latex], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "bdd.tex"
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError("Failed to export TikZ. Make sure the API is running.")
    }
  }

  const handleExportJSON = async () => {
    if (!formula) return

    try {
      const requestBody: any = {
        formula: formula,
        graph_type: graphType,
      };

      // Add variable ordering if specified
      if (orderingMethod === "custom" && customOrder.trim()) {
        requestBody.var_order = customOrder.trim();
      } else if (orderingMethod === "auto") {
        requestBody.auto_order = "ls"; // Use local sifting for auto ordering
      }

      // Add variable values for evaluation path if enabled
      if (showEvalPath && Object.keys(variableValues).length > 0) {
        const evalPathStr = Object.entries(variableValues)
          .filter(([_, value]) => value !== undefined)
          .map(([variable, value]) => `${variable}:${value}`)
          .join(' ');

        if (evalPathStr) {
          requestBody.eval_path = evalPathStr;
        }
      }

      const response = await fetch("/api/export-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })

      const data = await response.json()

      if (data.status === "error") {
        setError(data.message)
        return
      }

      if (!data.json) {
        setError("JSON content is missing in the response")
        return
      }

      const blob = new Blob([JSON.stringify(data.json, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "bdd.json"
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError("Failed to export JSON. Make sure the API is running.")
    }
  }

  // Handle mouse wheel for zooming
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const delta = -e.deltaY / 500
    const newScale = Math.max(0.25, Math.min(4, scale + delta))
    
    // Adjust the offset to zoom toward the mouse position
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect) {
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      
      const newOffset = {
        x: mouseX - (mouseX - offset.x) * (newScale / scale),
        y: mouseY - (mouseY - offset.y) * (newScale / scale)
      }
      
      setScale(newScale)
      setOffset(newOffset)
    }
  }

  // Handle mouse events for dragging/panning
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
  }

  // Reset zoom and pan
  const handleResetView = () => {
    if (layout && layout.bbox) {
      fitViewToLayout(layout)
    } else {
      setScale(1)
      setOffset({ x: 0, y: 0 })
    }
  }

  // Resize canvas to fill its container (100vh tall container)
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current
      const container = canvasContainerRef.current
      if (!canvas || !container) return

      const styles = window.getComputedStyle(container)
      const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight)
      const padY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom)
      const contentWidth = Math.max(1, container.clientWidth - padX)
      const contentHeight = Math.max(1, container.clientHeight - padY)

      // Set CSS size to fill container content box
      canvas.style.width = `${contentWidth}px`
      canvas.style.height = `${contentHeight}px`
      // Match internal buffer to CSS size (no DPR scaling to keep transforms stable)
      canvas.width = Math.floor(contentWidth)
      canvas.height = Math.floor(contentHeight)

      if (bddData && steps.length > 0) {
        drawBDD(currentStep)
      }
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bddData, steps, currentStep])

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>BDD Visualizer</h1>
        <p>Binary Decision Diagram Educational Tool</p>
      </header>

      <div className={styles.content}>
        <div className={styles.inputSection}>
          <div className={styles.formGroup}>
            <label htmlFor="formula">Boolean Formula:</label>
            <input
              id="formula"
              type="text"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="e.g., a&b|c"
              className={styles.input}
            />
            <small className={styles.hint}>
              Use: & (AND), | (OR), ~ (NOT), ^ (XOR), -{">"} (IMPLIES), {"<->"} (IFF)
            </small>
          </div>

          <div className={styles.formGroup}>
            <label>Diagram Type:</label>
            <div className={styles.radioGroup}>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  value="bdd"
                  checked={graphType === "bdd"}
                  onChange={(e) => setGraphType(e.target.value as "bdd" | "robdd")}
                />
                BDD (Binary Decision Diagram)
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  value="robdd"
                  checked={graphType === "robdd"}
                  onChange={(e) => setGraphType(e.target.value as "bdd" | "robdd")}
                />
                ROBDD (Reduced Ordered BDD)
              </label>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Variable Ordering:</label>
            <div className={styles.radioGroup}>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  value="none"
                  checked={orderingMethod === "none"}
                  onChange={() => setOrderingMethod("none")}
                />
                Default Order
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  value="auto"
                  checked={orderingMethod === "auto"}
                  onChange={() => setOrderingMethod("auto")}
                />
                Auto Optimize Order
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  value="custom"
                  checked={orderingMethod === "custom"}
                  onChange={() => setOrderingMethod("custom")}
                />
                Custom Order
              </label>
            </div>
            
            {orderingMethod === "custom" && (
              <div className={styles.customOrderContainer}>
                <input
                  type="text"
                  value={customOrder}
                  onChange={(e) => setCustomOrder(e.target.value)}
                  placeholder="e.g., a b c (space separated)"
                  className={styles.input}
                />
                <small className={styles.hint}>
                  Enter variables in desired order, separated by spaces
                </small>
              </div>
            )}
            
            {bddData && (
              <div className={styles.currentOrderContainer}>
                <small className={styles.hint}>
                  Current variable order: {bddData.variables.join(" > ")}
                </small>
              </div>
            )}
          </div>
          
          <div className={styles.formGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={showEvalPath}
                onChange={(e) => setShowEvalPath(e.target.checked)}
              />
              Show Evaluation Path
            </label>
            
            {showEvalPath && (
              <div className={styles.variableValuesContainer}>
                <div className={styles.variableValuesGrid}>
                  {(
                    (bddData && Array.isArray(bddData.variables) && bddData.variables.length > 0)
                      ? bddData.variables
                      : Array.from(new Set((formula.match(/[a-z_][a-z0-9_]*/g) || [])))
                  ).map(variable => (
                    <div key={variable} className={styles.variableValueItem}>
                      <label htmlFor={`var-${variable}`}>{variable}:</label>
                      <select
                        id={`var-${variable}`}
                        value={variableValues[variable] !== undefined ? variableValues[variable].toString() : ""}
                        onChange={(e) => {
                          const newValues = {...variableValues};
                          if (e.target.value === "") {
                            delete newValues[variable];
                          } else {
                            newValues[variable] = parseInt(e.target.value);
                          }
                          setVariableValues(newValues);
                        }}
                        className={styles.variableSelect}
                      >
                        <option value="">Not set</option>
                        <option value="0">0</option>
                        <option value="1">1</option>
                      </select>
                    </div>
                  ))}
                </div>
                <small className={styles.hint}>
                  Set variable values to highlight the evaluation path in the diagram
                </small>
              </div>
            )}
          </div>

          <button onClick={handleVisualize} disabled={loading || !formula} className={styles.visualizeButton}>
            {loading ? "Processing..." : "Visualize"}
          </button>

          {error && (
            <div className={styles.error}>
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>

        {bddData && steps.length > 0 && (
          <>
            {/* Explanation at top of canvas */}
            <div className={styles.explanationTop}>
              <h3 style={{fontWeight: 700}}>Current Step Explanation:</h3>
              <p>{steps[currentStep]?.explanation}</p>
              <p className={styles.tip}>Tip: Hold and drag nodes to adjust the diagram position as needed.</p>
            </div>

            {/* Canvas with right vertical legend */}
            <div className={styles.canvasRow}>
              <div className={styles.canvasContainer}>
                <div ref={cyContainerRef} className={styles.cytoscapeContainer} />
                <div className={styles.zoomControls}>
                  <button onClick={() => handleZoomIn()} className={styles.zoomButton} title="Zoom In">+</button>
                  <button onClick={() => handleZoomOut()} className={styles.zoomButton} title="Zoom Out">-</button>
                  <button onClick={() => handleResetZoom()} className={styles.zoomButton} title="Reset Zoom">↺</button>
                </div>
              </div>


              <aside className={styles.legendSidebar}>
                <h3>Legend</h3>
                <div className={styles.legendItemsVertical}>
                  <div className={styles.legendItem}>
                    <div className={styles.legendCircle} style={{ backgroundColor: "#90caf9" }}></div>
                    <span>Decision Node</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendSquare} style={{ backgroundColor: "#81c784" }}></div>
                    <span>Terminal Node (1)</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendSquare} style={{ backgroundColor: "#e57373" }}></div>
                    <span>Terminal Node (0)</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendCircle} style={{ backgroundColor: "#ffeb3b" }}></div>
                    <span>Current Step</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendLine} style={{ borderTop: "2px solid #333", width: 32 }}></div>
                    <span>High Branch (var=1)</span>
                  </div>
                  <div className={styles.legendItem}>
                    <div className={styles.legendLine} style={{ borderTop: "2px dashed #666", width: 32 }}></div>
                    <span>Low Branch (var=0)</span>
                  </div>
                </div>
              </aside>
            </div>

            {/* Controls and export below canvas */}
            <div className={styles.controls}>
              <button onClick={handleReset} className={styles.controlButton}>
                Reset
              </button>
              <button onClick={handlePrev} disabled={currentStep === 0} className={styles.controlButton}>
                Previous
              </button>
              <button onClick={handlePlayPause} className={styles.controlButton}>
                {isPlaying ? "Pause" : "Play"}
              </button>
              <button onClick={handleNext} disabled={currentStep >= steps.length - 1} className={styles.controlButton}>
                Next
              </button>
              <span className={styles.stepCounter}>
                Step {currentStep + 1} of {steps.length}
              </span>
            </div>

            <div className={styles.exportSection}>
              <h3>Export Options:</h3>
              <div className={styles.exportButtons}>
                <button onClick={handleExportPNG} className={styles.exportButton}>
                  Export as PNG
                </button>
                <button 
                    onClick={handleExportSVG} 
                    className={styles.exportButton}
                  >
                    Export as SVG
                </button>
                <button onClick={handleExportTikZ} className={styles.exportButton}>
                  Export as TikZ (LaTeX)
                </button>
                <button onClick={handleExportJSON} className={styles.exportButton}>
                  Export as JSON
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

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
  const animationRef = useRef<number | null>(null)

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

    const nodePositions = calculateNodePositions(bddData)

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

    // draw edges first
    Object.values(bddData.nodes).forEach((node) => {
      if (!visibleNodes.has(node.id)) return

      const pos = nodePositions[node.id]
      if (!pos) return

      const isNodeHighlighted = node.highlight === true || node.highlight === 1

      if (node.low && visibleNodes.has(node.low)) {
        const lowPos = nodePositions[node.low]
        if (lowPos) {
          const lowNode = bddData.nodes[node.low]
          const isLowHighlighted = lowNode && (lowNode.highlight === true || lowNode.highlight === 1)
          const isEdgeHighlighted = isNodeHighlighted && isLowHighlighted
          
          ctx.save()
          ctx.setLineDash([5, 5])
          
          if (isEdgeHighlighted) {
            // Highlighted low edge (dashed)
            ctx.strokeStyle = "#ff5722"
            ctx.lineWidth = 4
            ctx.shadowColor = "#ff5722"
            ctx.shadowBlur = 10
          } else {
            // Normal low edge (dashed)
            ctx.strokeStyle = "#666"
            ctx.lineWidth = 2
          }
          
          ctx.beginPath()
          ctx.moveTo(pos.x, pos.y + 25)
          ctx.lineTo(lowPos.x, lowPos.y - 25)
          ctx.stroke()
          ctx.restore()
        }
      }

      if (node.high && visibleNodes.has(node.high)) {
        const highPos = nodePositions[node.high]
        if (highPos) {
          const highNode = bddData.nodes[node.high]
          const isHighHighlighted = highNode && (highNode.highlight === true || highNode.highlight === 1)
          const isEdgeHighlighted = isNodeHighlighted && isHighHighlighted
          
          ctx.save()
          
          if (isEdgeHighlighted) {
            // Highlighted high edge (solid)
            ctx.strokeStyle = "#ff5722"
            ctx.lineWidth = 4
            ctx.shadowColor = "#ff5722"
            ctx.shadowBlur = 10
          } else {
            // Normal high edge (solid)
            ctx.strokeStyle = "#333"
            ctx.lineWidth = 2
          }
          
          ctx.beginPath()
          ctx.moveTo(pos.x, pos.y + 25)
          ctx.lineTo(highPos.x, highPos.y - 25)
          ctx.stroke()
          ctx.restore()
        }
      }
    })

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
      const isHighlighted = node.highlight === true || node.highlight === 1

      ctx.save()

      if (isTerminal) {
        // terminals: green/red; newly added terminals get yellow fill
        ctx.fillStyle = isCurrentAdded ? "#ffeb3b" : (isOne ? "#81c784" : "#e57373")
        ctx.strokeStyle = isHighlighted ? "#ff5722" : "#333"
        ctx.lineWidth = isHighlighted ? 4 : 2
        ctx.fillRect(pos.x - 40, pos.y - 20, 80, 40)
        ctx.strokeRect(pos.x - 40, pos.y - 20, 80, 40)
        
        // Add glow effect for highlighted nodes
        if (isHighlighted) {
          ctx.shadowColor = "#ff5722";
          ctx.shadowBlur = 15;
          ctx.strokeRect(pos.x - 40, pos.y - 20, 80, 40);
          ctx.shadowBlur = 0;
        }
      } else {
        // decision nodes: normal blue; newly added get yellow fill
        ctx.fillStyle = isCurrentAdded ? "#ffeb3b" : (isHighlighted ? "#42a5f5" : "#90caf9")
        ctx.strokeStyle = isHighlighted ? "#ff5722" : "#333"
        ctx.lineWidth = isHighlighted ? 4 : 2
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, 30, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        
        // Add evaluation path highlight
        if (isHighlighted) {
          ctx.shadowColor = "#ff5722";
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 30, 0, Math.PI * 2);
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
  }

  const calculateNodePositions = (data: BDDData): Record<string, { x: number; y: number }> => {
    const positions: Record<string, { x: number; y: number }> = {}
    const levelNodes: Record<number, string[]> = {}

    Object.values(data.nodes).forEach((node) => {
      if (!levelNodes[node.level]) {
        levelNodes[node.level] = []
      }
      levelNodes[node.level].push(node.id)
    })

    const canvas = canvasRef.current
    if (!canvas) return positions

    const width = canvas.width
    const height = canvas.height
    const levels = Object.keys(levelNodes).length
    const verticalSpacing = height / (levels + 1)

    Object.entries(levelNodes).forEach(([level, nodeIds]) => {
      const levelNum = Number.parseInt(level)
      const y = verticalSpacing * (levelNum + 1)
      const horizontalSpacing = width / (nodeIds.length + 1)

      nodeIds.forEach((nodeId, index) => {
        const x = horizontalSpacing * (index + 1)
        positions[nodeId] = { x, y }
      })
    })

    return positions
  }

  useEffect(() => {
    if (bddData && steps.length > 0) {
      drawBDD(currentStep)
    }
  }, [bddData, currentStep, steps])

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

  const handleExportPNG = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `bdd-${formula.replace(/[^a-zA-Z0-9]/g, "_")}.png`
        a.click()
        URL.revokeObjectURL(url)
      }
    })
  }

  const handleExportSVG = () => {
      if (!bddData) return

      const nodePositions = calculateNodePositions(bddData)
      const visibleNodes = new Set<string>()
      for (let i = 0; i <= currentStep && i < steps.length; i++) {
        // previously used a non-existent property; use addedNodeIds[]
        (steps[i].addedNodeIds || []).forEach((id) => visibleNodes.add(id))
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

    let svgContent = `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">\n
  <defs>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="5" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>\n`

    Object.values(bddData.nodes).forEach((node) => {
      if (!visibleNodes.has(node.id)) return
      const pos = nodePositions[node.id]
      if (!pos) return
      
      const isNodeHighlighted = node.highlight === true || node.highlight === 1

      if (node.low && visibleNodes.has(node.low)) {
        const lowPos = nodePositions[node.low]
        if (lowPos) {
          const lowNode = bddData.nodes[node.low]
          const isLowHighlighted = lowNode && (lowNode.highlight === true || lowNode.highlight === 1)
          const isEdgeHighlighted = isNodeHighlighted && isLowHighlighted
          
          const strokeColor = isEdgeHighlighted ? "#ff5722" : "#666";
          const strokeWidth = isEdgeHighlighted ? "4" : "2";
          
          svgContent += `  <line x1="${pos.x}" y1="${pos.y + 25}" x2="${lowPos.x}" y2="${lowPos.y - 25}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="5,5" ${isEdgeHighlighted ? 'filter="url(#glow)"' : ''}/>\n`
        }
      }

      if (node.high && visibleNodes.has(node.high)) {
        const highPos = nodePositions[node.high]
        if (highPos) {
          const highNode = bddData.nodes[node.high]
          const isHighHighlighted = highNode && (highNode.highlight === true || highNode.highlight === 1)
          const isEdgeHighlighted = isNodeHighlighted && isHighHighlighted
          
          const strokeColor = isEdgeHighlighted ? "#ff5722" : "#333";
          const strokeWidth = isEdgeHighlighted ? "4" : "2";
          
          svgContent += `  <line x1="${pos.x}" y1="${pos.y + 25}" x2="${highPos.x}" y2="${highPos.y - 25}" stroke="${strokeColor}" stroke-width="${strokeWidth}" ${isEdgeHighlighted ? 'filter="url(#glow)"' : ''}/>\n`
        }
      }
    })

    Object.values(bddData.nodes).forEach((node) => {
      if (!visibleNodes.has(node.id)) return
      const pos = nodePositions[node.id]
      if (!pos) return

      const isTerminal = node.var === null
      const isOne = node.expr === "1" || node.expr === "True"
      const displayText = node.var || (isOne ? "1" : "0")
      const isHighlighted = node.highlight === true || node.highlight === 1
      const currentAdded = new Set<string>((steps[currentStep]?.addedNodeIds) || [])
      const isCurrentAdded = currentAdded.has(node.id)

      if (isTerminal) {
        // For terminal nodes
        let fillColor = isOne ? "#4caf50" : "#e57373"; // Green for 1, Red for 0
        if (isCurrentAdded) {
          fillColor = "#ffeb3b"; // Yellow for current step
        } else if (isOne) {
          fillColor = "#81c784"; // Green for 1/true
        }
        
        let strokeColor = isHighlighted ? "#ff5722" : "#333";
        let strokeWidth = isHighlighted ? "4" : "2";
        
        svgContent += `  <rect x="${pos.x - 40}" y="${pos.y - 20}" width="80" height="40" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>\n`
        
        // Add extra stroke for highlighted nodes
        if (isHighlighted) {
          svgContent += `  <rect x="${pos.x - 40}" y="${pos.y - 20}" width="80" height="40" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" filter="url(#glow)"/>\n`
        }
        
        svgContent += `  <text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="16" font-weight="bold">${displayText}</text>\n`
      } else {
        // For decision nodes
        let fillColor = "#90caf9"; // Default blue
        if (isCurrentAdded) {
          fillColor = "#ffeb3b"; // Yellow for current step
        } else if (isHighlighted) {
          fillColor = "#42a5f5"; // Darker blue for highlighted
        }
        
        let strokeColor = isHighlighted ? "#ff5722" : "#333";
        let strokeWidth = isHighlighted ? "4" : "2";
        
        svgContent += `  <circle cx="${pos.x}" cy="${pos.y}" r="30" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>\n`
        
        // Add extra stroke for highlighted nodes
        if (isHighlighted) {
          svgContent += `  <circle cx="${pos.x}" cy="${pos.y}" r="30" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" filter="url(#glow)"/>\n`
        }
        
        svgContent += `  <text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="16" font-weight="bold">${displayText}</text>\n`
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
      a.download = `bdd-${formula.replace(/[^a-zA-Z0-9]/g, "_")}.tex`
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
      a.download = `bdd-${formula.replace(/[^a-zA-Z0-9]/g, "_")}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError("Failed to export JSON. Make sure the API is running.")
    }
  }

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
                  {formula.replace(/[^a-z_]/g, '').split('').filter((v, i, a) => a.indexOf(v) === i).map(variable => (
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
              <h3>Current Step Explanation:</h3>
              <p>{steps[currentStep]?.explanation}</p>
            </div>

            {/* Canvas with right vertical legend */}
            <div className={styles.canvasRow}>
              <div className={styles.canvasContainer}>
                <canvas ref={canvasRef} width={800} height={600} className={styles.canvas} />
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

            {/* Export and controls below canvas */}
            <div className={styles.exportSection}>
              <h3>Export Options:</h3>
              <div className={styles.exportButtons}>
                <button onClick={handleExportPNG} className={styles.exportButton}>
                  Export as PNG
                </button>
                <button onClick={handleExportSVG} className={styles.exportButton}>
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
          </>
        )}
      </div>
    </div>
  )
}

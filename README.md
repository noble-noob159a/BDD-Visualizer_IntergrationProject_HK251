# Đồ Án Tổng Hợp - Trí Tuệ Nhân Tạo - HK251  
Tên dự án: BDD Visualizer --- Minh họa trực quan cấu trúc dữ liệu Binary Decision Diagrams  
GVHD: Trịnh Văn Giang
 Link trang web: https://bdd-visualizer-n9m30ytqz-tleeds1s-projects.vercel.app/

# BDD Visualizer

A comprehensive tool for visualizing Binary Decision Diagrams (BDDs) and Reduced Ordered Binary Decision Diagrams (ROBDDs) with interactive step-by-step construction visualization.

## Overview

The BDD Visualizer is a full-stack application that allows users to:
- Input Boolean formulas and visualize their BDD/ROBDD representations
- Watch the step-by-step construction of diagrams with detailed explanations
- Customize variable ordering or use automatic ordering algorithms
- Export diagrams as PNG, SVG, or LaTeX/TikZ for academic papers

The application consists of a Python FastAPI backend for BDD construction and a Next.js frontend for visualization.

## Project Structure

```
bdd-visualizer/
├── app/                  # Backend Python code
│   ├── api/              # API routes
│   ├── core/             # BDD implementation
│   ├── export/           # Export functionality
│   └── utils/            # Utilities
├── components/           # Frontend React components
├── public/               # Static assets
└── ...                   # Configuration files
```

## Setup Instructions

### Prerequisites

- Python 3.8+ for the backend
- Node.js 16+ for the frontend
- npm or pnpm for package management

### Backend Setup

1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Start the backend server:
   ```bash
   cd app
   python main.py
   # or
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
   The backend will run on http://localhost:8000 by default.

### Frontend Setup

1. Install Node.js dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   # or
   pnpm dev
   ```
   The frontend will run on http://localhost:3000 by default.

## Usage Guide

### Creating a BDD/ROBDD

1. Enter a Boolean formula in the input field (e.g., `a&b|c`)
   - Supported operators:
     - `&` (AND)
     - `|` (OR)
     - `^` (XOR)
     - `->` (IMPLIES)
     - `<->` (EQUIVALENT)
     - `~` (NOT)

2. Select the graph type (BDD or ROBDD)

3. Choose a variable ordering method:
   - **None**: Uses default ordering
   - **Custom**: Specify your own variable order (e.g., "c a b")
   - **Auto**: Uses automatic ordering algorithms

4. Click "Visualize" to generate the diagram

### Exploring the Visualization

- Use the play/pause button to automatically step through the construction
- Use previous/next buttons to navigate steps manually
- Read the explanation at the top of the canvas to understand each step
- The legend on the right explains the diagram elements:
  - Blue circles: Decision nodes
  - Green squares: Terminal nodes (1)
  - Red squares: Terminal nodes (0)
  - Solid lines: High branches (var=1)
  - Dashed lines: Low branches (var=0)

### Exporting Diagrams

- **PNG Export**: Captures the current canvas view as a PNG image
- **SVG Export**: Creates a scalable vector graphic of the diagram
- **TikZ Export**: Generates LaTeX code for including in academic papers

### Graphviz-Accurate Layout

- The canvas now uses the same node positions and edge splines as the LaTeX/TikZ export.
- After you click "Visualize", the app fetches a Graphviz layout from the backend (`/api/export/layout`).
- The canvas renders using these coordinates (converted from Graphviz’s coordinate system), so nodes and edges align with the TikZ output.
- Use "Reset View" to fit the Graphviz layout to the canvas if you pan/zoom away.

## Troubleshooting

### Common Issues

- **Backend Connection Error**: Ensure the backend server is running on port 8000
- **Formula Parsing Error**: Check that your formula uses supported operators and valid syntax
- **Export Failures**: Make sure both frontend and backend are running properly

### Environment Configuration

The project uses a `.env.local` file to configure the connection between frontend and backend. By default, it assumes the backend is running at http://localhost:8000.

## Development Notes

- The backend uses FastAPI with a custom BDD implementation
- The frontend uses Next.js with React for the UI components
- The visualization is rendered using HTML Canvas
- Exports are handled through dedicated API endpoints

## License

This project is for educational purposes.

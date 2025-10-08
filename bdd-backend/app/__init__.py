from fastapi import FastAPI
from .api import routes_bdd, routes_export, routes_utils

def create_app() -> FastAPI:
    """App factory to create FastAPI instance."""
    app = FastAPI(
        title="BDD/ROBDD Engine API",
        description="Backend service for Boolean formula parsing, BDD/ROBDD generation, and LaTeX/TikZ export.",
        version="1.0.0"
    )

    # Register API routers
    app.include_router(routes_utils.router, prefix="/api/utils", tags=["Utils"])
    app.include_router(routes_bdd.router, prefix="/api/bdd", tags=["BDD/ROBDD"])
    app.include_router(routes_export.router, prefix="/api/export", tags=["Export"])

    return app
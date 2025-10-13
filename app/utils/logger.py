from loguru import logger
import sys

logger.remove()  
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
           "<level>{level: <4}</level> | "
           "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
           "<level>{message}</level>",
    colorize=True,
    backtrace=True,   
    diagnose=True     
)

def get_logger(name: str = "Default"):
    """Return a logger instance with a given name."""
    return logger.bind(context=name)
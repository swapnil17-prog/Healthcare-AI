import logging
import re

class SensitiveDataFilter(logging.Filter):
    """
    Filters sensitive data from log records 
    before they are written to log output.
    """
    
    SENSITIVE_PATTERNS = [
        # JWT tokens
        (r'Bearer [A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+', 
         'Bearer [REDACTED]'),
        # Passwords in request bodies
        (r'"password"\s*:\s*"[^"]*"', 
         '"password": "[REDACTED]"'),
        # Groq API key patterns
        (r'gsk_[A-Za-z0-9]+', 
         '[GROQ_KEY_REDACTED]'),
        # Mem0 API key patterns
        (r'm0-[A-Za-z0-9]+', 
         '[MEM0_KEY_REDACTED]'),
        # Email addresses (partial mask)
        (r'([a-zA-Z0-9._%+-]{2})[a-zA-Z0-9._%+-]+(@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', 
         r'\1***\2'),
        # Numeric health values in URLs
        (r'glucose=\d+', 'glucose=[REDACTED]'),
        (r'bmi=[\d.]+', 'bmi=[REDACTED]'),
    ]
    
    def filter(self, record):
        message = str(record.getMessage())
        for pattern, replacement in self.SENSITIVE_PATTERNS:
            message = re.sub(pattern, replacement, message)
        record.msg = message
        record.args = ()
        return True

def setup_logging():
    """Configure application logging with sensitive data filtering."""
    
    # Get root logger
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    
    # Clear existing handlers on the root logger to prevent duplicate handlers
    for h in logger.handlers[:]:
        logger.removeHandler(h)
    
    # Create handler
    handler = logging.StreamHandler()
    handler.setLevel(logging.INFO)
    
    # Add sensitive data filter
    handler.addFilter(SensitiveDataFilter())
    
    # Format: timestamp, level, message
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    handler.setFormatter(formatter)
    
    # Apply to root logger
    logger.addHandler(handler)
    
    # Suppress uvicorn access log for sensitive routes
    uvicorn_access = logging.getLogger("uvicorn.access")
    uvicorn_access.addFilter(SensitiveDataFilter())
    
    return logger

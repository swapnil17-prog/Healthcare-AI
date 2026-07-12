import bleach
import re

def sanitize_text(text: str, max_length: int = None) -> str:
    """
    Strip all HTML tags and dangerous content 
    from free text input.
    """
    if not text:
        return text
    
    # Strip all HTML tags completely
    cleaned = bleach.clean(
        text, 
        tags=[],        # no HTML tags allowed
        attributes={},  # no attributes allowed
        strip=True      # strip tags instead of escaping
    )
    
    # Remove null bytes
    cleaned = cleaned.replace("\x00", "")
    
    # Normalize whitespace
    cleaned = " ".join(cleaned.split())
    
    # Apply max length if specified
    if max_length and len(cleaned) > max_length:
        cleaned = cleaned[:max_length]
    
    return cleaned.strip()

def sanitize_chat_message(text: str) -> str:
    """
    Sanitize chat messages — slightly more 
    permissive (allows basic punctuation) 
    but still strips all HTML.
    """
    return sanitize_text(text, max_length=2000)

def sanitize_name(text: str) -> str:
    """Sanitize name fields."""
    return sanitize_text(text, max_length=100)

def sanitize_notes(text: str) -> str:
    """Sanitize medical notes and comments."""
    return sanitize_text(text, max_length=1000)

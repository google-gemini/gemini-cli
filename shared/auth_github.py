import hmac
import hashlib

def verify_github_signature(payload_body: bytes, signature_header: str, secret: bytes) -> bool:
    """Verify that the payload was sent from GitHub using HMAC SHA256."""
    if not signature_header:
        return False
        
    hash_object = hmac.new(secret, msg=payload_body, digestmod=hashlib.sha256)
    expected_signature = "sha256=" + hash_object.hexdigest()
    
    return hmac.compare_digest(expected_signature, signature_header)

"""Evidence signatures: AWS KMS asymmetric ``Sign`` / ``Verify`` over a SHA-256 digest.

Live, the key is the stack's RSA_2048 SIGN_VERIFY key (``KMS_KEY_ID``) and the algorithm is
``RSASSA_PKCS1_V1_5_SHA_256``: KMS signs the 32-byte digest (``MessageType=DIGEST``) and the
private half never leaves KMS. DEMO_MODE has no KMS, so it signs with an HMAC-SHA256 under a fixed
local key and says so in the key id (``demo-local-hmac``): same shapes, never mistakable for a
real signature.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
from typing import Any

from common.demo_mode import is_demo

ALGORITHM = "RSASSA_PKCS1_V1_5_SHA_256"
DEMO_KEY_ID = "demo-local-hmac"
# demo-only HMAC key: it signs nothing real, and the key id says so
_DEMO_SECRET = b"recallindia-demo-evidence-key"  # pragma: allowlist secret


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _kms() -> Any:
    import boto3  # lazy: demo mode must not need boto3 credentials

    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-south-1"
    return boto3.client("kms", region_name=region)


def key_id() -> str:
    return DEMO_KEY_ID if is_demo() else str(os.environ.get("KMS_KEY_ID") or "")


def sign_digest(digest: bytes) -> tuple[str, str]:
    """``(signature_b64, key_id)`` for a SHA-256 digest. Live errors propagate to the caller."""
    if is_demo():
        mac = hmac.new(_DEMO_SECRET, digest, hashlib.sha256).digest()
        return base64.b64encode(mac).decode("ascii"), DEMO_KEY_ID
    kid = key_id()
    if not kid:
        raise RuntimeError("KMS_KEY_ID is not set")
    resp = _kms().sign(KeyId=kid, Message=digest, MessageType="DIGEST", SigningAlgorithm=ALGORITHM)
    # KMS answers with the key's ARN: keep that (a key id alone is ambiguous across accounts)
    return base64.b64encode(resp["Signature"]).decode("ascii"), str(resp.get("KeyId") or kid)


def verify_digest(digest: bytes, signature_b64: str, kid: str) -> bool:
    """True when ``signature_b64`` is a valid signature of ``digest`` under ``kid``.

    An invalid signature is ``False``, not an exception (KMS raises
    ``KMSInvalidSignatureException`` for it); any other KMS error propagates.
    """
    try:
        signature = base64.b64decode(signature_b64, validate=True)
    except (ValueError, TypeError):
        return False
    if kid == DEMO_KEY_ID:
        expected = hmac.new(_DEMO_SECRET, digest, hashlib.sha256).digest()
        return hmac.compare_digest(signature, expected)
    try:
        resp = _kms().verify(
            KeyId=kid,
            Message=digest,
            MessageType="DIGEST",
            Signature=signature,
            SigningAlgorithm=ALGORITHM,
        )
    except Exception as exc:
        if type(exc).__name__ == "KMSInvalidSignatureException" or "KMSInvalidSignature" in str(
            exc
        ):
            return False
        raise
    return bool(resp.get("SignatureValid"))

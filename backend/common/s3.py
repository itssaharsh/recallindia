"""S3 access for the raw / evidence / claims buckets.

Demo mode stores objects as files under ``DEMO_STORE_DIR/s3/<bucket>/<key>`` and returns
``file://`` URLs instead of presigned ones; live mode uses a lazily created boto3 client.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Literal

from common.demo_mode import demo_store_dir, is_demo

BucketKind = Literal["raw", "evidence", "claims"]


def bucket_name(kind: BucketKind) -> str:
    """Bucket from ``RAW_BUCKET`` / ``EVIDENCE_BUCKET`` / ``CLAIMS_BUCKET``."""
    return os.environ.get(f"{kind.upper()}_BUCKET") or f"recallindia-{kind}"


def _local_path(kind: BucketKind, key: str) -> Path:
    return demo_store_dir() / "s3" / bucket_name(kind) / key.lstrip("/")


def _client() -> Any:
    import boto3  # lazy: demo mode must not need boto3 credentials

    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-south-1"
    return boto3.client("s3", region_name=region)


def put_bytes(
    kind: BucketKind, key: str, data: bytes, content_type: str = "application/octet-stream"
) -> str:
    """Write ``data`` at ``key`` and return the key."""
    if is_demo():
        path = _local_path(kind, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return key
    _client().put_object(Bucket=bucket_name(kind), Key=key, Body=data, ContentType=content_type)
    return key


def get_bytes(kind: BucketKind, key: str) -> bytes:
    """Read the object at ``key``."""
    if is_demo():
        return _local_path(kind, key).read_bytes()
    return _client().get_object(Bucket=bucket_name(kind), Key=key)["Body"].read()


def presigned_url(kind: BucketKind, key: str, expires: int = 900) -> str:
    """Time-limited GET URL for ``key`` (``file://<abs path>`` in demo mode)."""
    if is_demo():
        return _local_path(kind, key).resolve().as_uri()
    return _client().generate_presigned_url(
        "get_object", Params={"Bucket": bucket_name(kind), "Key": key}, ExpiresIn=expires
    )

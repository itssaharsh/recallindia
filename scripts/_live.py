"""Point ``common.*`` at the deployed stack (shared by seed_demo.py and validate.py)."""

from __future__ import annotations

import os

OUTPUT_ENV = {
    "NoticesTableName": "NOTICES_TABLE",
    "ItemsTableName": "ITEMS_TABLE",
    "CasesTableName": "CASES_TABLE",
    # a script that seals evidence or writes a letter needs the buckets and the signing key
    "RawBucketName": "RAW_BUCKET",
    "EvidenceBucketName": "EVIDENCE_BUCKET",
    "ClaimsBucketName": "CLAIMS_BUCKET",
    "SigningKeyId": "KMS_KEY_ID",
    # a script that runs the matcher itself (seed_demo --reset) starts executions on it
    "MatchStateMachineArn": "MATCH_STATE_MACHINE_ARN",
}


class SetupError(RuntimeError):
    """The live stack could not be resolved; nothing was read or written."""


def configure_live(stack: str, profile: str, region: str = "ap-south-1") -> dict[str, str]:
    """Set DEMO_MODE=0, the AWS profile/region and the table names from the stack outputs."""
    os.environ["DEMO_MODE"] = "0"
    os.environ["AWS_PROFILE"] = profile
    os.environ.setdefault("AWS_REGION", region)
    os.environ.setdefault("AWS_DEFAULT_REGION", os.environ["AWS_REGION"])
    try:
        import boto3

        resp = boto3.client("cloudformation").describe_stacks(StackName=stack)
    except Exception as exc:
        raise SetupError(
            f"cannot describe stack {stack!r} with profile {profile!r}: {exc}"
        ) from exc
    outputs = {o["OutputKey"]: o["OutputValue"] for o in resp["Stacks"][0].get("Outputs", [])}
    missing = [k for k in (*OUTPUT_ENV, "ApiUrl") if not outputs.get(k)]
    if missing:
        raise SetupError(f"stack {stack!r} has no output(s): {', '.join(missing)}")
    for key, env in OUTPUT_ENV.items():
        if outputs.get(key):
            os.environ[env] = outputs[key]
    os.environ.setdefault("KMS_KEY_ALIAS", "alias/recallindia-signing")
    return outputs

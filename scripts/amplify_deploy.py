"""Create or update the Amplify Hosting app for ``app/`` and deploy ``app/out`` (P06).

The app is a static export, so hosting is Amplify's static (``WEB``) platform with manual
deployments: no Git connection, a deploy is a zip of ``app/out`` uploaded to the URL that
``create_deployment`` returns, then ``start_deployment``.

    python scripts/amplify_deploy.py --origin            # ensure app + branch; print the origin
    python scripts/amplify_deploy.py --api-url URL       # zip app/out, deploy, wait, print URL

``--origin`` exists for the first deploy's chicken-and-egg: the API's CORS list (template
``AppOrigins``) needs the Amplify origin before the app that calls the API is built.
"""

from __future__ import annotations

import argparse
import io
import sys
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "app" / "out"
APP_NAME = "recallindia"
BRANCH = "main"
WAIT_SECONDS = 600
RUNNING = {"PENDING", "PROVISIONING", "RUNNING", "CANCELLING"}

# order matters: Amplify applies the first rule that matches.
RULES = [
    # /case/<id> is served by the one exported /case/ page, which reads the id from the path
    # (dots excluded so /case/index.txt, the page's RSC payload, is served as itself)
    {"source": r"</^\/case\/[^\/.]+\/?$/>", "target": "/case/index.html", "status": "200"},
    # anything else that is not a file: the designed 404 page, with a real 404 status
    {"source": "/<*>", "target": "/404.html", "status": "404"},
]


def client(profile: str, region: str):
    import boto3

    return boto3.Session(profile_name=profile, region_name=region).client("amplify")


def find_app(amplify, name: str) -> dict | None:
    token = None
    while True:
        page = amplify.list_apps(maxResults=100, **({"nextToken": token} if token else {}))
        for app in page.get("apps", []):
            if app["name"] == name:
                return app
        token = page.get("nextToken")
        if not token:
            return None


def ensure_app(amplify, name: str, env: dict[str, str]) -> dict:
    app = find_app(amplify, name)
    if app is None:
        app = amplify.create_app(
            name=name,
            description="RecallIndia: static export of app/ (Next.js), manual deploys",
            platform="WEB",
            customRules=RULES,
            environmentVariables=env,
        )["app"]
        print(f"created Amplify app {name} ({app['appId']})", file=sys.stderr)
        return app
    update = {"customRules": RULES}
    if env:
        update["environmentVariables"] = {**(app.get("environmentVariables") or {}), **env}
    return amplify.update_app(appId=app["appId"], **update)["app"]


def ensure_branch(amplify, app_id: str, branch: str, env: dict[str, str]) -> None:
    try:
        current = amplify.get_branch(appId=app_id, branchName=branch)["branch"]
    except amplify.exceptions.NotFoundException:
        amplify.create_branch(
            appId=app_id, branchName=branch, stage="PRODUCTION", environmentVariables=env
        )
        print(f"created branch {branch}", file=sys.stderr)
        return
    if env:
        merged = {**(current.get("environmentVariables") or {}), **env}
        amplify.update_branch(appId=app_id, branchName=branch, environmentVariables=merged)


def zip_dir(folder: Path) -> bytes:
    if not (folder / "index.html").is_file():
        raise SystemExit(f"{folder} has no index.html: run `make app-build` first")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(folder.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(folder).as_posix())
    return buffer.getvalue()


def upload(url: str, data: bytes) -> None:
    request = urllib.request.Request(
        url, data=data, method="PUT", headers={"Content-Type": "application/zip"}
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as resp:
            if resp.status >= 300:
                raise SystemExit(f"zip upload -> HTTP {resp.status}")
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"zip upload -> HTTP {exc.code}: {exc.read()[:300]!r}") from None


def deploy(amplify, app_id: str, branch: str, folder: Path) -> str:
    data = zip_dir(folder)
    job = amplify.create_deployment(appId=app_id, branchName=branch)
    upload(job["zipUploadUrl"], data)
    amplify.start_deployment(appId=app_id, branchName=branch, jobId=job["jobId"])
    print(f"deploying {len(data) / 1024:.0f} KiB as job {job['jobId']}", file=sys.stderr)
    deadline = time.monotonic() + WAIT_SECONDS
    while True:
        status = amplify.get_job(appId=app_id, branchName=branch, jobId=job["jobId"])["job"][
            "summary"
        ]["status"]
        if status not in RUNNING:
            break
        if time.monotonic() > deadline:
            raise SystemExit(f"job {job['jobId']} still {status} after {WAIT_SECONDS}s")
        time.sleep(4)
    if status != "SUCCEED":
        raise SystemExit(f"deployment job {job['jobId']} ended {status}")
    return status


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--origin", action="store_true", help="ensure app + branch, print origin")
    parser.add_argument("--api-url", help="NEXT_PUBLIC_API_URL the build used (stored on the app)")
    parser.add_argument("--profile", default="firstcommit")
    parser.add_argument("--region", default="ap-south-1")
    parser.add_argument("--app-name", default=APP_NAME)
    parser.add_argument("--branch", default=BRANCH)
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args(argv)

    amplify = client(args.profile, args.region)
    env = {"NEXT_PUBLIC_API_URL": args.api_url} if args.api_url else {}
    app = ensure_app(amplify, args.app_name, env)
    ensure_branch(amplify, app["appId"], args.branch, env)
    origin = f"https://{args.branch}.{app['defaultDomain']}"
    if args.origin:
        print(origin)
        return 0
    deploy(amplify, app["appId"], args.branch, args.out)
    print(origin)
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""backend/statemachine/ingest.asl.json is a real, closed state graph wired to template.yaml."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
ASL_PATH = ROOT / "backend" / "statemachine" / "ingest.asl.json"
TEMPLATE_PATH = ROOT / "template.yaml"
TERMINAL = {"Succeed", "Fail"}


class _CfnLoader(yaml.SafeLoader):
    """SafeLoader that tolerates the CloudFormation short-form tags (!Ref, !Sub, !GetAtt...)."""


def _cfn_tag(loader: yaml.Loader, suffix: str, node: yaml.Node):
    if isinstance(node, yaml.ScalarNode):
        return {suffix: loader.construct_scalar(node)}
    if isinstance(node, yaml.SequenceNode):
        return {suffix: loader.construct_sequence(node)}
    return {suffix: loader.construct_mapping(node)}


_CfnLoader.add_multi_constructor("!", _cfn_tag)


@pytest.fixture(scope="module")
def asl() -> dict:
    return json.loads(ASL_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def template() -> dict:
    return yaml.load(TEMPLATE_PATH.read_text(encoding="utf-8"), Loader=_CfnLoader)


def _next_targets(state: dict) -> set[str]:
    out: set[str] = set()
    if "Next" in state:
        out.add(state["Next"])
    if "Default" in state:
        out.add(state["Default"])
    for choice in state.get("Choices", []):
        out.add(choice["Next"])
    for catch in state.get("Catch", []):
        out.add(catch["Next"])
    return out


def test_starts_at_init_and_init_stamps_the_execution(asl) -> None:
    assert asl["StartAt"] == "Init"
    init = asl["States"]["Init"]
    assert init["Type"] == "Pass" and init["ResultPath"] == "$.run"
    assert init["Parameters"]["execution_arn.$"] == "$$.Execution.Id"
    assert init["Parameters"]["execution_name.$"] == "$$.Execution.Name"
    assert init["Parameters"]["started_at.$"] == "$$.Execution.StartTime"
    assert init["Next"] == "Fetch"


def test_every_next_target_exists_and_every_state_is_reachable(asl) -> None:
    states = asl["States"]
    for name, state in states.items():
        for target in _next_targets(state):
            assert target in states, f"{name} -> {target} does not exist"
        if state["Type"] not in TERMINAL:
            assert _next_targets(state), f"{name} has no Next/Default"
        else:
            assert "Next" not in state
    reachable, todo = set(), [asl["StartAt"]]
    while todo:
        name = todo.pop()
        if name in reachable:
            continue
        reachable.add(name)
        todo.extend(_next_targets(states[name]))
    assert reachable == set(states)


def test_pipeline_order_and_result_paths(asl) -> None:
    s = asl["States"]
    assert s["Fetch"]["Next"] == "FetchOk" and s["Fetch"]["ResultPath"] == "$.fetch"
    assert s["Extract"]["Next"] == "ExtractOk" and s["Extract"]["ResultPath"] == "$.extract"
    assert s["Normalise"]["Next"] == "NormaliseOk"
    assert s["Normalise"]["ResultPath"] == "$.normalise"
    assert s["Diff"]["Next"] == "DiffOk" and s["Diff"]["ResultPath"] == "$.diff"
    assert s["Publish"]["Next"] == "Published" and s["Publish"]["ResultPath"] == "$.publish"
    assert s["RecordFailure"]["ResultPath"] == "$.publish"
    assert s["Done"]["Type"] == "Succeed"
    assert s["Failed"]["Type"] == "Fail" and s["Failed"]["Error"] == "IngestPipelineFailed"
    assert s["Fetch"]["TimeoutSeconds"] == 300
    assert s["Extract"]["TimeoutSeconds"] == 330 and s["Normalise"]["TimeoutSeconds"] == 330
    for name in ("Fetch", "Extract", "Normalise", "Diff", "Publish", "RecordFailure"):
        assert s[name]["Type"] == "Task"
        assert "Parameters" not in s[name], f"{name}: the whole state is the input"
        assert "InputPath" not in s[name]


def _degraded_branch(choice: dict, step: str) -> dict:
    """The branch of ``choice`` that tests ``$.<step>.degraded == true``."""
    for branch in choice["Choices"]:
        conditions = branch.get("And", [branch])
        if {"Variable": f"$.{step}.degraded", "BooleanEquals": True} in conditions:
            assert {"Variable": f"$.{step}.degraded", "IsPresent": True} in conditions
            return branch
    raise AssertionError(f"no $.{step}.degraded branch in {choice}")


def test_fetch_ok_routes_degraded_to_record_failure_and_portal_to_normalise(asl) -> None:
    choice = asl["States"]["FetchOk"]
    assert choice["Type"] == "Choice" and choice["Default"] == "Extract"
    assert _degraded_branch(choice, "fetch")["Next"] == "RecordFailure"
    # the degraded test comes first so a degraded portal fetch never reaches Normalise
    assert choice["Choices"][0] is _degraded_branch(choice, "fetch")
    portal = [
        b
        for b in choice["Choices"]
        if {"Variable": "$.fetch.adapter", "StringEquals": "cdsco_portal"} in b.get("And", [b])
    ]
    assert len(portal) == 1 and portal[0]["Next"] == "Normalise"


def test_every_step_result_is_checked_for_degraded_before_the_next_task(asl) -> None:
    """Handlers never raise, so the Catch alone cannot stop the run: a Choice must."""
    s = asl["States"]
    for step, choice_name, next_state in (
        ("extract", "ExtractOk", "Normalise"),
        ("normalise", "NormaliseOk", "Diff"),
        ("diff", "DiffOk", "Publish"),
    ):
        choice = s[choice_name]
        assert choice["Type"] == "Choice" and choice["Default"] == next_state, choice_name
        [branch] = choice["Choices"]
        assert branch is _degraded_branch(choice, step)
        assert branch["Next"] == "RecordFailure"
    published = s["Published"]
    assert published["Type"] == "Choice" and published["Default"] == "Failed"
    [branch] = published["Choices"]
    assert branch["Next"] == "Done"
    assert {"Variable": "$.publish.published", "BooleanEquals": True} in branch["And"]
    # a degraded Fetch therefore ends in Failed, never in Done
    reachable_from_fetch_degraded = {s["FetchOk"]["Choices"][0]["Next"]}
    assert reachable_from_fetch_degraded == {"RecordFailure"}
    assert s["RecordFailure"]["Next"] == "Failed"


def test_every_task_catches_to_record_failure_and_retries(asl) -> None:
    for name, state in asl["States"].items():
        if state["Type"] != "Task":
            continue
        [catch] = state["Catch"]
        assert catch["ErrorEquals"] == ["States.ALL"]
        if name == "RecordFailure":
            assert catch["Next"] == "Failed" and state["Next"] == "Failed"
            assert catch["ResultPath"] != "$.publish"
        else:
            assert catch["Next"] == "RecordFailure", name
            assert catch["ResultPath"] == "$.error", name
        [retry] = state["Retry"]
        assert retry["ErrorEquals"] == ["States.ALL"]
        assert retry["IntervalSeconds"] == 2 and retry["BackoffRate"] == 2
        # MaxAttempts counts retries after the first attempt: 0 is one attempt (Extract and
        # Normalise are long Textract / Bedrock runs), 2 is three attempts.
        expected_attempts = 0 if name in ("Extract", "Normalise") else 2
        assert retry["MaxAttempts"] == expected_attempts, name
        assert state.get("Comment"), f"{name} needs a Comment stating its contract"
    for name, state in asl["States"].items():
        if state["Type"] in ("Choice", "Pass", "Succeed"):
            assert state.get("Comment"), f"{name} needs a Comment stating its contract"


def test_task_resources_match_template_substitutions(asl, template) -> None:
    sm = template["Resources"]["IngestStateMachine"]["Properties"]
    assert sm["DefinitionUri"] == "backend/statemachine/ingest.asl.json"
    subs = sm["DefinitionSubstitutions"]
    used: set[str] = set()
    for name, state in asl["States"].items():
        if state["Type"] != "Task":
            continue
        m = re.fullmatch(r"\$\{(\w+)\}", state["Resource"])
        assert m, f"{name}: Resource must be a ${{Substitution}}"
        assert m.group(1) in subs, f"{name}: {m.group(1)} missing from DefinitionSubstitutions"
        used.add(m.group(1))
    assert used == set(subs), "every substitution is used exactly by the ASL"
    assert used == {
        "CdscoFetchFunctionArn",
        "CdscoExtractFunctionArn",
        "CdscoNormaliseFunctionArn",
        "CdscoDiffFunctionArn",
        "CdscoPublishFunctionArn",
    }
    # each substituted function exists, is invocable by the state machine, and is a cdsco_* handler
    invocable = {p["LambdaInvokePolicy"]["FunctionName"]["Ref"] for p in sm["Policies"]}
    for key, ref in subs.items():
        fn_name = (
            ref["GetAtt"].split(".")[0] if isinstance(ref["GetAtt"], str) else ref["GetAtt"][0]
        )
        assert key == f"{fn_name}Arn"
        fn = template["Resources"][fn_name]
        assert fn["Type"] == "AWS::Serverless::Function"
        assert fn["Properties"]["CodeUri"] == "backend/ingest/"
        assert fn["Properties"]["Handler"].startswith("cdsco_")
        assert fn_name in invocable
    assert template["Resources"]["CdscoDiffFunction"]["Properties"]["Handler"] == (
        "cdsco_publish.diff_handler"
    )
    assert template["Resources"]["CdscoPublishFunction"]["Properties"]["Handler"] == (
        "cdsco_publish.handler"
    )


def test_ingest_functions_can_write_run_records(template) -> None:
    for name in (
        "CdscoFetchFunction",
        "CdscoExtractFunction",
        "CdscoNormaliseFunction",
        "CdscoDiffFunction",
        "CdscoPublishFunction",
    ):
        policies = template["Resources"][name]["Properties"]["Policies"]
        crud = [p for p in policies if isinstance(p, dict) and "DynamoDBCrudPolicy" in p]
        assert any(p["DynamoDBCrudPolicy"]["TableName"] == {"Ref": "NoticesTable"} for p in crud), (
            name
        )


def test_notices_table_has_exactly_one_new_source_gsi(template) -> None:
    props = template["Resources"]["NoticesTable"]["Properties"]
    attrs = {a["AttributeName"]: a["AttributeType"] for a in props["AttributeDefinitions"]}
    assert attrs == {"pk": "S", "brand_lc": "S", "source": "S", "published_at": "S"}
    gsis = {g["IndexName"]: g for g in props["GlobalSecondaryIndexes"]}
    assert set(gsis) == {"brand_lc-index", "source-published_at-index"}
    src = gsis["source-published_at-index"]
    assert src["KeySchema"] == [
        {"AttributeName": "source", "KeyType": "HASH"},
        {"AttributeName": "published_at", "KeyType": "RANGE"},
    ]
    assert src["Projection"] == {"ProjectionType": "ALL"}
    assert gsis["brand_lc-index"]["KeySchema"] == [{"AttributeName": "brand_lc", "KeyType": "HASH"}]
    from common.dynamo import SOURCE_INDEX

    assert SOURCE_INDEX == "source-published_at-index"


def test_raw_bucket_allows_the_browser_to_load_presigned_pdfs(template) -> None:
    """GET /ingest/pdf hands the browser a presigned S3 URL; pdf.js fetches it cross-origin
    with Range requests, which S3 only answers with CORS rules on the bucket. P06 adds PUT: the
    Scan strip tab uploads the photo straight to the bucket through a presigned PUT. Origins are
    the app's (AppOrigins), not '*'."""
    props = template["Resources"]["RawBucket"]["Properties"]
    [rule] = props["CorsConfiguration"]["CorsRules"]
    assert set(rule["AllowedMethods"]) == {"GET", "HEAD", "PUT"}
    assert rule["AllowedOrigins"] == {"Ref": "AppOrigins"} and rule["AllowedHeaders"] == ["*"]
    assert {"Content-Range", "Accept-Ranges", "Content-Length"} <= set(rule["ExposedHeaders"])
    assert rule["MaxAge"] > 0
    assert props["PublicAccessBlockConfiguration"]["BlockPublicPolicy"] is True  # still private


def test_api_function_routes_and_step_functions_permissions(template) -> None:
    api = template["Resources"]["ApiFunction"]["Properties"]
    routes = {
        (e["Properties"]["Method"], e["Properties"]["Path"])
        for e in api["Events"].values()
        if e["Type"] == "HttpApi"
    }
    for route in (
        ("GET", "/health"),
        ("GET", "/v1/notices"),
        ("GET", "/v1/notices/{id}"),
        ("GET", "/v1/diff"),
        ("POST", "/items"),
        ("GET", "/items"),
        ("POST", "/items/{id}/check"),
        ("GET", "/cases/{id}"),
        ("POST", "/cases/{id}/approve"),
        ("POST", "/cases/{id}/reject"),
        ("GET", "/cases/{id}/verify-evidence"),
        ("POST", "/ingest/run"),
        ("GET", "/ingest/status/{arn}"),
        ("GET", "/ingest/rows"),
        ("GET", "/ingest/pdf"),
        ("GET", "/v1/stats"),
        ("POST", "/uploads"),
        ("POST", "/items/ocr"),
        ("POST", "/items/normalise"),
        ("GET", "/items/{id}/check-status"),
    ):
        assert route in routes, route
    cors = template["Resources"]["HttpApi"]["Properties"]["CorsConfiguration"]
    assert cors["AllowOrigins"] == {"Ref": "AppOrigins"}  # the app + localhost, not '*'
    assert api["Events"]["IngestRows"]["Properties"]["Path"] == "/ingest/rows"
    assert api["Events"]["IngestPdf"]["Properties"]["Path"] == "/ingest/pdf"
    statements = [
        st
        for p in api["Policies"]
        if isinstance(p, dict) and "Statement" in p
        for st in p["Statement"]
    ]
    actions = {a for st in statements for a in st["Action"]}
    assert {
        "states:StartExecution",
        "states:DescribeExecution",
        "states:GetExecutionHistory",
        "states:ListExecutions",
        "textract:DetectDocumentText",
        "comprehend:BatchDetectEntities",
    } <= actions
    assert template["Outputs"]["IngestStateMachineArn"]["Value"] == {"Ref": "IngestStateMachine"}
    assert "ApiUrl" in template["Outputs"]

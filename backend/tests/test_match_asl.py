"""backend/statemachine/match.asl.json is a real, closed state graph wired to template.yaml."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
ASL_PATH = ROOT / "backend" / "statemachine" / "match.asl.json"
TEMPLATE_PATH = ROOT / "template.yaml"
TERMINAL = {"Succeed", "Fail"}
TASK_SUBS = {
    "CandidatesFunctionArn",
    "VerifyFunctionArn",
    "RangeCheckFunctionArn",
    "DecideFunctionArn",
    "NotifyFunctionArn",
    "ApprovalFunctionArn",
    "ClaimFunctionArn",
    "EvidenceFunctionArn",
}
WAIT_FOR_TOKEN = "arn:aws:states:::lambda:invoke.waitForTaskToken"
HANDLERS = {
    "ApprovalFunction": "approval.handler",
    "CandidatesFunction": "candidates.handler",
    "VerifyFunction": "verify.handler",
    "RangeCheckFunction": "range_check.handler",
    "DecideFunction": "decide.handler",
    "NotifyFunction": "notify.handler",
    "ClaimFunction": "claim.handler",
    "EvidenceFunction": "evidence.handler",
}


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


@pytest.fixture(scope="module")
def iterator(asl) -> dict:
    return asl["States"]["VerifyEach"]["Iterator"]


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


def _assert_closed_graph(graph: dict) -> None:
    """Every Next/Default/Choice/Catch target exists in ``graph`` and every state is reachable."""
    states = graph["States"]
    for name, state in states.items():
        for target in _next_targets(state):
            assert target in states, f"{name} -> {target} does not exist"
        if state["Type"] in TERMINAL or state.get("End") is True:
            assert "Next" not in state, name
        else:
            assert _next_targets(state), f"{name} has no Next/Default"
    reachable, todo = set(), [graph["StartAt"]]
    while todo:
        name = todo.pop()
        if name in reachable:
            continue
        reachable.add(name)
        todo.extend(_next_targets(states[name]))
    assert reachable == set(states)


def _all_states(asl: dict) -> dict[str, dict]:
    """Top-level states plus the Map iterator's, keyed ``VerifyEach/<name>``."""
    out = dict(asl["States"])
    for name, state in asl["States"].items():
        if state["Type"] == "Map":
            for inner, inner_state in state["Iterator"]["States"].items():
                out[f"{name}/{inner}"] = inner_state
    return out


def _condition(branch: dict, variable: str, op: str):
    """The value of ``op`` on ``variable`` in a Choice branch (plain or inside an And)."""
    for cond in branch.get("And", [branch]):
        if cond.get("Variable") == variable and op in cond:
            return cond[op]
    raise AssertionError(f"no {op} on {variable} in {branch}")


# --- graph shape -----------------------------------------------------------------


def test_starts_at_init_and_init_stamps_the_execution(asl) -> None:
    assert asl["StartAt"] == "Init"
    init = asl["States"]["Init"]
    assert init["Type"] == "Pass" and init["ResultPath"] == "$.run"
    assert init["Parameters"]["execution_arn.$"] == "$$.Execution.Id"
    assert init["Parameters"]["execution_name.$"] == "$$.Execution.Name"
    assert init["Parameters"]["started_at.$"] == "$$.Execution.StartTime"
    assert init["Next"] == "Candidates"


def test_top_level_graph_is_closed_and_fully_reachable(asl) -> None:
    _assert_closed_graph(asl)


def test_map_iterator_is_a_closed_graph_with_one_end(iterator) -> None:
    _assert_closed_graph(iterator)
    assert iterator["StartAt"] == "Verify"
    ends = [name for name, s in iterator["States"].items() if s.get("End") is True]
    assert ends == ["PerCandidate"]
    assert not any(s["Type"] in TERMINAL for s in iterator["States"].values())
    # nothing inside the Map may point at a top-level state
    top = {"Init", "Candidates", "HasCandidates", "Decide", "Notify", "Done", "Failed"}
    for state in iterator["States"].values():
        assert not (_next_targets(state) & top)


def test_pipeline_order_and_result_paths(asl) -> None:
    s = asl["States"]
    assert s["Candidates"]["Type"] == "Task"
    assert s["Candidates"]["ResultPath"] == "$.candidates"
    assert s["Candidates"]["TimeoutSeconds"] == 90
    assert s["Candidates"]["Next"] == "HasCandidates"
    assert s["VerifyEach"]["Next"] == "Decide"
    assert s["Decide"]["Type"] == "Task" and s["Decide"]["ResultPath"] == "$.decide"
    assert s["Decide"]["Next"] == "Notify"
    assert s["Notify"]["Type"] == "Task" and s["Notify"]["ResultPath"] == "$.notify"
    assert s["Notify"]["Next"] == "IsAlert"
    assert s["WaitForApproval"]["Type"] == "Task" and s["WaitForApproval"]["Next"] == "Claim"
    assert s["WaitForApproval"]["ResultPath"] == "$.approval"
    assert s["Claim"]["Type"] == "Task" and s["Claim"]["Next"] == "Evidence"
    assert s["Claim"]["ResultPath"] == "$.claim"
    assert s["Evidence"]["Type"] == "Task" and s["Evidence"]["Next"] == "Done"
    assert s["Evidence"]["ResultPath"] == "$.evidence"
    for name in ("Claim", "Evidence"):
        assert s[name]["Parameters"]["case_id.$"] == "$.notify.case_id", name
    assert s["Done"]["Type"] == "Succeed"
    assert s["Failed"]["Type"] == "Fail" and s["Failed"]["Error"] == "MatchPipelineFailed"
    for name in ("Candidates", "Decide", "Notify"):
        assert "Parameters" not in s[name], f"{name}: the whole state is the input"
        assert "InputPath" not in s[name]


def test_has_candidates_routes_count_gt_0_to_the_map_else_decide(asl) -> None:
    choice = asl["States"]["HasCandidates"]
    assert choice["Type"] == "Choice" and choice["Default"] == "Decide"
    [branch] = choice["Choices"]
    assert branch["Next"] == "VerifyEach"
    assert _condition(branch, "$.candidates.count", "NumericGreaterThan") == 0
    assert _condition(branch, "$.candidates.count", "IsPresent") is True


def test_is_alert_routes_alert_to_wait_for_approval_else_done(asl) -> None:
    choice = asl["States"]["IsAlert"]
    assert choice["Type"] == "Choice" and choice["Default"] == "Done"
    [branch] = choice["Choices"]
    assert branch["Next"] == "WaitForApproval"
    assert _condition(branch, "$.decide.decision", "StringEquals") == "alert"
    assert _condition(branch, "$.decide.decision", "IsPresent") is True


# --- the Map ----------------------------------------------------------------------


def test_map_verifies_each_candidate_two_at_a_time(asl, iterator) -> None:
    m = asl["States"]["VerifyEach"]
    assert m["Type"] == "Map"
    assert m["ItemsPath"] == "$.candidates.candidates"
    assert m["MaxConcurrency"] == 2
    assert m["ResultPath"] == "$.verified"
    assert m["Parameters"] == {
        "candidate.$": "$$.Map.Item.Value",
        "item.$": "$.candidates.item",
        "run.$": "$.run",
    }
    assert set(iterator["States"]) == {
        "Verify",
        "VerifyUnavailable",
        "RangeCheck",
        "RangeUnavailable",
        "PerCandidate",
    }


def test_verify_retries_once_then_degrades_to_a_null_verdict(iterator) -> None:
    s = iterator["States"]
    verify = s["Verify"]
    assert verify["Type"] == "Task" and verify["Resource"] == "${VerifyFunctionArn}"
    assert verify["ResultPath"] == "$.verify" and verify["TimeoutSeconds"] == 120
    assert verify["Next"] == "RangeCheck"
    [retry] = verify["Retry"]
    assert retry["ErrorEquals"] == ["States.ALL"] and retry["MaxAttempts"] == 1
    [catch] = verify["Catch"]
    assert catch["ErrorEquals"] == ["States.ALL"] and catch["Next"] == "VerifyUnavailable"
    assert catch["ResultPath"] != "$.verify"  # the error must survive next to the verdict
    fallback = s["VerifyUnavailable"]
    assert fallback["Type"] == "Pass" and fallback["ResultPath"] == "$.verify"
    assert fallback["Next"] == "RangeCheck"
    assert fallback["Result"] == {
        "covers_item": None,
        "quoted_sentence": "",
        "confidence": 0,
        "reasoning": "verification unavailable",
        "verifier": "none",
        "degraded": True,
    }


def test_range_check_degrades_to_inside_null_and_per_candidate_shapes_the_output(iterator) -> None:
    s = iterator["States"]
    rc = s["RangeCheck"]
    assert rc["Type"] == "Task" and rc["Resource"] == "${RangeCheckFunctionArn}"
    assert rc["ResultPath"] == "$.range_check" and rc["Next"] == "PerCandidate"
    [retry] = rc["Retry"]
    assert retry["MaxAttempts"] == 2
    [catch] = rc["Catch"]
    assert catch["Next"] == "RangeUnavailable" and catch["ResultPath"] != "$.range_check"
    fallback = s["RangeUnavailable"]
    assert fallback["Type"] == "Pass" and fallback["ResultPath"] == "$.range_check"
    assert fallback["Next"] == "PerCandidate"
    assert fallback["Result"] == {
        "inside": None,
        "listed": "",
        "yours": "",
        "kind": "none",
        "degraded": True,
    }
    per = s["PerCandidate"]
    assert per["Type"] == "Pass" and per["End"] is True
    assert per["Parameters"] == {
        "candidate.$": "$.candidate",
        "verify.$": "$.verify",
        "range_check.$": "$.range_check",
    }


# --- failure routing ---------------------------------------------------------------


def test_candidates_and_decide_catch_to_hold_unavailable(asl) -> None:
    s = asl["States"]
    for name in ("Candidates", "Decide"):
        [catch] = s[name]["Catch"]
        assert catch["ErrorEquals"] == ["States.ALL"]
        assert catch["Next"] == "HoldUnavailable" and catch["ResultPath"] == "$.error", name
    hold = s["HoldUnavailable"]
    assert hold["Type"] == "Pass" and hold["ResultPath"] == "$.decide"
    assert hold["Next"] == "Notify"
    assert hold["Result"] == {
        "decision": "hold",
        "reason": "verification unavailable",
        "notice_pk": None,
        "quoted_sentence": "",
        "confidence": 0,
        "verifier": "none",
        "covers_item": None,
        "range_check": None,
        "candidates_considered": 0,
        "degraded": True,
    }
    # a hold from HoldUnavailable therefore never reaches the claim path
    assert hold["Result"]["decision"] != "alert"


def test_notify_catches_to_failed(asl) -> None:
    [catch] = asl["States"]["Notify"]["Catch"]
    assert catch["ErrorEquals"] == ["States.ALL"]
    assert catch["Next"] == "Failed" and catch["ResultPath"] == "$.error"
    assert asl["States"]["Failed"]["Type"] == "Fail"


def _function_sub(state: dict) -> str | None:
    """The ``${XFunctionArn}`` a Task runs: its Resource, or a task-token FunctionName."""
    ref = state["Resource"]
    if ref == WAIT_FOR_TOKEN:
        ref = state["Parameters"]["FunctionName"]
    m = re.fullmatch(r"\$\{(\w+)\}", ref)
    return m.group(1) if m else None


def test_wait_for_approval_is_a_single_task_token_gate(asl) -> None:
    s = asl["States"]
    wait = s["WaitForApproval"]
    assert wait["Resource"] == WAIT_FOR_TOKEN
    assert wait["TimeoutSeconds"] == 86400 and "HeartbeatSeconds" not in wait
    payload = wait["Parameters"]["Payload"]
    assert payload["task_token.$"] == "$$.Task.Token" and payload["action"] == "request"
    assert payload["case_id.$"] == "$.notify.case_id"
    # never retried on States.ALL: a retried rejection / timeout would reopen the wait
    for retry in wait["Retry"]:
        assert "States.ALL" not in retry["ErrorEquals"]
        assert all(e.startswith("Lambda.") for e in retry["ErrorEquals"])
    routes = [(c["ErrorEquals"], c["Next"]) for c in wait["Catch"]]
    assert routes == [
        (["States.Timeout"], "ExpireApproval"),
        (["Rejected"], "Rejected"),
        (["States.ALL"], "Failed"),
    ]
    assert s["ExpireApproval"]["Parameters"]["action"] == "expire"
    assert s["ExpireApproval"]["Next"] == "Expired" and s["Expired"]["Type"] == "Succeed"
    assert s["Rejected"]["Type"] == "Fail" and s["Rejected"]["Error"] == "Rejected"


def test_every_task_retries_with_backoff_and_every_state_has_a_comment(asl) -> None:
    for name, state in _all_states(asl).items():
        assert state.get("Comment"), f"{name} needs a Comment stating its contract"
        if state["Type"] != "Task":
            continue
        assert _function_sub(state), name
        if name == "WaitForApproval":  # its own rules: test_wait_for_approval_is_...
            continue
        [retry] = state["Retry"]
        assert retry["ErrorEquals"] == ["States.ALL"]
        assert retry["IntervalSeconds"] == 2 and retry["BackoffRate"] == 2
        # MaxAttempts counts retries after the first attempt: Verify gets one (a Bedrock round
        # trip is long), everything else two.
        expected = 1 if name.endswith("Verify") else 2
        assert retry["MaxAttempts"] == expected, name
        [catch] = state["Catch"]
        assert catch["ErrorEquals"] == ["States.ALL"]
        assert "TimeoutSeconds" in state, name


def test_handler_contracts_are_written_into_the_comments(asl) -> None:
    """Builders implement against the Comments; pin the key names the states exchange."""
    states = _all_states(asl)
    for key in ("candidates", "count", "sources_searched", "searched_at", "degraded"):
        assert key in states["Candidates"]["Comment"], key
    for key in ("covers_item", "quoted_sentence", "confidence", "reasoning", "verifier"):
        assert key in states["VerifyEach/Verify"]["Comment"], key
    for key in ("inside", "listed", "yours", "kind"):
        assert key in states["VerifyEach/RangeCheck"]["Comment"], key
    for key in ("$.candidates", "$.verified", "$.run", "candidates_considered", "clear"):
        assert key in states["Decide"]["Comment"], key
    for key in ("$.candidates.item", "$.decide", "$.run", "case_id", "event_id", "email"):
        assert key in states["Notify"]["Comment"], key


def test_wording_rules(asl) -> None:
    text = ASL_PATH.read_text(encoding="utf-8").lower()
    assert "recalled" not in text
    assert not re.search(r"\bsafe\b", text)
    assert "no match in n sources as of <time>" in text


# --- template wiring ----------------------------------------------------------------


def test_task_resources_match_template_substitutions(asl, template) -> None:
    sm = template["Resources"]["MatchStateMachine"]["Properties"]
    assert sm["DefinitionUri"] == "backend/statemachine/match.asl.json"
    assert sm["Type"] == "STANDARD"
    subs = sm["DefinitionSubstitutions"]
    used: set[str] = set()
    for name, state in _all_states(asl).items():
        if state["Type"] != "Task":
            continue
        key = _function_sub(state)
        assert key, f"{name}: Resource must be a ${{Substitution}} (or a task-token FunctionName)"
        assert key in subs, f"{name}: {key} missing from DefinitionSubstitutions"
        used.add(key)
    assert used == TASK_SUBS
    assert set(subs) == used
    invocable = {p["LambdaInvokePolicy"]["FunctionName"]["Ref"] for p in sm["Policies"]}
    for key, ref in subs.items():
        fn_name = (
            ref["GetAtt"].split(".")[0] if isinstance(ref["GetAtt"], str) else ref["GetAtt"][0]
        )
        assert key == f"{fn_name}Arn"
        fn = template["Resources"][fn_name]
        assert fn["Type"] == "AWS::Serverless::Function"
        assert fn["Properties"]["CodeUri"] == "backend/matcher/"
        assert fn["Properties"]["Handler"] == HANDLERS[fn_name]
        assert fn_name in invocable, fn_name


def test_decide_function_is_a_read_only_matcher_lambda(template) -> None:
    fn = template["Resources"]["DecideFunction"]["Properties"]
    assert fn["Handler"] == "decide.handler" and fn["CodeUri"] == "backend/matcher/"
    assert "recallindia-decide-" in fn["FunctionName"]["Sub"]
    reads = {
        p["DynamoDBReadPolicy"]["TableName"]["Ref"]
        for p in fn["Policies"]
        if isinstance(p, dict) and "DynamoDBReadPolicy" in p
    }
    assert reads == {"NoticesTable", "ItemsTable"}
    assert not any("DynamoDBCrudPolicy" in p for p in fn["Policies"] if isinstance(p, dict))
    assert template["Resources"]["VerifyFunction"]["Properties"]["Timeout"] == 120


def test_cases_table_has_the_rk_ts_gsi(template) -> None:
    props = template["Resources"]["CasesTable"]["Properties"]
    attrs = {a["AttributeName"]: a["AttributeType"] for a in props["AttributeDefinitions"]}
    assert attrs == {"pk": "S", "rk": "S", "ts": "S"}
    assert props["KeySchema"] == [{"AttributeName": "pk", "KeyType": "HASH"}]
    [gsi] = props["GlobalSecondaryIndexes"]
    assert gsi["IndexName"] == "rk-ts-index"
    assert gsi["KeySchema"] == [
        {"AttributeName": "rk", "KeyType": "HASH"},
        {"AttributeName": "ts", "KeyType": "RANGE"},
    ]
    assert gsi["Projection"] == {"ProjectionType": "ALL"}
    from common.dynamo import RK_INDEX

    assert RK_INDEX == "rk-ts-index"


def test_api_function_gains_item_get_and_events_and_keeps_every_route(template) -> None:
    api = template["Resources"]["ApiFunction"]["Properties"]
    events = {k: v for k, v in api["Events"].items() if v["Type"] == "HttpApi"}
    routes = {(e["Properties"]["Method"], e["Properties"]["Path"]) for e in events.values()}
    assert events["ItemGet"]["Properties"] == {
        "ApiId": {"Ref": "HttpApi"},
        "Method": "GET",
        "Path": "/items/{id}",
    }
    assert events["EventsList"]["Properties"] == {
        "ApiId": {"Ref": "HttpApi"},
        "Method": "GET",
        "Path": "/events",
    }
    for route in (
        ("GET", "/health"),
        ("GET", "/v1/notices"),
        ("GET", "/v1/notices/{id}"),
        ("GET", "/v1/diff"),
        ("POST", "/items"),
        ("GET", "/items"),
        ("GET", "/items/{id}"),
        ("POST", "/items/{id}/check"),
        ("GET", "/events"),
        ("GET", "/cases/{id}"),
        ("POST", "/cases/{id}/approve"),
        ("POST", "/cases/{id}/reject"),
        ("GET", "/cases/{id}/verify-evidence"),
        ("POST", "/ingest/run"),
        ("GET", "/ingest/status/{arn}"),
        ("GET", "/ingest/rows"),
        ("GET", "/ingest/pdf"),
    ):
        assert route in routes, route
    assert len(routes) == len(events), "one HttpApi event per route"
    # the API can start the match state machine and read the cases table (GSI included)
    crud = {
        p["DynamoDBCrudPolicy"]["TableName"]["Ref"]
        for p in api["Policies"]
        if isinstance(p, dict) and "DynamoDBCrudPolicy" in p
    }
    assert {"ItemsTable", "CasesTable", "NoticesTable"} <= crud
    assert api["Environment"]["Variables"]["MATCH_STATE_MACHINE_ARN"] == {
        "Ref": "MatchStateMachine"
    }

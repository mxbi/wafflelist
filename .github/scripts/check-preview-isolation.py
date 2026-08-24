#!/usr/bin/env python3
"""Guard the preview-deploy security model.

deploy-preview.yml runs unreviewed PR code in its `build` job. That job must
never be able to read repository secrets, otherwise a malicious PR could
exfiltrate the deploy SSH key. This check fails CI if that ever regresses, so
the invariant survives future edits to the workflow.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("pyyaml is required: pip install pyyaml")

WORKFLOW = Path(".github/workflows/deploy-preview.yml")


def main() -> int:
    doc = yaml.safe_load(WORKFLOW.read_text())
    errors: list[str] = []

    jobs = doc.get("jobs", {})
    build = jobs.get("build")
    if build is None:
        return fail([f"{WORKFLOW}: expected a `build` job"])

    # 1. The job that runs PR code must not reference any secret.
    if "secrets." in json.dumps(build):
        errors.append(
            "the `build` job references `secrets.*`. It checks out untrusted PR "
            "code, so any secret exposed there can be stolen. Move that step to "
            "the `deploy` job."
        )

    # 2. It must build the PR head, with credentials not persisted.
    checkout = next(
        (s for s in build.get("steps", []) if str(s.get("uses", "")).startswith("actions/checkout")),
        None,
    )
    if checkout is None:
        errors.append("the `build` job has no actions/checkout step")
    else:
        with_ = checkout.get("with", {})
        if with_.get("persist-credentials") is not False:
            errors.append(
                "the `build` job checkout must set `persist-credentials: false` so "
                "PR code cannot use the GITHUB_TOKEN"
            )
        if "pull_request.head.sha" not in str(with_.get("ref", "")):
            errors.append(
                "the `build` job must check out `github.event.pull_request.head.sha`"
            )

    # 3. Previews must stay label-gated, so only users with write access can
    #    trigger a deploy of unreviewed code.
    if "labels.*.name, 'preview'" not in str(build.get("if", "")):
        errors.append(
            "the `build` job must remain gated on the `preview` label"
        )

    # 4. The deploy job must not run PR code.
    deploy = jobs.get("deploy", {})
    if any(str(s.get("uses", "")).startswith("actions/checkout") for s in deploy.get("steps", [])):
        errors.append(
            "the `deploy` job holds secrets and must not check out PR code"
        )

    return fail(errors)


def fail(errors: list[str]) -> int:
    if not errors:
        print("preview isolation checks passed")
        return 0
    for err in errors:
        print(f"error: {err}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())

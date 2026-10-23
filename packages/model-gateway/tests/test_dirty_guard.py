"""Deployment dirty-tree guard: warns and asks (y/n) instead of failing.

The deploy must NOT blow up because the repo has uncommitted changes: it warns,
asks and continues only if the operator answers affirmatively. `--allow-dirty`
skips the warning and the question entirely.

Tests for `scripts/lib/dirty-guard.sh` (sourced by `scripts/deploy.sh`):
they need no root, no systemd, no network — only a temporary git repo.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
GUARD_PATH = PACKAGE_ROOT / "scripts" / "lib" / "dirty-guard.sh"
DEPLOY_SCRIPT = PACKAGE_ROOT / "scripts" / "deploy.sh"

pytestmark = pytest.mark.skipif(shutil.which("bash") is None, reason="requires bash")
pytestmark = pytest.mark.skipif(shutil.which("git") is None, reason="requires git")


@pytest.fixture(scope="module")
def guard() -> str:
    return GUARD_PATH.read_text()


def _git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
    )


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """Git repo with one commit; the worktree starts clean."""
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init", "-q")
    _git(repo, "config", "user.email", "test@example.com")
    _git(repo, "config", "user.name", "test")
    (repo / "config.yaml").write_text("model_list: []\n", encoding="utf-8")
    _git(repo, "add", "config.yaml")
    _git(repo, "commit", "-qm", "init")
    return repo


def _run_guard(repo: Path, allow_dirty: int, stdin: str = "") -> subprocess.CompletedProcess:
    """Sources the guard and invokes it; returns the result (rc, stdout, stderr)."""
    script = (
        f'source "{GUARD_PATH}"; '
        f'dirty_guard_confirm "{repo}" "packages/model-gateway" "{allow_dirty}"; '
        'rc=$?; echo "GUARD_RC=$rc DIRTY=$DIRTY_GUARD_DIRTY"'
    )
    return subprocess.run(
        ["bash", "-c", script],
        input=stdin,
        capture_output=True,
        text=True,
    )


def test_clean_tree_asks_nothing(repo: Path):
    res = _run_guard(repo, allow_dirty=0)
    assert res.returncode == 0
    assert res.stdout.strip() == "GUARD_RC=0 DIRTY=no"
    assert res.stderr == ""


def test_dirty_tree_warns_and_continues_on_yes(repo: Path):
    (repo / "config.yaml").write_text("model_list: [x]\n", encoding="utf-8")
    res = _run_guard(repo, allow_dirty=0, stdin="y\n")
    assert res.returncode == 0
    assert "GUARD_RC=0 DIRTY=yes" in res.stdout
    # It warns (lists the changes) and asks.
    assert "uncommitted changes" in res.stderr
    assert "config.yaml" in res.stderr
    assert "[y/N]" in res.stderr


@pytest.mark.parametrize("answer", ["y\n", "Y\n", "yes\n", "s\n", "si\n"])
def test_affirmative_answers_are_accepted(repo: Path, answer: str):
    (repo / "config.yaml").write_text("model_list: [x]\n", encoding="utf-8")
    res = _run_guard(repo, allow_dirty=0, stdin=answer)
    assert "GUARD_RC=0" in res.stdout


@pytest.mark.parametrize("answer", ["n\n", "no\n", "\n", "", "maybe\n"])
def test_negative_or_empty_answers_cancel(repo: Path, answer: str):
    (repo / "config.yaml").write_text("model_list: [x]\n", encoding="utf-8")
    res = _run_guard(repo, allow_dirty=0, stdin=answer)
    assert "GUARD_RC=1" in res.stdout
    # It warns anyway: the operator has to know why it is cancelled.
    assert "uncommitted changes" in res.stderr


def test_allow_dirty_does_not_notify_nor_ask(repo: Path):
    """With --allow-dirty neither the warning nor the question shows (only the stamp)."""
    (repo / "config.yaml").write_text("model_list: [x]\n", encoding="utf-8")
    res = _run_guard(repo, allow_dirty=1, stdin="")
    assert res.returncode == 0
    assert "GUARD_RC=0 DIRTY=yes" in res.stdout
    assert res.stderr == ""


def test_deploy_script_uses_the_guard_instead_of_failing():
    """The deploy must delegate to the guard: it neither aborts nor warns on its own."""
    script = DEPLOY_SCRIPT.read_text()
    assert 'source "$SCRIPT_DIR/lib/dirty-guard.sh"' in script
    assert "dirty_guard_confirm" in script
    assert "deploy cancelled" in script
    # The old message (aborting on a dirty tree) can no longer be there.
    assert "uncommitted changes in $PKG_REL; commit" not in script
    # The guard is sourced, not executed as a sub-script.
    assert "bash scripts/lib/dirty-guard.sh" not in script

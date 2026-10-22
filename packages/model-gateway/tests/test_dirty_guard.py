"""Guarda del árbol sucio del despliegue: avisa y pregunta (y/n) en vez de fallar.

El deploy NO debe reventar porque el repo tenga cambios sin commitear: avisa,
pregunta y sigue solo si el operador responde afirmativamente. `--allow-dirty`
salta el aviso y la pregunta por completo.

Tests sobre `scripts/lib/dirty-guard.sh` (sourceada por `scripts/deploy.sh`):
no necesitan root, ni systemd, ni red — solo un repo git temporal.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
GUARD_PATH = PACKAGE_ROOT / "scripts" / "lib" / "dirty-guard.sh"
DEPLOY_SCRIPT = PACKAGE_ROOT / "scripts" / "deploy.sh"

pytestmark = pytest.mark.skipif(shutil.which("bash") is None, reason="requiere bash")
pytestmark = pytest.mark.skipif(shutil.which("git") is None, reason="requiere git")


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
    """Repo git con un commit; el worktree empieza limpio."""
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
    """Sourcea la guarda y la invoca; devuelve el resultado (rc, stdout, stderr)."""
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
    # Avisa (lista los cambios) y pregunta.
    assert "cambios sin commitear" in res.stderr
    assert "config.yaml" in res.stderr
    assert "[y/N]" in res.stderr


@pytest.mark.parametrize("answer", ["y\n", "Y\n", "yes\n", "s\n", "si\n"])
def test_affirmative_answers_are_accepted(repo: Path, answer: str):
    (repo / "config.yaml").write_text("model_list: [x]\n", encoding="utf-8")
    res = _run_guard(repo, allow_dirty=0, stdin=answer)
    assert "GUARD_RC=0" in res.stdout


@pytest.mark.parametrize("answer", ["n\n", "no\n", "\n", "", "quiza\n"])
def test_negative_or_empty_answers_cancel(repo: Path, answer: str):
    (repo / "config.yaml").write_text("model_list: [x]\n", encoding="utf-8")
    res = _run_guard(repo, allow_dirty=0, stdin=answer)
    assert "GUARD_RC=1" in res.stdout
    # Avisa igualmente: el operador tiene que saber por qué se cancela.
    assert "cambios sin commitear" in res.stderr


def test_allow_dirty_does_not_notify_nor_ask(repo: Path):
    """Con --allow-dirty no sale ni el aviso ni la pregunta (solo el sello)."""
    (repo / "config.yaml").write_text("model_list: [x]\n", encoding="utf-8")
    res = _run_guard(repo, allow_dirty=1, stdin="")
    assert res.returncode == 0
    assert "GUARD_RC=0 DIRTY=yes" in res.stdout
    assert res.stderr == ""


def test_deploy_script_uses_the_guard_instead_of_failing():
    """El deploy debe delegar en la guarda: ni aborta ni avisa por su cuenta."""
    script = DEPLOY_SCRIPT.read_text()
    assert 'source "$SCRIPT_DIR/lib/dirty-guard.sh"' in script
    assert "dirty_guard_confirm" in script
    assert "despliegue cancelado" in script
    # El mensaje antiguo (abortar por árbol sucio) ya no puede estar.
    assert "hay cambios sin commitear en $PKG_REL; commitea" not in script
    # La guarda se sourcea, no se ejecuta como sub-script.
    assert "bash scripts/lib/dirty-guard.sh" not in script

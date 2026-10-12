"""U10: AGENTS.md is canonical, and ab-project-start merges into existing instruction files (KTD9).

Runs the skill's own scaffold script against temporary projects: an empty one,
one with a CLAUDE.md of its own, one with an AGENTS.md of its own, and a rerun.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

if __package__:
    from .gate_helpers import REPO, read, write
else:
    from gate_helpers import REPO, read, write

SKILL = os.path.join(REPO, "skills", "ab-project-start")
ASSETS = os.path.join(SKILL, "assets")
SCRIPT = os.path.join(SKILL, "scripts", "scaffold.py")
CAP = 200   # R15: instruction files that load every session stay short


class Templates(unittest.TestCase):
    def test_template_claude_md_is_exactly_the_import(self):
        self.assertEqual(read(os.path.join(ASSETS, "CLAUDE.md")), "@AGENTS.md\n")

    def test_both_agents_files_are_short_and_clean(self):
        for path in (os.path.join(REPO, "AGENTS.md"), os.path.join(ASSETS, "AGENTS.md")):
            text = read(path)
            self.assertLessEqual(len(text.splitlines()), CAP, path)
            self.assertNotIn("<!--", text, path)

    def test_root_claude_md_is_a_symlink_to_agents_md(self):
        path = os.path.join(REPO, "CLAUDE.md")
        self.assertTrue(os.path.islink(path))
        self.assertEqual(os.readlink(path), "AGENTS.md")

    def test_templates_folder_is_gone(self):
        self.assertFalse(os.path.exists(os.path.join(REPO, "templates")))

    def test_assets_hold_no_dotfiles(self):
        # Package managers and glob copies drop dotfiles, so they are stored without the dot.
        dotted = [os.path.relpath(os.path.join(r, n), ASSETS) for r, ds, fs in os.walk(ASSETS)
                  for n in fs + ds if n.startswith(".")]
        self.assertEqual(dotted, [])


class Scaffold(unittest.TestCase):
    def setUp(self):
        self.project = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.project)

    def run_scaffold(self, *extra):
        result = subprocess.run([sys.executable, SCRIPT, self.project] + list(extra), capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return {line.split()[1]: line.split()[0] for line in result.stdout.splitlines() if not line.startswith("scaffold:")}

    def p(self, rel):
        return os.path.join(self.project, rel)

    def test_empty_project_gets_both_files_and_the_docs(self):
        actions = self.run_scaffold()
        self.assertEqual(read(self.p("AGENTS.md")), read(os.path.join(ASSETS, "AGENTS.md")))
        self.assertEqual(read(self.p("CLAUDE.md")), "@AGENTS.md\n")
        for rel in ("docs/context/STATUS.md", "docs/context/CONVENTIONS.md", "BACKLOG.md", ".gitignore",
                    ".agent-blueprint/.gitignore", "src/.gitkeep"):
            self.assertTrue(os.path.isfile(self.p(rel)), rel)
            self.assertEqual(actions[rel], "created", rel)

    def test_every_path_the_agents_md_table_names_is_scaffolded(self):
        self.run_scaffold()
        table = read(os.path.join(ASSETS, "AGENTS.md")).split("## Where things are", 1)[1].split("\n## ", 1)[0]
        named = [path for line in table.splitlines() if line.startswith("| `")
                 for path in re.findall(r"`([^`]+)`", line.split("|")[1])]
        self.assertIn("docs/context/DECISIONS.md", named)
        for rel in named:
            self.assertTrue(os.path.exists(self.p(rel)), "AGENTS.md names %s, which the scaffold does not create" % rel)

    def test_existing_claude_md_gains_the_import_and_keeps_its_content(self):
        write(self.project, "CLAUDE.md", "# My rules\n\nUse tabs.\n")
        actions = self.run_scaffold()
        self.assertEqual(actions["CLAUDE.md"], "merged")
        text = read(self.p("CLAUDE.md"))
        self.assertEqual(text.splitlines()[0], "@AGENTS.md")
        self.assertIn("# My rules\n\nUse tabs.\n", text)
        self.assertTrue(os.path.isfile(self.p("AGENTS.md")))

    def test_existing_agents_md_keeps_its_sections_and_gains_missing_ones(self):
        own = "# Ours\n\n## Commits\n\nWe squash everything.\n\n## Deploys\n\nFridays never.\n"
        write(self.project, "AGENTS.md", own)
        actions = self.run_scaffold()
        self.assertEqual(actions["AGENTS.md"], "merged")
        text = read(self.p("AGENTS.md"))
        self.assertTrue(text.startswith(own.rstrip()))
        self.assertEqual(text.count("## Commits"), 1, "a section the project already has is not added twice")
        self.assertIn("We squash everything.", text)
        self.assertIn("## Deploys", text)
        self.assertIn("## How to work", text)

    def test_rerun_changes_nothing(self):
        self.run_scaffold()
        before = {r: read(os.path.join(self.project, r)) for r in ("AGENTS.md", "CLAUDE.md", ".gitignore")}
        actions = self.run_scaffold()
        self.assertEqual(set(actions.values()), {"kept"})
        for rel, text in before.items():
            self.assertEqual(read(self.p(rel)), text, rel)

    def test_claude_md_symlinked_to_agents_md_is_left_alone(self):
        write(self.project, "AGENTS.md", "# Ours\n")
        os.symlink("AGENTS.md", self.p("CLAUDE.md"))
        actions = self.run_scaffold()
        self.assertEqual(actions["CLAUDE.md"], "kept")
        self.assertTrue(os.path.islink(self.p("CLAUDE.md")))
        self.assertNotIn("@AGENTS.md", read(self.p("AGENTS.md")))

    def test_claude_md_hard_linked_to_agents_md_is_left_alone(self):
        write(self.project, "AGENTS.md", "# Ours\n")
        os.link(self.p("AGENTS.md"), self.p("CLAUDE.md"))
        actions = self.run_scaffold()
        self.assertEqual(actions["CLAUDE.md"], "kept")
        self.assertNotIn("@AGENTS.md", read(self.p("AGENTS.md")))

    def test_gitignore_gains_missing_lines_only(self):
        write(self.project, ".gitignore", "dist/\n.env\n")
        actions = self.run_scaffold()
        self.assertEqual(actions[".gitignore"], "merged")
        lines = read(self.p(".gitignore")).splitlines()
        self.assertEqual(lines[:2], ["dist/", ".env"])
        self.assertEqual(lines.count(".env"), 1)

    def test_existing_project_gets_no_placeholder_folders(self):
        write(self.project, "package.json", "{}\n")
        self.run_scaffold()
        self.assertFalse(os.path.exists(self.p("src")))

    def test_dry_run_writes_nothing(self):
        target = os.path.join(self.project, "new")
        subprocess.run([sys.executable, SCRIPT, target, "--dry-run"], capture_output=True, check=True)
        self.assertFalse(os.path.exists(target))


class SkillUsesItsAssets(unittest.TestCase):
    def test_skill_runs_the_script_from_its_own_folder(self):
        text = read(os.path.join(SKILL, "SKILL.md"))
        self.assertIn("scripts/scaffold.py", text)
        self.assertIn("**Bundled scripts.**", text)
        self.assertNotIn("templates/", text)

    def step(self, number):
        text = read(os.path.join(SKILL, "SKILL.md"))
        return text.split("## Step %d:" % number, 1)[1].split("\n## ", 1)[0]

    def test_folder_is_passed_only_when_named_by_the_user(self):
        text = read(os.path.join(SKILL, "SKILL.md"))
        hint = re.search(r"^argument-hint:.*$", text, re.MULTILINE).group()
        self.assertNotRegex(hint, r"(?i)default|current")
        step = self.step(0)
        self.assertRegex(step, r"(?i)only when the user named")
        self.assertRegex(step, r"(?i)(?:omit|no) (?:the )?folder argument")
        self.assertNotIn("(`.` when the user named none)", step)

    def test_confirmation_status_and_unattended_default_are_explained(self):
        step = self.step(0)
        self.assertRegex(step, r"(?i)exit (?:status )?`?3`?")
        for phrase in ("dry run", "ask", "rerun", "yes", "folder named", "default", "stop"):
            self.assertIn(phrase, step.lower())
        self.assertRegex(step, r"(?i)headless|unattended|nobody answers")
        self.assertIn("name a folder", step.lower())

    def test_no_python_fallback_keeps_the_same_guards(self):
        step = self.step(0)
        fallback = step.split("If no Python interpreter is available,", 1)[1].split("\n\n", 1)[0]
        for phrase in ("home", "`/`", "non-empty", "outside", "no folder", "confirmation"):
            self.assertIn(phrase, fallback.lower())
        self.assertRegex(fallback, r"(?i)refus")

    def test_git_init_depends_on_work_tree_check_in_project_folder(self):
        step = self.step(6)
        self.assertRegex(step, r"(?i)in the project folder.*git rev-parse --is-inside-work-tree")
        self.assertRegex(step, r"(?i)only (?:if|when).*fails.*`git init`")
        self.assertNotIn("has no `.git`", step)


class OnboardingGuard(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.root)
        self.project = os.path.join(self.root, "project")
        self.home = os.path.join(self.root, "home")
        os.makedirs(self.project)
        os.makedirs(self.home)
        # Keep the fixture outside any inherited repository, even with a custom TMPDIR.
        self.env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        self.env.update(HOME=self.home, GIT_CEILING_DIRECTORIES=os.path.dirname(self.root))

    def run_scaffold(self, *args, cwd=None, env=None):
        return subprocess.run([sys.executable, SCRIPT, *args], cwd=cwd or self.project,
                              env=env or self.env, capture_output=True, text=True)

    def assert_refused(self, result):
        self.assertNotEqual(result.returncode, 0, result.stdout)
        output = result.stdout + result.stderr
        self.assertNotRegex(output, r"(?m)^created\s")
        self.assertIn("name a folder", output.lower())

    def assert_scaffolded(self, result, target):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for rel in ("AGENTS.md", "docs/context/STATUS.md"):
            self.assertTrue(os.path.isfile(os.path.join(target, rel)), rel)

    def test_home_without_folder_is_refused_without_writes(self):
        for args in ((), ("--dry-run",)):
            with self.subTest(args=args):
                self.assert_refused(self.run_scaffold(*args, cwd=self.home))
                self.assertEqual(os.listdir(self.home), [])

    def test_real_home_and_symlinked_home_are_the_same_folder(self):
        link = os.path.join(self.root, "home-link")
        os.symlink(self.home, link)
        for cwd, home in ((link, self.home), (self.home, link)):
            with self.subTest(cwd=cwd, home=home):
                self.assert_refused(self.run_scaffold(cwd=cwd, env=dict(self.env, HOME=home)))
                self.assertEqual(os.listdir(self.home), [])

    def test_filesystem_root_without_folder_is_refused(self):
        # Do not scaffold the root explicitly, even in a dry run.
        self.assert_refused(self.run_scaffold(cwd=os.path.abspath(os.sep)))

    def test_symlink_to_filesystem_root_without_folder_is_refused(self):
        link = os.path.join(self.root, "root-link")
        os.symlink(os.path.abspath(os.sep), link)
        self.assert_refused(self.run_scaffold(cwd=link))

    def test_explicit_home_proceeds(self):
        self.assert_scaffolded(self.run_scaffold(self.home, cwd=self.home), self.home)

    def test_explicit_empty_project_proceeds(self):
        self.assert_scaffolded(self.run_scaffold(self.project), self.project)

    def test_unnamed_empty_project_proceeds(self):
        self.assert_scaffolded(self.run_scaffold(), self.project)

    def test_nonempty_nonrepo_needs_confirmation_and_prints_dry_run(self):
        write(self.project, "unrelated.txt", "keep this\n")
        for args in ((), ("--dry-run",)):
            with self.subTest(args=args):
                result = self.run_scaffold(*args)
                self.assertEqual(result.returncode, 3, result.stdout + result.stderr)
                self.assertIn("dry run", result.stdout.lower())
                self.assertRegex(result.stdout, r"(?m)^created\s+AGENTS.md$")
                self.assertRegex(result.stdout, r"(?m)^created\s+docs/context/STATUS.md$")
                self.assertIn("name a folder", (result.stdout + result.stderr).lower())
                self.assertEqual(os.listdir(self.project), ["unrelated.txt"])
                self.assertEqual(read(os.path.join(self.project, "unrelated.txt")), "keep this\n")

    def test_explicit_nonempty_nonrepo_proceeds(self):
        write(self.project, "unrelated.txt", "keep this\n")
        self.assert_scaffolded(self.run_scaffold(self.project), self.project)
        self.assertEqual(read(os.path.join(self.project, "unrelated.txt")), "keep this\n")

    def test_explicit_dot_counts_as_named(self):
        self.assert_scaffolded(self.run_scaffold(".", cwd=self.home), self.home)

    def init_repo(self):
        subprocess.run(["git", "init", "-q", self.project], env=self.env,
                       check=True, capture_output=True, text=True)

    def test_repo_subfolder_reports_top_level_and_proceeds(self):
        self.init_repo()
        child = os.path.join(self.project, "nested")
        os.makedirs(child)
        write(child, "unrelated.txt", "keep this\n")
        for args in ((), (child,)):
            with self.subTest(args=args):
                result = self.run_scaffold(*args, cwd=child)
                self.assert_scaffolded(result, child)
                self.assertIn(os.path.realpath(self.project), result.stdout)
                self.assertFalse(os.path.exists(os.path.join(child, ".git")))

    def test_repo_top_level_without_folder_proceeds(self):
        self.init_repo()
        write(self.project, "unrelated.txt", "keep this\n")
        self.assert_scaffolded(self.run_scaffold(), self.project)

    def test_missing_git_treats_folder_as_outside_work_tree(self):
        empty_path = os.path.join(self.root, "bin")
        os.makedirs(empty_path)
        env = dict(self.env, PATH=empty_path)
        write(self.project, "unrelated.txt", "keep this\n")
        result = self.run_scaffold(env=env)
        self.assertEqual(result.returncode, 3, result.stdout + result.stderr)
        self.assertEqual(os.listdir(self.project), ["unrelated.txt"])
        self.assert_scaffolded(self.run_scaffold(self.project, env=env), self.project)


if __name__ == "__main__":
    unittest.main()

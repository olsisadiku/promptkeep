//! Optional Git/GitHub backup. Versioning does NOT depend on this — Git is
//! purely for off-machine backup and publishing. Defaults to a PRIVATE repo.
//! `.spl/` (local history + prefs) is always git-ignored so it is never pushed.

use crate::error::{Error, Result};
use crate::fs_library::META_DIR;
use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct GitStatus {
    pub git_available: bool,
    pub gh_available: bool,
    pub gh_authed: bool,
    pub is_repo: bool,
    pub has_remote: bool,
    pub branch: Option<String>,
    pub remote_url: Option<String>,
    pub dirty: bool,
}

fn run(root: &Path, program: &str, args: &[&str]) -> Result<String> {
    let out = Command::new(program)
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|e| Error::Git(format!("failed to run {program}: {e}")))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let msg = if stderr.is_empty() { stdout } else { stderr };
        Err(Error::Git(format!("{program} {}: {msg}", args.join(" "))))
    }
}

fn tool_available(program: &str) -> bool {
    Command::new(program)
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn gh_authed() -> bool {
    Command::new("gh")
        .args(["auth", "status"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn is_repo(root: &Path) -> bool {
    run(root, "git", &["rev-parse", "--is-inside-work-tree"])
        .map(|s| s == "true")
        .unwrap_or(false)
}

/// Make sure `.spl/` and OS cruft are ignored before any commit, so local
/// version history is never published.
fn ensure_gitignore(root: &Path) -> Result<()> {
    let path = root.join(".gitignore");
    let needed = [format!("{META_DIR}/"), ".DS_Store".to_string()];
    let mut existing = if path.exists() {
        std::fs::read_to_string(&path)?
    } else {
        String::new()
    };
    let mut changed = false;
    for line in needed {
        let present = existing.lines().any(|l| l.trim() == line);
        if !present {
            if !existing.is_empty() && !existing.ends_with('\n') {
                existing.push('\n');
            }
            existing.push_str(&line);
            existing.push('\n');
            changed = true;
        }
    }
    if changed {
        std::fs::write(path, existing)?;
    }
    Ok(())
}

pub fn status(root: &Path) -> Result<GitStatus> {
    let git_available = tool_available("git");
    let gh_available = tool_available("gh");
    if !git_available {
        return Ok(GitStatus {
            git_available,
            gh_available,
            gh_authed: false,
            is_repo: false,
            has_remote: false,
            branch: None,
            remote_url: None,
            dirty: false,
        });
    }
    let repo = is_repo(root);
    let branch = if repo {
        run(root, "git", &["rev-parse", "--abbrev-ref", "HEAD"]).ok()
    } else {
        None
    };
    let remote_url = if repo {
        run(root, "git", &["remote", "get-url", "origin"]).ok()
    } else {
        None
    };
    let dirty = if repo {
        !run(root, "git", &["status", "--porcelain"])
            .unwrap_or_default()
            .is_empty()
    } else {
        false
    };
    Ok(GitStatus {
        git_available,
        gh_available,
        gh_authed: gh_available && gh_authed(),
        is_repo: repo,
        has_remote: remote_url.is_some(),
        branch,
        remote_url,
        dirty,
    })
}

pub fn init(root: &Path) -> Result<()> {
    if !is_repo(root) {
        run(root, "git", &["init"])?;
        // Prefer a `main` branch on fresh repos.
        let _ = run(root, "git", &["symbolic-ref", "HEAD", "refs/heads/main"]);
    }
    ensure_gitignore(root)?;
    Ok(())
}

/// Stage everything and commit. Returns false if there was nothing to commit.
pub fn commit_all(root: &Path, message: &str) -> Result<bool> {
    init(root)?;
    run(root, "git", &["add", "-A"])?;
    let staged = run(root, "git", &["status", "--porcelain"])?;
    if staged.is_empty() {
        return Ok(false);
    }
    let msg = if message.trim().is_empty() {
        "Update prompts"
    } else {
        message.trim()
    };
    run(root, "git", &["commit", "-m", msg])?;
    Ok(true)
}

pub fn commit_and_push(root: &Path, message: &str) -> Result<bool> {
    let committed = commit_all(root, message)?;
    let s = status(root)?;
    if s.has_remote {
        let branch = s.branch.unwrap_or_else(|| "main".to_string());
        run(root, "git", &["push", "-u", "origin", &branch])?;
    } else {
        return Err(Error::Git(
            "no remote configured — publish to GitHub first".into(),
        ));
    }
    Ok(committed)
}

/// Create a GitHub repo (PRIVATE by default) from the library and push.
pub fn publish(root: &Path, repo_name: &str, private: bool) -> Result<String> {
    if !tool_available("gh") {
        return Err(Error::Git(
            "GitHub CLI (gh) is not installed. Install it from https://cli.github.com".into(),
        ));
    }
    if !gh_authed() {
        return Err(Error::Git(
            "GitHub CLI is not authenticated. Run `gh auth login` in a terminal.".into(),
        ));
    }
    let name = repo_name.trim();
    if name.is_empty() {
        return Err(Error::InvalidName("repository name is empty".into()));
    }
    init(root)?;
    // Ensure there's at least one commit before gh tries to push.
    let _ = commit_all(root, "Initial commit — System Prompt Library");

    let visibility = if private { "--private" } else { "--public" };
    run(
        root,
        "gh",
        &[
            "repo", "create", name, visibility, "--source=.", "--remote=origin", "--push",
        ],
    )?;
    let url = run(root, "git", &["remote", "get-url", "origin"]).unwrap_or_default();
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gitignore_added_idempotently() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path();
        ensure_gitignore(root).unwrap();
        ensure_gitignore(root).unwrap();
        let content = std::fs::read_to_string(root.join(".gitignore")).unwrap();
        assert_eq!(content.matches(".spl/").count(), 1);
        assert!(content.contains(".DS_Store"));
    }

    #[test]
    fn init_and_commit_when_git_present() {
        if !tool_available("git") {
            return;
        }
        let d = tempfile::tempdir().unwrap();
        let root = d.path();
        // git needs an identity in CI-like envs; set a local one.
        let _ = run(root, "git", &["init"]);
        let _ = run(root, "git", &["config", "user.email", "test@example.com"]);
        let _ = run(root, "git", &["config", "user.name", "Test"]);
        std::fs::write(root.join("a.md"), "# A").unwrap();
        let committed = commit_all(root, "first").unwrap();
        assert!(committed);
        // Nothing new -> false.
        let again = commit_all(root, "noop").unwrap();
        assert!(!again);
        let s = status(root).unwrap();
        assert!(s.is_repo);
        assert!(!s.dirty);
    }
}

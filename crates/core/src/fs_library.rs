//! On-disk prompt library: categories are folders, prompts are `.md`/`.txt`
//! files. One level of category folders plus root-level ("Uncategorized")
//! prompts. All paths are validated to stay inside the library root.

use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};

/// Folder holding app metadata (version snapshots, prefs). Never treated as a
/// category and excluded from publishing.
pub const META_DIR: &str = ".spl";

const ALLOWED_EXTS: &[&str] = &["md", "markdown", "txt"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptMeta {
    /// Stable id == posix relative path from the library root, e.g. "Coding/code-review.md".
    pub id: String,
    pub title: String,
    /// Category folder name, or null for root-level prompts.
    pub category: Option<String>,
    pub file_name: String,
    pub size: u64,
    pub modified_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptFull {
    #[serde(flatten)]
    pub meta: PromptMeta,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CategoryNode {
    pub name: String,
    pub prompts: Vec<PromptMeta>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LibrarySnapshot {
    pub root: String,
    pub categories: Vec<CategoryNode>,
    /// Prompts that live directly in the root (no category folder).
    pub uncategorized: Vec<PromptMeta>,
}

// ---------------------------------------------------------------------------
// Path safety + naming helpers
// ---------------------------------------------------------------------------

fn is_allowed_ext(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| ALLOWED_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Reject empty names, separators, `..`, and leading dots (hidden files).
pub fn validate_segment(name: &str) -> Result<()> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(Error::InvalidName("name is empty".into()));
    }
    if trimmed.starts_with('.') {
        return Err(Error::InvalidName("name cannot start with a dot".into()));
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
        return Err(Error::InvalidName(format!("'{name}' contains path separators")));
    }
    Ok(())
}

/// Resolve a relative id against the root, guaranteeing the result stays
/// inside the root and uses only normal path components.
pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf> {
    let rel = rel.replace('\\', "/");
    let candidate = Path::new(&rel);
    let mut out = root.to_path_buf();
    for comp in candidate.components() {
        match comp {
            Component::Normal(c) => out.push(c),
            Component::CurDir => {}
            _ => return Err(Error::PathEscape),
        }
    }
    if !out.starts_with(root) {
        return Err(Error::PathEscape);
    }
    Ok(out)
}

/// Posix relative path from root, used as the prompt id.
fn rel_id(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => s.to_str(),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// Derive a human title: first markdown H1 if present, else the filename stem
/// turned into Title Case.
fn derive_title(content: &str, file_name: &str) -> String {
    for line in content.lines().take(20) {
        let l = line.trim();
        if let Some(h) = l.strip_prefix("# ") {
            if !h.trim().is_empty() {
                return h.trim().to_string();
            }
        }
    }
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name);
    prettify(stem)
}

fn prettify(stem: &str) -> String {
    let words: Vec<String> = stem
        .split(|c| c == '-' || c == '_' || c == ' ')
        .filter(|s| !s.is_empty())
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect();
    if words.is_empty() {
        stem.to_string()
    } else {
        words.join(" ")
    }
}

/// Turn a free-form prompt name into a safe `.md` file name.
pub fn slug_filename(name: &str) -> String {
    let base: String = name
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    let collapsed = base
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let stem = if collapsed.is_empty() { "untitled".to_string() } else { collapsed };
    format!("{stem}.md")
}

fn meta_for(root: &Path, path: &Path) -> Result<PromptMeta> {
    let md = std::fs::metadata(path)?;
    let content = std::fs::read_to_string(path).unwrap_or_default();
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_string();
    let id = rel_id(root, path);
    let category = path
        .parent()
        .filter(|p| *p != root)
        .and_then(|p| p.file_name())
        .and_then(|s| s.to_str())
        .map(|s| s.to_string());
    let modified_ms = md
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    Ok(PromptMeta {
        id,
        title: derive_title(&content, &file_name),
        category,
        file_name,
        size: md.len(),
        modified_ms,
    })
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

fn full_for(root: &Path, path: &Path) -> Result<PromptFull> {
    let content = std::fs::read_to_string(path)?;
    let meta = meta_for(root, path)?;
    Ok(PromptFull { meta, content })
}

/// Flat list of every prompt *with content* — the payload the UI feeds into its
/// search index.
pub fn scan_flat(root: &Path) -> Result<Vec<PromptFull>> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    let mut visit = |dir: &Path| -> Result<()> {
        if !dir.exists() {
            return Ok(());
        }
        for entry in std::fs::read_dir(dir)? {
            let path = entry?.path();
            if path.is_file() && is_allowed_ext(&path) {
                out.push(full_for(root, &path)?);
            }
        }
        Ok(())
    };
    visit(root)?;
    for entry in std::fs::read_dir(root)? {
        let path = entry?.path();
        if !path.is_dir() {
            continue;
        }
        let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
        if name == META_DIR || name.starts_with('.') {
            continue;
        }
        visit(&path)?;
    }
    Ok(out)
}

fn scan_dir_prompts(root: &Path, dir: &Path) -> Result<Vec<PromptMeta>> {
    let mut prompts = Vec::new();
    if !dir.exists() {
        return Ok(prompts);
    }
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() && is_allowed_ext(&path) {
            prompts.push(meta_for(root, &path)?);
        }
    }
    prompts.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(prompts)
}

pub fn scan(root: &Path) -> Result<LibrarySnapshot> {
    if !root.exists() {
        std::fs::create_dir_all(root)?;
    }
    let uncategorized = scan_dir_prompts(root, root)?;
    let mut categories = Vec::new();
    for entry in std::fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = match path.file_name().and_then(|s| s.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if name == META_DIR || name.starts_with('.') {
            continue;
        }
        categories.push(CategoryNode {
            name,
            prompts: scan_dir_prompts(root, &path)?,
        });
    }
    categories.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(LibrarySnapshot {
        root: root.to_string_lossy().to_string(),
        categories,
        uncategorized,
    })
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

pub fn read_prompt(root: &Path, id: &str) -> Result<PromptFull> {
    let path = resolve(root, id)?;
    if !path.is_file() {
        return Err(Error::NotFound(id.to_string()));
    }
    let content = std::fs::read_to_string(&path)?;
    let meta = meta_for(root, &path)?;
    Ok(PromptFull { meta, content })
}

pub fn create_category(root: &Path, name: &str) -> Result<()> {
    validate_segment(name)?;
    let dir = root.join(name.trim());
    if dir.exists() {
        return Err(Error::AlreadyExists(name.to_string()));
    }
    std::fs::create_dir_all(&dir)?;
    Ok(())
}

pub fn rename_category(root: &Path, old: &str, new: &str) -> Result<()> {
    validate_segment(old)?;
    validate_segment(new)?;
    let from = root.join(old.trim());
    let to = root.join(new.trim());
    if !from.is_dir() {
        return Err(Error::NotFound(old.to_string()));
    }
    if to.exists() {
        return Err(Error::AlreadyExists(new.to_string()));
    }
    std::fs::rename(from, to)?;
    Ok(())
}

pub fn delete_category(root: &Path, name: &str) -> Result<()> {
    validate_segment(name)?;
    let dir = root.join(name.trim());
    if !dir.is_dir() {
        return Err(Error::NotFound(name.to_string()));
    }
    std::fs::remove_dir_all(dir)?;
    Ok(())
}

/// Create a new (empty-ish) prompt in an optional category. Returns its id.
pub fn create_prompt(root: &Path, category: Option<&str>, name: &str) -> Result<String> {
    let dir = match category {
        Some(c) if !c.trim().is_empty() => {
            validate_segment(c)?;
            let d = root.join(c.trim());
            std::fs::create_dir_all(&d)?;
            d
        }
        _ => root.to_path_buf(),
    };
    let file_name = slug_filename(name);
    let mut path = dir.join(&file_name);
    // Avoid clobbering: append -2, -3, ... if needed.
    if path.exists() {
        let stem = Path::new(&file_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("untitled")
            .to_string();
        let mut n = 2;
        loop {
            let candidate = dir.join(format!("{stem}-{n}.md"));
            if !candidate.exists() {
                path = candidate;
                break;
            }
            n += 1;
        }
    }
    let title = name.trim();
    let initial = if title.is_empty() {
        String::new()
    } else {
        format!("# {title}\n\n")
    };
    std::fs::write(&path, initial)?;
    Ok(rel_id(root, &path))
}

pub fn rename_prompt(root: &Path, id: &str, new_name: &str) -> Result<String> {
    let from = resolve(root, id)?;
    if !from.is_file() {
        return Err(Error::NotFound(id.to_string()));
    }
    let dir = from.parent().unwrap_or(root);
    let file_name = slug_filename(new_name);
    let to = dir.join(&file_name);
    if to.exists() && to != from {
        return Err(Error::AlreadyExists(file_name));
    }
    std::fs::rename(&from, &to)?;
    Ok(rel_id(root, &to))
}

pub fn delete_prompt(root: &Path, id: &str) -> Result<()> {
    let path = resolve(root, id)?;
    if !path.is_file() {
        return Err(Error::NotFound(id.to_string()));
    }
    std::fs::remove_file(path)?;
    Ok(())
}

/// Move a prompt to a different category (or root if `None`). Returns new id.
pub fn move_prompt(root: &Path, id: &str, new_category: Option<&str>) -> Result<String> {
    let from = resolve(root, id)?;
    if !from.is_file() {
        return Err(Error::NotFound(id.to_string()));
    }
    let file_name = from
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| Error::InvalidName(id.to_string()))?;
    let dir = match new_category {
        Some(c) if !c.trim().is_empty() => {
            validate_segment(c)?;
            let d = root.join(c.trim());
            std::fs::create_dir_all(&d)?;
            d
        }
        _ => root.to_path_buf(),
    };
    let to = dir.join(file_name);
    if to.exists() && to != from {
        return Err(Error::AlreadyExists(file_name.to_string()));
    }
    std::fs::rename(&from, &to)?;
    Ok(rel_id(root, &to))
}

/// Write content to a prompt, returning the previous content (for snapshotting)
/// and whether the file already existed.
pub fn write_prompt_raw(root: &Path, id: &str, content: &str) -> Result<Option<String>> {
    let path = resolve(root, id)?;
    let prev = if path.is_file() {
        Some(std::fs::read_to_string(&path)?)
    } else {
        None
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, content)?;
    Ok(prev)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn slug_is_safe() {
        assert_eq!(slug_filename("Code Review!"), "code-review.md");
        assert_eq!(slug_filename("  multi   word  "), "multi-word.md");
        assert_eq!(slug_filename("***"), "untitled.md");
    }

    #[test]
    fn resolve_blocks_escape() {
        let d = tmp();
        assert!(resolve(d.path(), "../etc/passwd").is_err());
        assert!(resolve(d.path(), "ok/file.md").is_ok());
    }

    #[test]
    fn create_scan_read_roundtrip() {
        let d = tmp();
        let root = d.path();
        let id = create_prompt(root, Some("Coding"), "Code Review").unwrap();
        assert_eq!(id, "Coding/code-review.md");
        let snap = scan(root).unwrap();
        assert_eq!(snap.categories.len(), 1);
        assert_eq!(snap.categories[0].name, "Coding");
        assert_eq!(snap.categories[0].prompts.len(), 1);
        let full = read_prompt(root, &id).unwrap();
        assert_eq!(full.meta.title, "Code Review");
        assert_eq!(full.meta.category.as_deref(), Some("Coding"));
    }

    #[test]
    fn title_prefers_h1() {
        let d = tmp();
        let root = d.path();
        let id = create_prompt(root, None, "notes").unwrap();
        write_prompt_raw(root, &id, "# Real Title\n\nbody").unwrap();
        let full = read_prompt(root, &id).unwrap();
        assert_eq!(full.meta.title, "Real Title");
        assert_eq!(full.meta.category, None);
    }

    #[test]
    fn meta_dir_ignored() {
        let d = tmp();
        let root = d.path();
        std::fs::create_dir_all(root.join(META_DIR)).unwrap();
        create_prompt(root, Some("X"), "a").unwrap();
        let snap = scan(root).unwrap();
        assert!(snap.categories.iter().all(|c| c.name != META_DIR));
    }
}

//! Local version history, independent of Git. On every save the *previous*
//! content of a prompt is snapshotted into `<root>/.spl/versions/<id>/` and an
//! entry is appended to `<root>/.spl/versions-index.json`. Restore is just a
//! save of an old snapshot's content, so it is non-destructive (the
//! then-current content is itself snapshotted).

use crate::error::{Error, Result};
use crate::fs_library::META_DIR;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionMeta {
    /// ISO-8601-ish UTC timestamp, also the snapshot file stem. Sortable.
    pub ts: String,
    pub file: String,
    pub size: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

type Index = BTreeMap<String, Vec<VersionMeta>>;

fn meta_dir(root: &Path) -> PathBuf {
    root.join(META_DIR)
}

fn index_path(root: &Path) -> PathBuf {
    meta_dir(root).join("versions-index.json")
}

fn versions_dir_for(root: &Path, id: &str) -> PathBuf {
    let mut p = meta_dir(root).join("versions");
    for part in id.split('/').filter(|s| !s.is_empty()) {
        p.push(part);
    }
    p
}

fn load_index(root: &Path) -> Result<Index> {
    let path = index_path(root);
    if !path.exists() {
        return Ok(Index::new());
    }
    let raw = std::fs::read_to_string(&path)?;
    if raw.trim().is_empty() {
        return Ok(Index::new());
    }
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

fn save_index(root: &Path, index: &Index) -> Result<()> {
    let dir = meta_dir(root);
    std::fs::create_dir_all(&dir)?;
    let raw = serde_json::to_string_pretty(index)?;
    std::fs::write(index_path(root), raw)?;
    Ok(())
}

/// Snapshot a piece of content as a new historical version of `id`.
pub fn snapshot(root: &Path, id: &str, content: &str, note: Option<String>) -> Result<VersionMeta> {
    let ts = chrono::Utc::now().format("%Y-%m-%dT%H-%M-%S%.3fZ").to_string();
    let file = format!("{ts}.md");
    let dir = versions_dir_for(root, id);
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join(&file), content)?;

    let meta = VersionMeta {
        ts: ts.clone(),
        file,
        size: content.len() as u64,
        note,
    };
    let mut index = load_index(root)?;
    index.entry(id.to_string()).or_default().push(meta.clone());
    save_index(root, &index)?;
    Ok(meta)
}

/// All versions for a prompt, newest first.
pub fn list(root: &Path, id: &str) -> Result<Vec<VersionMeta>> {
    let index = load_index(root)?;
    let mut list = index.get(id).cloned().unwrap_or_default();
    list.sort_by(|a, b| b.ts.cmp(&a.ts));
    Ok(list)
}

/// Read the content of a specific snapshot.
pub fn read(root: &Path, id: &str, ts: &str) -> Result<String> {
    let index = load_index(root)?;
    let entry = index
        .get(id)
        .and_then(|v| v.iter().find(|m| m.ts == ts))
        .ok_or_else(|| Error::NotFound(format!("{id}@{ts}")))?;
    let path = versions_dir_for(root, id).join(&entry.file);
    Ok(std::fs::read_to_string(path)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_list_read_roundtrip() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path();
        let id = "Coding/code-review.md";
        let v1 = snapshot(root, id, "first", None).unwrap();
        // ensure ordering is deterministic even within the same ms
        std::thread::sleep(std::time::Duration::from_millis(5));
        let v2 = snapshot(root, id, "second", Some("edited".into())).unwrap();
        assert_ne!(v1.ts, v2.ts);

        let list = list(root, id).unwrap();
        assert_eq!(list.len(), 2);
        // newest first
        assert_eq!(list[0].ts, v2.ts);
        assert_eq!(read(root, id, &v1.ts).unwrap(), "first");
        assert_eq!(read(root, id, &v2.ts).unwrap(), "second");
        assert_eq!(list[0].note.as_deref(), Some("edited"));
    }

    #[test]
    fn missing_version_errors() {
        let d = tempfile::tempdir().unwrap();
        assert!(read(d.path(), "x.md", "nope").is_err());
        assert!(list(d.path(), "x.md").unwrap().is_empty());
    }
}

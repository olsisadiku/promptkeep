use serde::{Serialize, Serializer};

/// Unified error type for all core operations. Serializes to its display
/// string so Tauri commands can return `Result<T, Error>` straight to the UI.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("no library folder is open")]
    NoLibrary,

    #[error("invalid name: {0}")]
    InvalidName(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("already exists: {0}")]
    AlreadyExists(String),

    #[error("path escapes the library root")]
    PathEscape,

    #[error("keychain error: {0}")]
    Keychain(String),

    #[error("no API key set for provider '{0}'")]
    NoApiKey(String),

    #[error("ai provider error: {0}")]
    Ai(String),

    #[error("http error: {0}")]
    Http(String),

    #[error("git error: {0}")]
    Git(String),

    #[error("{0}")]
    Other(String),
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<keyring::Error> for Error {
    fn from(e: keyring::Error) -> Self {
        Error::Keychain(e.to_string())
    }
}

impl From<reqwest::Error> for Error {
    fn from(e: reqwest::Error) -> Self {
        Error::Http(e.to_string())
    }
}

impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        Error::Other(format!("json: {e}"))
    }
}

pub type Result<T> = std::result::Result<T, Error>;

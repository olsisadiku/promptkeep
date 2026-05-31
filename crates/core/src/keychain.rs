//! API keys live in the macOS login Keychain via the `keyring` crate. The key
//! material is read here in Rust only when making an AI request; it is never
//! returned to the webview. The UI can only ask whether a key is *present*.

use crate::error::{Error, Result};

const SERVICE: &str = "com.promptkeep.app";

/// Supported BYO-key providers.
pub fn is_known_provider(provider: &str) -> bool {
    matches!(provider, "openai" | "openrouter" | "anthropic")
}

fn entry(provider: &str) -> Result<keyring::Entry> {
    if !is_known_provider(provider) {
        return Err(Error::InvalidName(format!("unknown provider '{provider}'")));
    }
    Ok(keyring::Entry::new(SERVICE, provider)?)
}

pub fn set_key(provider: &str, key: &str) -> Result<()> {
    let key = key.trim();
    if key.is_empty() {
        return Err(Error::InvalidName("API key is empty".into()));
    }
    entry(provider)?.set_password(key)?;
    Ok(())
}

pub fn get_key(provider: &str) -> Result<String> {
    match entry(provider)?.get_password() {
        Ok(k) => Ok(k),
        Err(keyring::Error::NoEntry) => Err(Error::NoApiKey(provider.to_string())),
        Err(e) => Err(e.into()),
    }
}

pub fn has_key(provider: &str) -> Result<bool> {
    match entry(provider)?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(e.into()),
    }
}

pub fn delete_key(provider: &str) -> Result<()> {
    match entry(provider)?.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}

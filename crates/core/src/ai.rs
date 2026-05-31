//! Bring-your-own-key prompt optimization. Supports OpenAI, OpenRouter
//! (OpenAI-compatible) and Anthropic. The API key is read from the Keychain
//! here in Rust and used server-side; it never reaches the webview.

use crate::error::{Error, Result};
use crate::keychain;
use serde_json::{json, Value};

const OPTIMIZE_SYSTEM: &str = "You are an expert prompt engineer. You are given a system prompt that the user wants to improve. Rewrite it to be clearer, more specific, better structured, and more effective, while preserving the original intent, voice, and any concrete constraints. Prefer plain, direct language. Do not add meta-commentary. Return ONLY the improved system prompt as Markdown — no preamble, no explanation, no code fences around the whole thing.";

/// Default model per provider when the UI doesn't specify one.
pub fn default_model(provider: &str) -> &'static str {
    match provider {
        "openai" => "gpt-4o",
        "openrouter" => "openai/gpt-4o",
        "anthropic" => "claude-sonnet-4-6",
        _ => "",
    }
}

fn user_message(prompt: &str, instructions: Option<&str>) -> String {
    match instructions {
        Some(i) if !i.trim().is_empty() => format!(
            "Additional instructions for how to improve it:\n{}\n\n---\nSYSTEM PROMPT TO IMPROVE:\n\n{}",
            i.trim(),
            prompt
        ),
        _ => format!("SYSTEM PROMPT TO IMPROVE:\n\n{}", prompt),
    }
}

/// Optimize a prompt and return the improved text.
pub async fn optimize_prompt(
    provider: &str,
    model: Option<&str>,
    prompt: &str,
    instructions: Option<&str>,
) -> Result<String> {
    if prompt.trim().is_empty() {
        return Err(Error::Ai("prompt is empty".into()));
    }
    let key = keychain::get_key(provider)?;
    let model = match model {
        Some(m) if !m.trim().is_empty() => m.trim().to_string(),
        _ => default_model(provider).to_string(),
    };
    let user = user_message(prompt, instructions);
    let client = reqwest::Client::new();

    match provider {
        "openai" | "openrouter" => {
            let base = if provider == "openai" {
                "https://api.openai.com/v1/chat/completions"
            } else {
                "https://openrouter.ai/api/v1/chat/completions"
            };
            let body = json!({
                "model": model,
                "messages": [
                    {"role": "system", "content": OPTIMIZE_SYSTEM},
                    {"role": "user", "content": user}
                ],
                "temperature": 0.4
            });
            let mut req = client
                .post(base)
                .bearer_auth(&key)
                .header("content-type", "application/json");
            if provider == "openrouter" {
                req = req
                    .header("HTTP-Referer", "https://github.com/olsisadiku/promptkeep")
                    .header("X-Title", "PromptKeep");
            }
            let resp = req.json(&body).send().await?;
            let status = resp.status();
            let v: Value = resp.json().await.map_err(|e| Error::Ai(e.to_string()))?;
            if !status.is_success() {
                return Err(Error::Ai(provider_error(&v, status.as_u16())));
            }
            v["choices"][0]["message"]["content"]
                .as_str()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| Error::Ai("empty response from model".into()))
        }
        "anthropic" => {
            let body = json!({
                "model": model,
                "max_tokens": 4096,
                "system": OPTIMIZE_SYSTEM,
                "messages": [{"role": "user", "content": user}]
            });
            let resp = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", &key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await?;
            let status = resp.status();
            let v: Value = resp.json().await.map_err(|e| Error::Ai(e.to_string()))?;
            if !status.is_success() {
                return Err(Error::Ai(provider_error(&v, status.as_u16())));
            }
            v["content"][0]["text"]
                .as_str()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| Error::Ai("empty response from model".into()))
        }
        other => Err(Error::InvalidName(format!("unknown provider '{other}'"))),
    }
}

fn provider_error(v: &Value, status: u16) -> String {
    let msg = v["error"]["message"]
        .as_str()
        .or_else(|| v["error"].as_str())
        .or_else(|| v["message"].as_str())
        .unwrap_or("request failed");
    format!("{status}: {msg}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_known() {
        assert_eq!(default_model("openai"), "gpt-4o");
        assert_eq!(default_model("anthropic"), "claude-sonnet-4-6");
        assert_eq!(default_model("nope"), "");
    }

    #[test]
    fn user_message_includes_instructions() {
        let m = user_message("BODY", Some("be terse"));
        assert!(m.contains("be terse"));
        assert!(m.contains("BODY"));
    }

    #[test]
    fn parses_provider_error() {
        let v = serde_json::json!({"error": {"message": "bad key"}});
        assert_eq!(provider_error(&v, 401), "401: bad key");
    }
}

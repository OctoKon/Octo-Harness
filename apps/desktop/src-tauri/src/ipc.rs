use crate::process::EngineChild;
use serde::Serialize;
use serde_json::{Value, json};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Manager, WebviewWindow, ipc::Channel};

const PROTOCOL: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../packages/splyce-pi/dist/bridge-protocol.json"
));

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeError {
    code: &'static str,
    message: &'static str,
    correlation_id: String,
    retryable: bool,
}

impl BridgeError {
    fn denied() -> Self {
        Self {
            code: "POLICY_DENIED",
            message: "Native command unavailable",
            correlation_id: "native-validation".into(),
            retryable: false,
        }
    }
    fn engine() -> Self {
        Self {
            code: "ENGINE_CRASH",
            message: "Engine connection unavailable",
            correlation_id: "native-transport".into(),
            retryable: false,
        }
    }
}

struct Inner {
    child: Option<EngineChild>,
    lifecycle: Option<Channel<Value>>,
    closed: bool,
}

#[derive(Clone)]
pub struct BridgeState {
    inner: Arc<Mutex<Inner>>,
    next_id: Arc<AtomicU64>,
}

impl BridgeState {
    pub fn start(directory: &Path, digest: &str) -> Result<Self, crate::process::EngineError> {
        let child = EngineChild::spawn(directory, digest)?;
        let state = Self {
            inner: Arc::new(Mutex::new(Inner {
                child: Some(child),
                lifecycle: None,
                closed: false,
            })),
            next_id: Arc::new(AtomicU64::new(1)),
        };
        let observer = state.clone();
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(std::time::Duration::from_millis(100));
                let Ok(mut inner) = observer.inner.try_lock() else {
                    continue;
                };
                if inner.closed {
                    break;
                }
                if inner
                    .child
                    .as_ref()
                    .is_some_and(|child| !child.is_running())
                {
                    let clean = inner
                        .child
                        .as_mut()
                        .is_some_and(|child| child.stop().is_ok());
                    if let Some(channel) = inner.lifecycle.take() {
                        let _ = channel.send(json!({"protocolVersion":1,"kind":"engine_exited","expected":false,"exitCode":null,"cleanupComplete":clean}));
                    }
                    if clean {
                        inner.child = None;
                    }
                    inner.closed = true;
                    break;
                }
            }
        });
        Ok(state)
    }

    fn call(&self, method: &str, params: Value) -> Result<Value, BridgeError> {
        let mut inner = self.inner.try_lock().map_err(|_| BridgeError::denied())?;
        let id = format!("native-{}", self.next_id.fetch_add(1, Ordering::Relaxed));
        let child = inner.child.as_mut().ok_or_else(BridgeError::engine)?;
        let reply = child
            .request(&json!({"id":id,"method":method,"params":params}))
            .map_err(|_| BridgeError::engine())?;
        let object = reply.as_object().ok_or_else(BridgeError::engine)?;
        if object.len() != 3 || reply["id"] != id {
            return Err(BridgeError::engine());
        }
        match reply["ok"].as_bool() {
            Some(true) if object.contains_key("value") => Ok(reply["value"].clone()),
            Some(false) if object.contains_key("error") => Err(BridgeError::denied()),
            _ => Err(BridgeError::engine()),
        }
    }

    pub fn stop(&self) -> Result<(), BridgeError> {
        let mut inner = self.inner.lock().map_err(|_| BridgeError::engine())?;
        inner
            .child
            .as_mut()
            .map(EngineChild::stop)
            .transpose()
            .map_err(|_| BridgeError::engine())?;
        inner.child = None;
        inner.closed = true;
        if let Some(channel) = inner.lifecycle.take() {
            let _ = channel.send(json!({"protocolVersion":1,"kind":"engine_exited","expected":true,"exitCode":null,"cleanupComplete":true}));
        }
        Ok(())
    }
}

fn caller(window: &WebviewWindow) -> Result<(), BridgeError> {
    if window.label() != "main" {
        return Err(BridgeError::denied());
    }
    let url = window.url().map_err(|_| BridgeError::denied())?;
    let packaged = ((url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost")))
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none();
    let development = cfg!(debug_assertions)
        && window
            .app_handle()
            .config()
            .build
            .dev_url
            .as_ref()
            .is_some_and(|expected| expected.origin() == url.origin());
    if !packaged && !development {
        return Err(BridgeError::denied());
    }
    Ok(())
}

fn opaque(value: &Value) -> bool {
    value.as_str().is_some_and(|value| {
        !value.is_empty()
            && !value
                .chars()
                .any(|c| c.is_whitespace() || c == '/' || c == '\\')
    })
}

fn matches_rule(value: &Value, rule: &Value) -> bool {
    if let Some(allowed) = rule.as_array() {
        return value.is_string() && allowed.contains(value);
    }
    match rule.as_str() {
        Some("id" | "ref") => opaque(value),
        Some("text") => value.as_str().is_some_and(|value| !value.trim().is_empty()),
        Some("uint") => value
            .as_u64()
            .is_some_and(|value| value <= 9_007_199_254_740_991),
        Some("refs" | "strings") => value
            .as_array()
            .is_some_and(|values| values.iter().all(opaque)),
        _ => false,
    }
}

fn valid_command(op: &str, value: &Value) -> bool {
    let Ok(spec) = serde_json::from_str::<Value>(PROTOCOL) else {
        return false;
    };
    let Some(command) = value.as_object() else {
        return false;
    };
    let fields = [
        "protocolVersion",
        "correlationId",
        "sessionId",
        "scopeId",
        "expectedConfigRevision",
        "expectedProfileRevision",
        "expectedPolicyRevision",
        "op",
        "payload",
    ];
    if command.len() != fields.len()
        || !fields.iter().all(|field| command.contains_key(*field))
        || value["protocolVersion"] != 1
        || value["op"] != op
    {
        return false;
    }
    if !["correlationId", "sessionId", "scopeId"]
        .iter()
        .all(|field| opaque(&value[*field]))
        || ![
            "expectedConfigRevision",
            "expectedProfileRevision",
            "expectedPolicyRevision",
        ]
        .iter()
        .all(|field| matches_rule(&value[*field], &json!("text")))
    {
        return false;
    }
    let Some(required) = spec["commands"][op].as_object() else {
        return false;
    };
    let Some(payload) = value["payload"].as_object() else {
        return false;
    };
    let optional = spec["optional"][op].as_object();
    required.iter().all(|(field, rule)| {
        payload
            .get(field)
            .is_some_and(|value| matches_rule(value, rule))
    }) && payload.iter().all(|(field, value)| {
        required
            .get(field)
            .or_else(|| optional.and_then(|rules| rules.get(field)))
            .is_some_and(|rule| matches_rule(value, rule))
    })
}

#[tauri::command]
pub async fn handshake(
    window: WebviewWindow,
    state: tauri::State<'_, BridgeState>,
    protocol_version: u32,
    on_lifecycle: Channel<Value>,
) -> Result<Value, BridgeError> {
    caller(&window)?;
    if protocol_version != 1 {
        return Err(BridgeError::denied());
    }
    state
        .inner
        .try_lock()
        .map_err(|_| BridgeError::denied())?
        .lifecycle = Some(on_lifecycle);
    let value = state.call("handshake", json!({"protocolVersion":1}))?;
    let spec: Value = serde_json::from_str(PROTOCOL).map_err(|_| BridgeError::engine())?;
    if value.as_object().is_none_or(|fields| fields.len() != 8)
        || value["schemaVersion"] != spec["schemaVersion"]
        || value["protocolVersion"] != spec["protocolVersion"]
        || value["engineProtocolVersion"] != 1
        || value["bridgeProtocolVersion"] != 1
        || value["piRevision"] != spec["piRevision"]
        || value["entryMode"] != spec["foundation"]["entryMode"]
        || value["disabledBuiltinExtensions"] != spec["foundation"]["disabledBuiltinExtensions"]
        || value["readiness"]
            != json!({"state":"unavailable","policy":false,"store":false,"receipts":false})
    {
        return Err(BridgeError::engine());
    }
    Ok(value)
}

#[tauri::command]
pub async fn send(
    window: WebviewWindow,
    state: tauri::State<'_, BridgeState>,
    op: String,
    payload: Value,
) -> Result<Value, BridgeError> {
    caller(&window)?;
    if !valid_command(&op, &payload) {
        return Err(BridgeError::denied());
    }
    let correlation = payload["correlationId"]
        .as_str()
        .unwrap_or("native-validation")
        .to_owned();
    state.call("send", payload).map_err(|mut error| {
        error.correlation_id = correlation;
        error
    })
}

#[tauri::command]
pub async fn cancel(
    window: WebviewWindow,
    state: tauri::State<'_, BridgeState>,
    session_id: String,
    reason: Option<String>,
) -> Result<Value, BridgeError> {
    caller(&window)?;
    if !opaque(&json!(session_id)) {
        return Err(BridgeError::denied());
    }
    state.call("cancel", json!({"sessionId":session_id,"reason":reason}))
}

#[tauri::command]
pub async fn subscribe(
    window: WebviewWindow,
    state: tauri::State<'_, BridgeState>,
    session_id: String,
    after_seq: u64,
    on_event: Channel<Value>,
    on_lifecycle: Channel<Value>,
) -> Result<Value, BridgeError> {
    caller(&window)?;
    if !opaque(&json!(session_id)) || after_seq > 9_007_199_254_740_991 {
        return Err(BridgeError::denied());
    }
    state
        .inner
        .try_lock()
        .map_err(|_| BridgeError::denied())?
        .lifecycle = Some(on_lifecycle);
    drop(on_event);
    state.call(
        "subscribe",
        json!({"sessionId":session_id,"afterSeq":after_seq}),
    )
}

#[tauri::command]
pub async fn dialog_select_workspace(window: WebviewWindow) -> Result<Value, BridgeError> {
    caller(&window)?;
    Err(BridgeError::denied())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_operations_reject_payload_authority_changes() {
        let command = json!({"protocolVersion":1,"correlationId":"request1","sessionId":"s1","scopeId":"w-demo","expectedConfigRevision":"cfg1","expectedProfileRevision":"profile1","expectedPolicyRevision":"policy1","op":"engine.restart","payload":{}});
        assert!(valid_command("engine.restart", &command));
        assert!(!valid_command("unknown", &command));
        let mut invalid = command.clone();
        invalid["payload"]["grant"] = json!(true);
        assert!(!valid_command("engine.restart", &invalid));
        invalid = command.clone();
        invalid["scopeId"] = json!("../outside");
        assert!(!valid_command("engine.restart", &invalid));
        invalid = command.clone();
        invalid["protocolVersion"] = json!(2);
        assert!(!valid_command("engine.restart", &invalid));
    }
}

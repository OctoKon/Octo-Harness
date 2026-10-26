#![cfg(windows)]

#[path = "../src/process.rs"]
mod process;

use process::EngineChild;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::os::windows::fs::MetadataExt;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use windows_sys::Win32::Foundation::{WAIT_OBJECT_0, WAIT_TIMEOUT};
use windows_sys::Win32::System::Threading::{
    OpenProcess, PROCESS_SYNCHRONIZE, WaitForSingleObject,
};

// These real Node endpoints qualify transport faults, never SDK or GUI readiness.
const HOST: &str = r#"
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
writeFileSync('../started.txt', String(process.pid));
let pending = Buffer.alloc(0);
process.stdin.on('data', chunk => {
  pending = Buffer.concat([pending, chunk]);
  while (pending.length >= 4) {
    const length = pending.readUInt32BE();
    if (pending.length < length + 4) break;
    const request = JSON.parse(pending.subarray(4, length + 4));
    pending = pending.subarray(length + 4);
    if (request.method === 'hang') continue;
    if (request.method === 'stale') request.id = 'stale';
    if (request.method === 'oversize') {
      const header = Buffer.alloc(4);
      header.writeUInt32BE(262144);
      process.stdout.write(header);
      continue;
    }
    let descendant;
    if (request.method === 'descendant') {
      descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: 'ignore'
      }).pid;
    }
    const payload = Buffer.from(JSON.stringify({
      id: request.id, ok: true, value: {
        pid: process.pid, descendant,
        ambient: !!process.env.SPLYCE_PROCESS_TEST_CANARY,
        nodeOptions: !!process.env.NODE_OPTIONS,
        keys: Object.keys(process.env)
      }
    }));
    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length);
    process.stdout.write(Buffer.concat([header, payload]));
  }
});
process.stdin.on('end', () => process.exit());
"#;

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn digest(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

fn file_digest(path: &Path) -> String {
    let mut file = fs::File::open(path).unwrap();
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).unwrap();
        if count == 0 {
            return hex(&hash.finalize());
        }
        hash.update(&buffer[..count]);
    }
}

fn selected_node() -> &'static (PathBuf, String) {
    static NODE: OnceLock<(PathBuf, String)> = OnceLock::new();
    NODE.get_or_init(|| {
        let node = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/engine/node.exe");
        let output = std::process::Command::new(&node)
            .arg("--version")
            .output()
            .expect("The selected packaged Node executable is required");
        assert!(
            output.status.success(),
            "Packaged Node version query failed"
        );
        assert_eq!(String::from_utf8(output.stdout).unwrap().trim(), "v24.22.1");
        let hash = file_digest(&node);
        (node, hash)
    })
}

struct Fixture {
    directory: PathBuf,
    temporary_base: PathBuf,
    owner: String,
    manifest: Vec<u8>,
    expected_digest: String,
}

impl Fixture {
    fn new() -> Self {
        let (node, node_digest) = selected_node();
        let temporary_base = fs::canonicalize(std::env::temp_dir()).unwrap();
        let owner = format!(
            "{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let directory = temporary_base.join(format!("splyce-process-transport-{owner}"));
        fs::create_dir(&directory).unwrap();
        fs::write(directory.join("owner.txt"), &owner).unwrap();
        let engine = directory.join("engine");
        fs::create_dir(&engine).unwrap();
        fs::copy(node, engine.join("node.exe")).unwrap();
        fs::write(engine.join("host.mjs"), HOST).unwrap();
        let manifest = serde_json::to_vec(&json!({
            "schemaVersion": 1,
            "piRevision": "d5b3de22d0e24a3e9c38a9410d3329b099717283",
            "files": [
                {"path": "node.exe", "sha256": node_digest},
                {"path": "host.mjs", "sha256": digest(HOST.as_bytes())}
            ]
        }))
        .unwrap();
        fs::write(engine.join("manifest.json"), &manifest).unwrap();
        let expected_digest = digest(&manifest);
        Self {
            directory,
            temporary_base,
            owner,
            manifest,
            expected_digest,
        }
    }

    fn engine(&self) -> PathBuf {
        self.directory.join("engine")
    }

    fn spawn(&self) -> EngineChild {
        EngineChild::spawn(&self.engine(), &self.expected_digest).unwrap()
    }

    fn cleanup(&self) -> std::io::Result<()> {
        let metadata = fs::symlink_metadata(&self.directory)?;
        if metadata.file_attributes() & 0x400 != 0
            || fs::canonicalize(&self.directory)? != self.directory
            || self.directory.parent() != Some(self.temporary_base.as_path())
            || fs::read_to_string(self.directory.join("owner.txt"))? != self.owner
        {
            return Err(std::io::Error::other(
                "Fixture cleanup ownership did not match",
            ));
        }
        fs::remove_dir_all(&self.directory)
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        if let Err(error) = self.cleanup() {
            if std::thread::panicking() {
                eprintln!("Fixture cleanup failed: {}", error.kind());
            } else {
                panic!("Fixture cleanup failed: {}", error.kind());
            }
        }
    }
}

fn observed_process(pid: &Value) -> OwnedHandle {
    let pid = u32::try_from(pid.as_u64().unwrap()).unwrap();
    // SAFETY: a successfully opened process handle is transferred to one OwnedHandle.
    let handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };
    assert!(!handle.is_null(), "Expected a live observed process");
    unsafe { OwnedHandle::from_raw_handle(handle) }
}

fn assert_running(process: &OwnedHandle) {
    // SAFETY: the process is owned; a zero timeout only observes its exit state.
    assert_eq!(
        unsafe { WaitForSingleObject(process.as_raw_handle(), 0) },
        WAIT_TIMEOUT
    );
}

fn assert_exited(process: &OwnedHandle) {
    // SAFETY: the process is owned and the wait has a finite deadline.
    assert_eq!(
        unsafe { WaitForSingleObject(process.as_raw_handle(), 5000) },
        WAIT_OBJECT_0
    );
}

#[test]
fn real_node_transport_environment_and_descendant_cleanup() {
    let fixture = Fixture::new();
    let mut child = fixture.spawn();
    let reply = child
        .request(&json!({"id": "one", "method": "descendant", "params": {}}))
        .unwrap();
    assert_eq!(reply["value"]["pid"], child.pid());
    assert_eq!(reply["value"]["ambient"], false);
    assert_eq!(reply["value"]["nodeOptions"], false);
    assert_eq!(reply["value"]["keys"], json!(["SystemRoot"]));
    let descendant = observed_process(&reply["value"]["descendant"]);
    assert_running(&descendant);
    child.stop().unwrap();
    assert_exited(&descendant);
    assert!(!child.is_running());
    child.stop().unwrap();
}

#[test]
fn oversized_child_frame_fails_and_reaps() {
    let fixture = Fixture::new();
    let mut child = fixture.spawn();
    let started = Instant::now();
    let error = child
        .request(&json!({"id": "one", "method": "oversize", "params": {}}))
        .unwrap_err();
    assert_eq!(error.code, "ENGINE_FRAME");
    assert!(started.elapsed() < Duration::from_secs(6));
    assert!(!child.is_running());
}

#[test]
fn stale_reply_is_rejected_and_reaped() {
    let fixture = Fixture::new();
    let mut child = fixture.spawn();
    let error = child
        .request(&json!({"id": "current", "method": "stale", "params": {}}))
        .unwrap_err();
    assert_eq!(error.code, "ENGINE_FRAME");
    assert!(!child.is_running());
}

#[test]
fn unresponsive_child_times_out_and_reaps() {
    let fixture = Fixture::new();
    let mut child = fixture.spawn();
    let started = Instant::now();
    let error = child
        .request(&json!({"id": "one", "method": "hang", "params": {}}))
        .unwrap_err();
    assert_eq!(error.code, "ENGINE_TIMEOUT");
    assert!(started.elapsed() >= Duration::from_secs(10));
    assert!(started.elapsed() < Duration::from_secs(16));
    assert!(!child.is_running());
}

struct FixtureParent(std::process::Child);

impl Drop for FixtureParent {
    fn drop(&mut self) {
        if self.0.try_wait().unwrap().is_none() {
            self.0.kill().unwrap();
            self.0.wait().unwrap();
        }
    }
}

#[test]
fn parent_termination_reaps_engine_and_descendant() {
    if let Some(root) = std::env::var_os("SPLYCE_PROCESS_CHILD_FIXTURE") {
        assert_eq!(
            std::env::var("SPLYCE_PROCESS_TEST_CANARY").unwrap(),
            "synthetic-canary"
        );
        let root = PathBuf::from(root);
        let expected = std::env::var("SPLYCE_PROCESS_CHILD_DIGEST").unwrap();
        let mut child = EngineChild::spawn(&root.join("engine"), &expected).unwrap();
        let reply = child
            .request(&json!({"id": "one", "method": "descendant", "params": {}}))
            .unwrap();
        let report = root.join("observed.pending");
        fs::write(&report, serde_json::to_vec(&reply).unwrap()).unwrap();
        fs::rename(report, root.join("observed.json")).unwrap();
        loop {
            std::thread::park();
        }
    }
    let fixture = Fixture::new();
    let mut parent = FixtureParent(
        std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "parent_termination_reaps_engine_and_descendant",
                "--nocapture",
                "--test-threads=1",
            ])
            .env("SPLYCE_PROCESS_CHILD_FIXTURE", &fixture.directory)
            .env("SPLYCE_PROCESS_CHILD_DIGEST", &fixture.expected_digest)
            .env("SPLYCE_PROCESS_TEST_CANARY", "synthetic-canary")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap(),
    );
    let report = fixture.directory.join("observed.json");
    let deadline = Instant::now() + Duration::from_secs(25);
    while !report.is_file() {
        assert!(
            parent.0.try_wait().unwrap().is_none(),
            "Fixture parent exited before reporting its children"
        );
        assert!(
            Instant::now() < deadline,
            "Fixture parent did not report before its deadline"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    let reply: Value = serde_json::from_slice(&fs::read(report).unwrap()).unwrap();
    assert_eq!(reply["value"]["ambient"], false);
    assert_eq!(reply["value"]["keys"], json!(["SystemRoot"]));
    let engine = observed_process(&reply["value"]["pid"]);
    let descendant = observed_process(&reply["value"]["descendant"]);
    assert_running(&engine);
    assert_running(&descendant);
    parent.0.kill().unwrap();
    parent.0.wait().unwrap();
    assert_exited(&engine);
    assert_exited(&descendant);
}

#[test]
fn tampered_files_and_self_consistent_manifest_never_launch() {
    let fixture = Fixture::new();
    let changed_host = format!("{HOST}\n");
    fs::write(fixture.engine().join("host.mjs"), &changed_host).unwrap();
    assert!(EngineChild::spawn(&fixture.engine(), &fixture.expected_digest).is_err());
    assert!(!fixture.directory.join("started.txt").exists());
    let mut changed_manifest: Value = serde_json::from_slice(&fixture.manifest).unwrap();
    changed_manifest["files"][1]["sha256"] = Value::String(digest(changed_host.as_bytes()));
    fs::write(
        fixture.engine().join("manifest.json"),
        serde_json::to_vec(&changed_manifest).unwrap(),
    )
    .unwrap();
    assert!(EngineChild::spawn(&fixture.engine(), &fixture.expected_digest).is_err());
    assert!(!fixture.directory.join("started.txt").exists());
    fs::write(fixture.engine().join("host.mjs"), HOST).unwrap();
    fs::write(fixture.engine().join("manifest.json"), &fixture.manifest).unwrap();
    let mut child = fixture.spawn();
    let reply = child
        .request(&json!({"id": "restored", "method": "ping", "params": {}}))
        .unwrap();
    assert_eq!(reply["id"], "restored");
    assert!(fixture.directory.join("started.txt").is_file());
    child.stop().unwrap();
}

#![cfg(windows)]

#[path = "../src/credentials.rs"]
mod credentials;

use credentials::{
    delete_owned, read_owned, write_generated, CredentialError, CredentialRef, MAX_SECRET_BYTES,
};
use std::ptr::null_mut;
use windows_sys::Win32::Security::Credentials::{
    CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
};

// Cleanup is restricted to references created by this test process, including on assertion unwind.
#[derive(Default)]
struct Fixtures(Vec<CredentialRef>);

impl Fixtures {
    fn write(&mut self, value: &str) -> &CredentialRef {
        self.0
            .push(write_generated(value).expect("Isolated fixture creation"));
        self.0.last().unwrap()
    }
}

impl Drop for Fixtures {
    fn drop(&mut self) {
        for reference in &self.0 {
            match delete_owned(reference) {
                Ok(()) | Err(CredentialError::NotFound) => {}
                Err(error) => eprintln!("Isolated credential cleanup failed: {error}"),
            }
        }
    }
}

fn assert_rejected_secret(value: &str) {
    match write_generated(value) {
        Err(error) => assert_eq!(error, CredentialError::InvalidSecret),
        Ok(reference) => {
            delete_owned(&reference).expect("Rejected-input fixture cleanup");
            panic!("Invalid credential value was accepted");
        }
    }
}

fn fixture_target(reference: &CredentialRef) -> Vec<u16> {
    let id = reference
        .as_str()
        .strip_prefix("splyce-credential:v1:")
        .unwrap();
    assert_eq!(id.len(), 64);
    format!("Splyce/credentials/v1/{id}")
        .encode_utf16()
        .chain(Some(0))
        .collect()
}

#[test]
fn real_windows_roundtrip_rotation_and_cleanup() {
    let mut fixtures = Fixtures::default();
    let original = fixtures.write("synthetic-密钥-🔐").clone();
    let rotated = fixtures.write("synthetic-rotated-λ").clone();
    assert!(original.as_str() != rotated.as_str());
    assert!(CredentialRef::parse(original.as_str()).is_ok());
    assert!(read_owned(&original).unwrap().as_str() == "synthetic-密钥-🔐");
    assert!(read_owned(&rotated).unwrap().as_bytes() == "synthetic-rotated-λ".as_bytes());
    delete_owned(&original).unwrap();
    assert!(matches!(
        read_owned(&original),
        Err(CredentialError::NotFound)
    ));
    assert_eq!(delete_owned(&original), Err(CredentialError::NotFound));
    assert!(read_owned(&rotated).is_ok());
    delete_owned(&rotated).unwrap();
    assert!(matches!(
        read_owned(&rotated),
        Err(CredentialError::NotFound)
    ));
}

#[test]
fn real_windows_exact_blob_byte_boundaries() {
    assert_eq!(MAX_SECRET_BYTES, 2560);
    let mut fixtures = Fixtures::default();
    for value in [
        "x".to_owned(),
        "x".repeat(MAX_SECRET_BYTES),
        "é".repeat(MAX_SECRET_BYTES / 2),
    ] {
        let reference = fixtures.write(&value);
        assert!(read_owned(reference).unwrap().as_bytes() == value.as_bytes());
        delete_owned(reference).unwrap();
    }
    for value in [
        "x".repeat(MAX_SECRET_BYTES + 1),
        "é".repeat(MAX_SECRET_BYTES / 2 + 1),
    ] {
        assert_rejected_secret(&value);
    }
}

#[test]
fn rejected_secret_input_never_returns_a_reference() {
    for value in [
        "",
        "synthetic\0value",
        "synthetic\rvalue",
        "synthetic\nvalue",
        "synthetic\tvalue",
        "synthetic\u{7f}value",
        "synthetic\u{85}value",
    ] {
        assert_rejected_secret(value);
    }
}

#[test]
fn real_windows_owned_namespace_metadata_and_invalid_blob() {
    let mut fixtures = Fixtures::default();
    let reference = fixtures.write("synthetic-metadata");
    let mut target = fixture_target(reference);
    let mut native = null_mut();
    // This independently addresses only the isolated fixture just created above.
    assert_ne!(
        unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut native) },
        0
    );
    assert!(!native.is_null());
    // Copy non-secret metadata and free before any assertions can unwind.
    let (kind, persistence, length) = unsafe {
        let fields = (
            (*native).Type,
            (*native).Persist,
            (*native).CredentialBlobSize,
        );
        CredFree(native.cast());
        fields
    };
    assert_eq!(kind, CRED_TYPE_GENERIC);
    assert_eq!(persistence, CRED_PERSIST_LOCAL_MACHINE);
    assert_eq!(length, "synthetic-metadata".len() as u32);

    for mut blob in [vec![0xff], vec![b'x', 0, b'y'], Vec::new()] {
        let credential = CREDENTIALW {
            Type: CRED_TYPE_GENERIC,
            TargetName: target.as_mut_ptr(),
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_mut_ptr(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            ..CREDENTIALW::default()
        };
        assert_ne!(unsafe { CredWriteW(&credential, 0) }, 0);
        assert!(matches!(
            read_owned(reference),
            Err(CredentialError::CorruptCredential)
        ));
    }
    delete_owned(reference).unwrap();
}

#[test]
fn references_only_accept_canonical_opaque_ids() {
    // Parsing tests perform no facility reads/deletes and never address user credentials.
    let id = "ab01".repeat(16);
    let canonical = format!("splyce-credential:v1:{id}");
    assert!(CredentialRef::parse(&canonical).unwrap().as_str() == canonical);
    for rejected in [
        "".to_owned(),
        id.clone(),
        format!("Splyce/credentials/v1/{id}"),
        format!("splyce-credential:v2:{id}"),
        format!("splyce-credential:v1:{}", id.to_uppercase()),
        format!("splyce-credential:v1:{}", &id[..63]),
        format!("{canonical}0"),
        format!("{canonical}\0"),
        format!("{canonical}/suffix"),
        format!("splyce-credential:v1:{}g", &id[..63]),
    ] {
        assert!(matches!(
            CredentialRef::parse(&rejected),
            Err(CredentialError::InvalidReference)
        ));
    }
}

#[test]
fn diagnostics_are_fixed_and_do_not_contain_input() {
    for error in [
        CredentialError::InvalidReference,
        CredentialError::InvalidSecret,
        CredentialError::NotFound,
        CredentialError::AccessDenied,
        CredentialError::Unavailable,
        CredentialError::PlatformFailure,
        CredentialError::CorruptCredential,
    ] {
        assert!(error.to_string().len() < 64);
        assert!(!error.to_string().contains("splyce-credential:"));
    }
}

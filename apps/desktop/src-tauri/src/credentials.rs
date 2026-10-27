//! Current-user Windows credentials; callers own admission and reference persistence.
#![cfg(windows)]

use std::fmt;
use std::ptr::{null_mut, write_volatile};
use std::sync::atomic::{Ordering, compiler_fence};
use windows_sys::Win32::Foundation::{
    ERROR_ACCESS_DENIED, ERROR_NO_SUCH_LOGON_SESSION, ERROR_NO_TOKEN, ERROR_NOT_FOUND, GetLastError,
};
use windows_sys::Win32::Security::Credentials::{
    CRED_MAX_CREDENTIAL_BLOB_SIZE, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC, CREDENTIALW,
    CredDeleteW, CredFree, CredReadW, CredWriteW,
};
use windows_sys::Win32::Security::Cryptography::{
    BCRYPT_USE_SYSTEM_PREFERRED_RNG, BCryptGenRandom,
};

const REFERENCE_PREFIX: &str = "splyce-credential:v1:";
const TARGET_PREFIX: &str = "Splyce/credentials/v1/";
const ID_BYTES: usize = 32;
pub const MAX_SECRET_BYTES: usize = CRED_MAX_CREDENTIAL_BLOB_SIZE as usize;

#[derive(Clone, PartialEq, Eq)]
pub struct CredentialRef(String);

impl CredentialRef {
    pub fn parse(value: &str) -> Result<Self, CredentialError> {
        let id = value
            .strip_prefix(REFERENCE_PREFIX)
            .ok_or(CredentialError::InvalidReference)?;
        if id.len() != ID_BYTES * 2
            || !id
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(CredentialError::InvalidReference);
        }
        Ok(Self(value.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    fn target(&self) -> Vec<u16> {
        TARGET_PREFIX
            .encode_utf16()
            .chain(self.0[REFERENCE_PREFIX.len()..].encode_utf16())
            .chain(Some(0))
            .collect()
    }
}

/// Explicitly borrowed secret bytes; intentionally neither Debug nor Serialize nor Clone.
pub struct SecretBuffer(Vec<u8>);

impl SecretBuffer {
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }

    pub fn as_str(&self) -> &str {
        // Construction accepts only validated UTF-8 and there is no mutable access.
        std::str::from_utf8(&self.0).expect("Validated credential encoding")
    }
}

impl Drop for SecretBuffer {
    fn drop(&mut self) {
        wipe(&mut self.0);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CredentialError {
    InvalidReference,
    InvalidSecret,
    NotFound,
    AccessDenied,
    Unavailable,
    PlatformFailure,
    CorruptCredential,
}

impl fmt::Display for CredentialError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::InvalidReference => "Invalid credential reference",
            Self::InvalidSecret => "Invalid credential value",
            Self::NotFound => "Credential unavailable",
            Self::AccessDenied => "Credential access denied",
            Self::Unavailable => "Credential facility unavailable",
            Self::PlatformFailure => "Credential operation failed",
            Self::CorruptCredential => "Invalid stored credential",
        })
    }
}

impl std::error::Error for CredentialError {}

fn validate_secret(secret: &str) -> Result<(), CredentialError> {
    if secret.is_empty() || secret.len() > MAX_SECRET_BYTES || secret.chars().any(char::is_control)
    {
        return Err(CredentialError::InvalidSecret);
    }
    Ok(())
}

fn last_error() -> CredentialError {
    // Read immediately after the failed Windows call, before any other OS operation.
    match unsafe { GetLastError() } {
        ERROR_NOT_FOUND => CredentialError::NotFound,
        ERROR_ACCESS_DENIED => CredentialError::AccessDenied,
        ERROR_NO_SUCH_LOGON_SESSION | ERROR_NO_TOKEN => CredentialError::Unavailable,
        _ => CredentialError::PlatformFailure,
    }
}

/// Always creates a fresh reference; rotating callers retain the old reference until committed.
pub fn write_generated(secret: &str) -> Result<CredentialRef, CredentialError> {
    validate_secret(secret)?;
    let mut id = [0_u8; ID_BYTES];
    // Null algorithm with this flag selects Windows' system-preferred cryptographic RNG.
    let status = unsafe {
        BCryptGenRandom(
            null_mut(),
            id.as_mut_ptr(),
            ID_BYTES as u32,
            BCRYPT_USE_SYSTEM_PREFERRED_RNG,
        )
    };
    if status < 0 {
        return Err(CredentialError::Unavailable);
    }
    let mut reference = String::with_capacity(REFERENCE_PREFIX.len() + ID_BYTES * 2);
    reference.push_str(REFERENCE_PREFIX);
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for byte in id {
        reference.push(HEX[(byte >> 4) as usize] as char);
        reference.push(HEX[(byte & 15) as usize] as char);
    }
    let reference = CredentialRef(reference);
    let mut target = reference.target();
    let mut secret = SecretBuffer(secret.as_bytes().to_vec());
    let credential = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: target.as_mut_ptr(),
        CredentialBlobSize: secret.0.len() as u32,
        CredentialBlob: secret.0.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        ..CREDENTIALW::default()
    };
    // All referenced buffers remain alive through the synchronous call.
    if unsafe { CredWriteW(&credential, 0) } == 0 {
        return Err(last_error());
    }
    Ok(reference)
}

struct NativeCredential(*mut CREDENTIALW);

impl Drop for NativeCredential {
    fn drop(&mut self) {
        // CredReadW owns this allocation, including its nested blob, until CredFree.
        unsafe {
            let credential = &*self.0;
            if !credential.CredentialBlob.is_null()
                && credential.CredentialBlobSize as usize <= MAX_SECRET_BYTES
            {
                wipe(std::slice::from_raw_parts_mut(
                    credential.CredentialBlob,
                    credential.CredentialBlobSize as usize,
                ));
            }
            CredFree(self.0.cast());
        }
    }
}

pub fn read_owned(reference: &CredentialRef) -> Result<SecretBuffer, CredentialError> {
    let target = reference.target();
    let mut pointer = null_mut();
    // Windows returns a single allocation freed by NativeCredential on every exit path.
    if unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut pointer) } == 0 {
        return Err(last_error());
    }
    if pointer.is_null() {
        return Err(CredentialError::CorruptCredential);
    }
    let native = NativeCredential(pointer);
    let credential = unsafe { &*native.0 };
    let length = credential.CredentialBlobSize as usize;
    if credential.Type != CRED_TYPE_GENERIC
        || credential.Persist != CRED_PERSIST_LOCAL_MACHINE
        || length == 0
        || length > MAX_SECRET_BYTES
        || credential.CredentialBlob.is_null()
    {
        return Err(CredentialError::CorruptCredential);
    }
    let bytes = unsafe { std::slice::from_raw_parts(credential.CredentialBlob, length) };
    let secret = std::str::from_utf8(bytes).map_err(|_| CredentialError::CorruptCredential)?;
    validate_secret(secret).map_err(|_| CredentialError::CorruptCredential)?;
    Ok(SecretBuffer(bytes.to_vec()))
}

pub fn delete_owned(reference: &CredentialRef) -> Result<(), CredentialError> {
    let target = reference.target();
    if unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) } == 0 {
        return Err(last_error());
    }
    Ok(())
}

fn wipe(bytes: &mut [u8]) {
    // Best effort for these owned buffers only; OS/caller/compiler copies may remain.
    for byte in bytes {
        unsafe { write_volatile(byte, 0) };
    }
    compiler_fence(Ordering::SeqCst);
}

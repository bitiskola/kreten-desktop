use crate::{model::State, Error, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use fs2::FileExt;
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use zeroize::Zeroizing;

const MAGIC: &[u8] = b"KRETEN-DESKTOP-1\0";

pub(crate) struct Storage {
    directory: PathBuf,
    key: Zeroizing<[u8; 32]>,
    pub mode: String,
    _lock: File,
}

fn private_options() -> OpenOptions {
    let mut options = OpenOptions::new();
    options.read(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
}

fn private_directory(path: &Path) -> Result<()> {
    fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

impl Storage {
    pub fn open(directory: impl AsRef<Path>) -> Result<Self> {
        let directory = directory.as_ref();
        private_directory(directory)?;
        let lock = private_options()
            .create(true)
            .truncate(false)
            .open(directory.join("store.lock"))?;
        lock.try_lock_exclusive()
            .map_err(|_| Error::AlreadyRunning)?;
        let directory = directory.canonicalize()?;
        let marker = directory.join("key-storage");
        let mode = fs::read_to_string(&marker).ok();
        let name = format!(
            "local-store-{:x}",
            Sha256::digest(directory.to_string_lossy().as_bytes())
        );
        let entry = keyring::Entry::new("app.kreten.desktop", &name).map_err(|_| Error::Keyring);
        let mut key = [0u8; 32];
        let selected_mode;
        if mode.as_deref() == Some("file") {
            let stored = fs::read(directory.join("store.key"))?;
            if stored.len() != 32 {
                return Err(Error::Storage);
            }
            key.copy_from_slice(&stored);
            selected_mode = "file";
        } else {
            let secret = entry.as_ref().ok().map(|e| e.get_password());
            match secret {
                Some(Ok(secret)) => {
                    let decoded =
                        Zeroizing::new(STANDARD.decode(secret).map_err(|_| Error::Keyring)?);
                    if decoded.len() != 32 {
                        return Err(Error::Keyring);
                    }
                    key.copy_from_slice(&decoded);
                    selected_mode = "keyring";
                }
                _ if mode.is_some() || directory.join("store.enc").exists() => {
                    return Err(Error::Keyring)
                }
                _ => {
                    rand::rngs::OsRng.fill_bytes(&mut key);
                    if entry
                        .as_ref()
                        .is_ok_and(|e| e.set_password(&STANDARD.encode(key)).is_ok())
                    {
                        selected_mode = "keyring";
                    } else {
                        // Headless Unix desktops may have no Secret Service. The fallback is
                        // explicitly disclosed: it protects against other OS users, not malware
                        // running as the same user. Windows never falls back to an unprotected key.
                        #[cfg(unix)]
                        {
                            let mut file = private_options()
                                .create_new(true)
                                .open(directory.join("store.key"))?;
                            file.write_all(&key)?;
                            file.sync_all()?;
                            selected_mode = "file";
                        }
                        #[cfg(not(unix))]
                        {
                            return Err(Error::Keyring);
                        }
                    }
                }
            }
        }
        atomic_write(&directory, "key-storage", selected_mode.as_bytes())?;
        Ok(Self {
            directory,
            key: Zeroizing::new(key),
            mode: selected_mode.into(),
            _lock: lock,
        })
    }

    pub fn read(&self) -> Result<State> {
        let path = self.directory.join("store.enc");
        if !path.exists() {
            return Ok(State::default());
        }
        let bytes = fs::read(path)?;
        if !bytes.starts_with(MAGIC) || bytes.len() < MAGIC.len() + 24 + 16 {
            return Err(Error::Storage);
        }
        let cipher = XChaCha20Poly1305::new((&*self.key).into());
        let nonce = XNonce::from_slice(&bytes[MAGIC.len()..MAGIC.len() + 24]);
        let plaintext = Zeroizing::new(
            cipher
                .decrypt(
                    nonce,
                    Payload {
                        msg: &bytes[MAGIC.len() + 24..],
                        aad: MAGIC,
                    },
                )
                .map_err(|_| Error::Storage)?,
        );
        serde_json::from_slice(&plaintext).map_err(|_| Error::Storage)
    }

    pub fn write(&self, state: &State) -> Result<()> {
        let plaintext = Zeroizing::new(serde_json::to_vec(state).map_err(|_| Error::Storage)?);
        let cipher = XChaCha20Poly1305::new((&*self.key).into());
        let mut nonce = [0u8; 24];
        rand::rngs::OsRng.fill_bytes(&mut nonce);
        let ciphertext = cipher
            .encrypt(
                XNonce::from_slice(&nonce),
                Payload {
                    msg: &plaintext,
                    aad: MAGIC,
                },
            )
            .map_err(|_| Error::Storage)?;
        let mut bytes = MAGIC.to_vec();
        bytes.extend_from_slice(&nonce);
        bytes.extend_from_slice(&ciphertext);
        atomic_write(&self.directory, "store.enc", &bytes)
    }

    #[cfg(test)]
    pub fn for_test(directory: &Path, key: [u8; 32]) -> Self {
        private_directory(directory).unwrap();
        let lock = private_options()
            .create(true)
            .truncate(false)
            .open(directory.join("store.lock"))
            .unwrap();
        lock.try_lock_exclusive().unwrap();
        Self {
            directory: directory.to_path_buf(),
            key: Zeroizing::new(key),
            mode: "test".into(),
            _lock: lock,
        }
    }
}

fn atomic_write(directory: &Path, name: &str, bytes: &[u8]) -> Result<()> {
    let mut file = tempfile::NamedTempFile::new_in(directory)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.as_file()
            .set_permissions(fs::Permissions::from_mode(0o600))?;
    }
    file.write_all(bytes)?;
    file.as_file().sync_all()?;
    file.persist(directory.join(name))
        .map_err(|_| Error::Storage)?;
    #[cfg(unix)]
    {
        File::open(directory)?.sync_all()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn encrypted_store_roundtrips_and_authenticates_every_byte() {
        let temp = tempfile::tempdir().unwrap();
        let store = Storage::for_test(temp.path(), [3; 32]);
        let state = State {
            active_account_id: Some("PRIVATE-STUDENT-MARKER".into()),
            ..State::default()
        };
        store.write(&state).unwrap();
        assert_eq!(
            store.read().unwrap().active_account_id,
            state.active_account_id
        );
        let mut bytes = fs::read(temp.path().join("store.enc")).unwrap();
        assert!(!String::from_utf8_lossy(&bytes).contains("PRIVATE-STUDENT-MARKER"));
        *bytes.last_mut().unwrap() ^= 1;
        fs::write(temp.path().join("store.enc"), bytes).unwrap();
        assert!(matches!(store.read(), Err(Error::Storage)));
    }
    #[cfg(unix)]
    #[test]
    fn permissions_are_private() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let store = Storage::for_test(temp.path(), [3; 32]);
        store.write(&State::default()).unwrap();
        assert_eq!(
            fs::metadata(temp.path()).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(temp.path().join("store.enc"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
}

use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("Nincs bejelentkezett fiók.")]
    NoAccount,
    #[error("A munkamenet lejárt. Jelentkezz be újra.")]
    Authentication,
    #[error("Érvénytelen vagy lejárt bejelentkezési kérés.")]
    Login,
    #[error("Érvénytelen intézménykód.")]
    Institution,
    #[error("Érvénytelen kérés: {0}")]
    Invalid(&'static str),
    #[error("A KRÉTA szolgáltatása jelenleg nem érhető el.")]
    Network,
    #[error("A KRÉTA elutasította a kérést (HTTP {0}).")]
    Http(u16),
    #[error("A KRÉTA válasza nem feldolgozható.")]
    Response,
    #[error("A helyi adatok nem olvashatók vagy írhatók.")]
    Storage,
    #[error("A titkosított tároló kulcsa nem érhető el. Oldd fel a rendszer kulcstartóját.")]
    Keyring,
    #[error("A KRETÉN Desktop már használja ezt az adattárolót.")]
    AlreadyRunning,
}

pub type Result<T> = std::result::Result<T, Error>;

impl From<std::io::Error> for Error {
    fn from(_: std::io::Error) -> Self {
        Self::Storage
    }
}
impl From<serde_json::Error> for Error {
    fn from(_: serde_json::Error) -> Self {
        Self::Response
    }
}
impl From<reqwest::Error> for Error {
    fn from(_: reqwest::Error) -> Self {
        Self::Network
    }
}

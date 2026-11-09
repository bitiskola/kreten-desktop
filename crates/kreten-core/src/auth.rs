// OAuth flow and constants adapted from Firka, QwIT Development, CC BY-NC-SA 4.0.
use crate::{Error, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::Utc;
use rand::RngCore;
use serde::Serialize;
use sha2::{Digest, Sha256};
use url::Url;

pub const CLIENT_ID: &str = "kreta-ellenorzo-student-mobile-android";
pub const REDIRECT_URI: &str = "https://mobil.e-kreta.hu/ellenorzo-student/prod/oauthredirect";
pub const SCOPES: &str = "openid email offline_access kreta-ellenorzo-webapi.public kreta-eugyintezes-webapi.public kreta-fileservice-webapi.public kreta-mobile-global-webapi.public kreta-dkt-webapi.public kreta-ier-webapi.public";
pub const USER_AGENT: &str = "hu.ekreta.student/5.15.0/KRETENDesktop/13/33";
pub const API_KEY: &str = "21ff6c25-d1da-4a68-a811-c881a6057463";

#[derive(Clone, Debug, Serialize)]
pub struct LoginAttempt {
    pub id: String,
    pub url: String,
}

pub(crate) struct PendingLogin {
    pub id: String,
    pub state: String,
    pub nonce: String,
    pub verifier: String,
    pub created_at: i64,
}

pub(crate) fn random_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn validate_institution(value: &str) -> Result<String> {
    let value = value.trim().to_ascii_lowercase();
    if value.is_empty()
        || value.len() > 63
        || !value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-')
        || !value.as_bytes()[0].is_ascii_alphanumeric()
        || !value.as_bytes()[value.len() - 1].is_ascii_alphanumeric()
    {
        return Err(Error::Institution);
    }
    Ok(value)
}

impl PendingLogin {
    pub fn new(
        idp: &str,
        username: Option<&str>,
        institution: Option<&str>,
    ) -> Result<(Self, LoginAttempt)> {
        let pending = Self {
            id: random_token(),
            state: random_token(),
            nonce: random_token(),
            verifier: random_token(),
            created_at: Utc::now().timestamp(),
        };
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(pending.verifier.as_bytes()));
        let mut authorize =
            Url::parse(&format!("{idp}/connect/authorize/callback")).map_err(|_| Error::Login)?;
        authorize.query_pairs_mut().extend_pairs([
            ("redirect_uri", REDIRECT_URI),
            ("client_id", CLIENT_ID),
            ("response_type", "code"),
            ("prompt", "login"),
            ("state", pending.state.as_str()),
            ("nonce", pending.nonce.as_str()),
            ("scope", SCOPES),
            ("code_challenge", challenge.as_str()),
            ("code_challenge_method", "S256"),
            ("suppressed_prompt", "login"),
        ]);
        if let Some(username) = username {
            authorize
                .query_pairs_mut()
                .append_pair("login_hint", username);
        }
        if let Some(institution) = institution {
            authorize
                .query_pairs_mut()
                .append_pair("institute_code", &validate_institution(institution)?);
        }
        let return_url = format!(
            "{}?{}",
            authorize.path(),
            authorize.query().unwrap_or_default()
        );
        let mut url = Url::parse(&format!("{idp}/Account/Login")).map_err(|_| Error::Login)?;
        url.query_pairs_mut().append_pair("ReturnUrl", &return_url);
        let public = LoginAttempt {
            id: pending.id.clone(),
            url: url.to_string(),
        };
        Ok((pending, public))
    }

    pub fn code(&self, id: &str, redirect: &str) -> Result<String> {
        if self.id != id || Utc::now().timestamp() - self.created_at > 15 * 60 {
            return Err(Error::Login);
        }
        let url = Url::parse(redirect).map_err(|_| Error::Login)?;
        let expected = Url::parse(REDIRECT_URI).unwrap();
        if url.scheme() != expected.scheme()
            || url.host_str() != expected.host_str()
            || url.port_or_known_default() != expected.port_or_known_default()
            || url.path() != expected.path()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.fragment().is_some()
        {
            return Err(Error::Login);
        }
        let pairs: Vec<_> = url.query_pairs().collect();
        let states: Vec<_> = pairs.iter().filter(|(k, _)| k == "state").collect();
        let codes: Vec<_> = pairs.iter().filter(|(k, _)| k == "code").collect();
        if states.len() != 1
            || states[0].1 != self.state
            || codes.len() != 1
            || codes[0].1.is_empty()
            || pairs.iter().any(|(k, _)| k == "error")
        {
            return Err(Error::Login);
        }
        Ok(codes[0].1.to_string())
    }
}

pub(crate) fn jwt_claims(token: &str) -> Result<serde_json::Value> {
    let parts: Vec<_> = token.split('.').collect();
    if parts.len() != 3 {
        return Err(Error::Response);
    }
    let bytes = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|_| Error::Response)?;
    serde_json::from_slice(&bytes).map_err(|_| Error::Response)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pkce_uses_unique_verifiers_and_firka_parameters() {
        let (pending, public) =
            PendingLogin::new("https://idp.e-kreta.hu", None, Some("school-a")).unwrap();
        let other = PendingLogin::new("https://idp.e-kreta.hu", None, None)
            .unwrap()
            .0;
        assert_ne!(pending.verifier, other.verifier);
        let login = Url::parse(&public.url).unwrap();
        let ret = login
            .query_pairs()
            .find(|(k, _)| k == "ReturnUrl")
            .unwrap()
            .1
            .into_owned();
        let callback = Url::parse(&format!("https://idp.e-kreta.hu{ret}")).unwrap();
        let pairs: std::collections::HashMap<_, _> = callback.query_pairs().collect();
        assert_eq!(pairs["redirect_uri"], REDIRECT_URI);
        assert_eq!(pairs["client_id"], CLIENT_ID);
        assert_eq!(
            pairs["code_challenge"],
            URL_SAFE_NO_PAD.encode(Sha256::digest(pending.verifier.as_bytes()))
        );
        assert_eq!(pairs["institute_code"], "school-a");
    }
    #[test]
    fn callback_rejects_host_state_duplicate_and_expired_attempts() {
        let (mut p, _) = PendingLogin::new("https://idp.e-kreta.hu", None, None).unwrap();
        let correct = format!("{REDIRECT_URI}?code=synthetic&state={}", p.state);
        assert_eq!(p.code(&p.id, &correct).unwrap(), "synthetic");
        for incorrect in [
            correct.replace("mobil.e-kreta.hu", "evil.example"),
            correct.replace(&p.state, "wrong"),
            format!("{correct}&state={}", p.state),
            correct.replace("https:", "http:"),
            format!("{correct}#fragment"),
        ] {
            assert!(p.code(&p.id, &incorrect).is_err());
        }
        p.created_at -= 901;
        assert!(p.code(&p.id, &correct).is_err());
    }
    #[test]
    fn school_codes_cannot_escape_official_domain() {
        for bad in [
            "", "../evil", "x.evil", "x:443", "x@evil", "-x", "x-", "árvíz",
        ] {
            assert!(validate_institution(bad).is_err());
        }
        assert_eq!(validate_institution(" SCHOOL-123 ").unwrap(), "school-123");
    }
}

// KRÉTA routes are derived from Firka and KRETEN. See docs/API.md and docs/UPSTREAM.md.
use crate::{
    auth::{API_KEY, USER_AGENT},
    Error, Result,
};
use futures_util::StreamExt;
use reqwest::{Client, Method, Response};
use serde_json::Value;
use std::time::Duration;

const MAX_JSON_BYTES: usize = 16 * 1024 * 1024;

pub(crate) struct Api {
    pub client: Client,
    pub idp: String,
    #[cfg(test)]
    pub override_base: Option<String>,
}

impl Api {
    pub fn new() -> Result<Self> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(25))
            .user_agent(USER_AGENT)
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        Ok(Self {
            client,
            idp: "https://idp.e-kreta.hu".into(),
            #[cfg(test)]
            override_base: None,
        })
    }

    pub fn school_url(&self, school: &str, path: &str) -> String {
        #[cfg(test)]
        if let Some(base) = &self.override_base {
            return format!("{base}{path}");
        }
        format!("https://{school}.e-kreta.hu{path}")
    }

    pub fn admin_url(&self, path: &str) -> String {
        #[cfg(test)]
        if let Some(base) = &self.override_base {
            return format!("{base}{path}");
        }
        format!("https://eugyintezes.e-kreta.hu{path}")
    }

    pub async fn token(&self, values: &[(&str, &str)]) -> Result<Value> {
        let response = self
            .client
            .post(format!("{}/connect/token", self.idp))
            .header("accept", "*/*")
            .form(values)
            .send()
            .await?;
        if [400, 401].contains(&response.status().as_u16()) {
            return Err(Error::Authentication);
        }
        json(response).await
    }

    pub async fn get(&self, url: &str, token: &str) -> Result<Value> {
        let mut request = self
            .client
            .get(url)
            .bearer_auth(token)
            .header("accept", "application/json");
        // KRÉTA's mailbox rejects the diary's mobile identification headers.
        // This route is fixed by our methods, not supplied by the frontend.
        if url::Url::parse(url).is_ok_and(|u| u.path().starts_with("/api/v1/kommunikacio/")) {
            request = request
                .header("user-agent", "KRETENDesktop/0.1")
                .header("X-Uzenet-Lokalizacio", "hu-HU");
        } else {
            request = request.header("apiKey", API_KEY);
        }
        json(request.send().await?).await
    }

    pub async fn change(
        &self,
        method: Method,
        url: &str,
        token: &str,
        body: Option<&Value>,
        form: bool,
    ) -> Result<()> {
        let mut request = self
            .client
            .request(method, url)
            .bearer_auth(token)
            .header("apiKey", API_KEY)
            .header("accept", "application/json");
        if let Some(body) = body {
            request = if form {
                request.form(body)
            } else {
                request.json(body)
            };
        }
        let response = request.send().await?;
        check_status(&response)
    }
}

pub(crate) fn check_status(response: &Response) -> Result<()> {
    match response.status().as_u16() {
        200..=299 => Ok(()),
        401 => Err(Error::Authentication),
        status => Err(Error::Http(status)),
    }
}

pub(crate) async fn json(response: Response) -> Result<Value> {
    let bytes = body_bytes(response, MAX_JSON_BYTES).await?;
    serde_json::from_slice(&bytes).map_err(|_| Error::Response)
}

pub(crate) async fn body_bytes(response: Response, limit: usize) -> Result<Vec<u8>> {
    check_status(&response)?;
    if response.content_length().is_some_and(|n| n > limit as u64) {
        return Err(Error::Response);
    }
    let mut bytes = Vec::new();
    let mut chunks = response.bytes_stream();
    while let Some(chunk) = chunks.next().await {
        let chunk = chunk?;
        if bytes.len() + chunk.len() > limit {
            return Err(Error::Response);
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

pub(crate) fn id(value: &str) -> Result<&str> {
    if value.is_empty()
        || value.len() > 160
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(Error::Invalid("azonosító"));
    }
    Ok(value)
}


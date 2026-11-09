use crate::{api, validate_institution, Core, Error, Result, School};
use chrono::Utc;
use scraper::{Html, Selector};
use std::{collections::BTreeMap, time::Duration};
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

fn search_key(value: &str) -> String {
    value
        .to_lowercase()
        .nfkd()
        .filter(|c| !is_combining_mark(*c))
        .collect()
}

impl Core {
    /// Official search service fallback; no passwords or tokens are sent here.
    pub async fn search_schools(&mut self, query: &str) -> Result<Vec<School>> {
        let query = query.trim().chars().take(150).collect::<String>();
        if query.chars().count() < 2 {
            return Ok(Vec::new());
        }
        let key = search_key(&query);
        if !self.state.schools.is_empty() {
            let matches: Vec<_> = self
                .state
                .schools
                .iter()
                .filter(|s| search_key(&format!("{} {} {}", s.name, s.code, s.city)).contains(&key))
                .take(100)
                .cloned()
                .collect();
            if !matches.is_empty() {
                return Ok(matches);
            }
        }
        if let Some((expires, rows)) = self.school_search_cache.get(&key) {
            if *expires > Utc::now().timestamp() {
                return Ok(rows.clone());
            }
        }
        let mut url = url::Url::parse("https://intezmenykereso.e-kreta.hu/instituteSelector/")
            .map_err(|_| Error::Response)?;
        url.path_segments_mut()
            .map_err(|_| Error::Response)?
            .pop_if_empty()
            .push(&query);
        url.query_pairs_mut().append_pair("showOnlyLive", "true");
        let response = self
            .api
            .client
            .get(url)
            .header("user-agent", "KRETENDesktop/0.1")
            .timeout(Duration::from_secs(8))
            .send()
            .await?;
        let bytes = api::body_bytes(response, 2 * 1024 * 1024).await?;
        let html = std::str::from_utf8(&bytes).map_err(|_| Error::Response)?;
        let schools = parse_selector(html)?;
        if self.school_search_cache.len() >= 128 {
            self.school_search_cache.clear();
        }
        self.school_search_cache
            .insert(key, (Utc::now().timestamp() + 3600, schools.clone()));
        Ok(schools)
    }
}

fn parse_selector(html: &str) -> Result<Vec<School>> {
    let document = Html::parse_fragment(html);
    let selector = Selector::parse("a[data-val]").map_err(|_| Error::Response)?;
    let mut schools = BTreeMap::new();
    for element in document.select(&selector).take(300) {
        let Some(code) = element
            .attr("data-val")
            .and_then(|c| validate_institution(c).ok())
        else {
            continue;
        };
        let text = element.text().collect::<Vec<_>>().join(" ");
        let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
        let name = text
            .rsplit_once('(')
            .map(|(name, _)| name.trim())
            .filter(|name| !name.is_empty())
            .unwrap_or(&text);
        schools.insert(
            code.clone(),
            School {
                name: if name.is_empty() {
                    code.clone()
                } else {
                    name.into()
                },
                code,
                city: String::new(),
            },
        );
    }
    let mut schools: Vec<_> = schools.into_values().collect();
    schools.sort_by_key(|s| search_key(&s.name));
    Ok(schools)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn official_selector_reads_text_but_never_accepts_arbitrary_hosts() {
        let rows = parse_selector("<a data-val='school-1'>Árvíztűrő <b>Iskola</b> (school-1 · 012345)</a><a data-val='evil.example'>Invalid</a><a data-val='school-2'>Másik &amp; Iskola</a>").unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].name, "Árvíztűrő Iskola");
        assert_eq!(rows[1].name, "Másik & Iskola");
        assert_eq!(search_key("ÁRVÍZTŰRŐ"), "arvizturo");
    }
}



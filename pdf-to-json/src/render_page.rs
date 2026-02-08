use indoc::formatdoc;
use serde::{Deserialize, Serialize};
use std::{fs::write, path::Path};

#[derive(Serialize, Deserialize)]
pub struct Project {
    pub pages: Vec<Page>,
}

#[derive(Serialize, Deserialize)]
pub struct Page {
    title: String,
    lines: Vec<String>,
}

#[derive(Debug, Clone, Copy)]
struct PageNum {
    prev: usize,
    next: usize,
}

pub fn save_json(file_path: &Path, project: &Project) -> Result<(), Box<dyn std::error::Error>> {
    let json_str = serde_json::to_string_pretty(project)?;
    write(file_path, json_str)?;
    Ok(())
}

pub fn render_page(
    index: usize,
    total_page_count: usize,
    gyazo_image_id: &str,
    ocr_text: &str,
) -> Page {
    let pad_length = format!("{}", total_page_count).len();

    let title = format!("{:0pad_length$}", index);
    let PageNum { prev, next } = page_num(index);
    let url = format!("https://gyazo.com/{}", gyazo_image_id);
    let ocr_lines = ocr_text
        .lines()
        .map(|line| format!("> {}", line))
        .collect::<Vec<_>>()
        .join("\n");

    let content = formatdoc! {"
        {title}
        prev: [{prev:0pad_length$}]
        next: [{next:0pad_length$}]
        [[{url}]]

        {ocr_lines}"
    };

    Page {
        title,
        lines: content.lines().map(|s| s.to_string()).collect(),
    }
}

fn page_num(current: usize) -> PageNum {
    PageNum {
        prev: if current == 0 { current } else { current - 1 },
        next: current + 1,
    }
}

pub async fn create_profile_page(
    cosense_profile_page: &str,
) -> Result<Page, Box<dyn std::error::Error>> {
    let page = fetch_page(cosense_profile_page).await?;
    Ok(Page {
        title: page.title,
        lines: page
            .lines
            .iter()
            .map(|line| line.text.clone())
            .collect::<Vec<_>>(),
    })
}

#[derive(Deserialize, Debug, Clone)]
struct PageDetail {
    title: String,
    lines: Vec<Line>,
    // and more...
}

#[derive(Deserialize, Debug, Clone)]
struct Line {
    text: String,
    // and more...
}

async fn fetch_page(cosense_profile_page: &str) -> Result<PageDetail, Box<dyn std::error::Error>> {
    let url = format!("https://scrapbox.io/api/pages/{cosense_profile_page}");
    let res = reqwest::get(url).await?;
    let page_detail = res.json::<PageDetail>().await?;
    Ok(page_detail)
}

use gyazo_api::upload::GyazoUploadOptions;
use std::{path::PathBuf, sync::Arc, time::Duration};
use tokio::time::sleep;

use crate::{
    config::Config,
    render_page::{render_page, Page},
};

pub async fn generate_page(
    config: Arc<Config>,
    index: usize,
    pdf_path: PathBuf,
    page_num: usize,
) -> Result<Page, Box<dyn std::error::Error>> {
    let gyazo_image_id = upload_image_with_retries(config.clone(), pdf_path, 5).await?;
    sleep(Duration::from_secs(10)).await;
    let ocr_text = fetch_ocr_text_with_retries(&config, &gyazo_image_id, 10).await?;

    let page = render_page(index, page_num, &gyazo_image_id, &ocr_text);
    Ok(page)
}

async fn upload_image_with_retries(
    config: Arc<Config>,
    pdf_path: PathBuf,
    max_attempts: usize,
) -> Result<String, Box<dyn std::error::Error>> {
    let options = GyazoUploadOptions::default();

    for attempt in 1..=max_attempts {
        match config.gyazo.upload(pdf_path.clone(), Some(&options)).await {
            Ok(response) => return Ok(response.image_id),
            Err(e) => {
                eprintln!("⚠️ Gyazo upload failed (attempt {attempt}/{max_attempts}): {e}",);
                if attempt < max_attempts {
                    sleep(Duration::from_secs(3)).await;
                }
            }
        }
    }

    Err("Failed to upload image to Gyazo after multiple attempts".into())
}

/// Attempt to fetch the OCR text with retries
async fn fetch_ocr_text_with_retries(
    config: &Config,
    gyazo_image_id: &str,
    max_attempts: usize,
) -> Result<String, Box<dyn std::error::Error>> {
    for attempt in 1..=max_attempts {
        match config.gyazo.image(gyazo_image_id).await {
            Ok(image_data) => {
                if let Some(ref ocr) = image_data.metadata.ocr {
                    let ocr_text = &ocr.description;
                    if !ocr_text.trim().is_empty() {
                        return Ok(ocr_text.clone());
                    }
                }
            }
            Err(_) => {
                if attempt < max_attempts {
                    sleep(Duration::from_secs(10)).await;
                }
            }
        }
    }

    Err("Failed to retrieve OCR result after multiple attempts".into())
}

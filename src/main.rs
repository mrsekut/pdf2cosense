use config::Config;
use files::{get_image_dirs, get_images, get_pdf_paths};
use futures::future;
use generate_page::generate_page;
use indicatif::{MultiProgress, ProgressBar, ProgressStyle};
use pdfs_to_images::pdfs_to_images;
use render_page::{create_profile_page, save_json, Page, Project};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::{sync::Semaphore, task};

mod config;
mod files;
mod generate_page;
mod pdfs_to_images;
mod render_page;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = Arc::new(Config::new()?);
    let pdf_paths = get_pdf_paths(&config.workspace_dir)?;

    let _ = pdfs_to_images(pdf_paths, &config.workspace_dir)
        .await
        .map_err(|e| eprintln!("Error: {e}"));

    let dirs = get_image_dirs(&config.workspace_dir)?;
    dirs_to_cosense(config.clone(), &dirs).await;

    Ok(())
}

async fn dirs_to_cosense(config: Arc<Config>, dir_paths: &[PathBuf]) {
    let m = MultiProgress::new();

    let tasks: Vec<_> = dir_paths
        .iter()
        .map(|dir| dir_to_cosense(config.clone(), dir, m.clone()))
        .collect();
    future::join_all(tasks).await;

    m.clear().unwrap();
}

async fn dir_to_cosense(
    config: Arc<Config>,
    dir_path: &PathBuf,
    m: MultiProgress,
) -> Result<(), Box<dyn std::error::Error>> {
    let images = get_images(dir_path)?;
    let total_pages = images.len();

    let pb = m.add(ProgressBar::new(total_pages as u64));
    pb.set_style(
        ProgressStyle::default_bar()
            .template("{msg} [{bar:40}] {pos}/{len} pages")
            .unwrap()
            .progress_chars("=> "),
    );
    pb.set_message(format!("Processing pages in {}", dir_path.display()));

    let pages = process_images_concurrently(&config, images, total_pages, pb.clone()).await;
    pb.finish_with_message(format!("✅ Finished processing {}", dir_path.display()));

    let pages_with_profile = add_profile_page_if_needed(&config, pages).await?;

    save_pages_to_json(dir_path, pages_with_profile)?;

    Ok(())
}

async fn process_images_concurrently(
    config: &Arc<Config>,
    images: Vec<PathBuf>,
    total_pages: usize,
    pb: ProgressBar,
) -> Vec<Page> {
    let semaphore = Arc::new(Semaphore::new(50));

    let tasks: Vec<_> = images
        .into_iter()
        .enumerate()
        .map(|(index, image)| {
            let config = Arc::clone(&config);
            let pb = pb.clone();
            let semaphore = Arc::clone(&semaphore);

            task::spawn(async move {
                let _permit = semaphore.acquire().await.unwrap();
                match generate_page(config, index, image.clone(), total_pages).await {
                    Ok(page) => {
                        pb.inc(1);
                        Some(page)
                    }
                    Err(_) => {
                        eprintln!("❌ Failed to extract text from image on page {}", index + 1);
                        None
                    }
                }
            })
        })
        .collect();

    future::join_all(tasks)
        .await
        .into_iter()
        .filter_map(Result::ok)
        .flatten()
        .collect()
}

async fn add_profile_page_if_needed(
    config: &Arc<Config>,
    pages: Vec<Page>,
) -> Result<Vec<Page>, Box<dyn std::error::Error>> {
    if let Some(profile) = &config.profile {
        let profile_page = create_profile_page(profile).await?;
        Ok(std::iter::once(profile_page)
            .chain(pages.into_iter())
            .collect())
    } else {
        Ok(pages)
    }
}

fn save_pages_to_json(
    dir_path: &PathBuf,
    pages: Vec<Page>,
) -> Result<(), Box<dyn std::error::Error>> {
    let project = Project { pages };
    let json_path = format!("{}-ocr.json", dir_path.display());

    match save_json(&Path::new(&json_path), &project) {
        Ok(_) => println!("✅️Saved JSON to {:?}", json_path),
        Err(e) => eprintln!("Error: {:?}", e),
    };

    Ok(())
}

use std::{fs, path::PathBuf};

pub fn get_pdf_paths(path: &PathBuf) -> Result<Vec<PathBuf>, Box<dyn std::error::Error>> {
    let paths = fs::read_dir(path)?
        .filter_map(|entry| {
            let path = entry.ok()?.path();

            if path.extension()?.eq_ignore_ascii_case("pdf") {
                Some(path)
            } else {
                None
            }
        })
        .collect::<Vec<PathBuf>>();

    Ok(paths)
}

pub fn get_image_dirs(path: &PathBuf) -> Result<Vec<PathBuf>, Box<dyn std::error::Error>> {
    let paths = fs::read_dir(path)?
        .filter_map(|entry| {
            let path = entry.ok()?.path();

            if path.is_dir() {
                Some(path)
            } else {
                None
            }
        })
        .collect::<Vec<PathBuf>>();

    Ok(paths)
}

pub fn get_images(path: &PathBuf) -> Result<Vec<PathBuf>, Box<dyn std::error::Error>> {
    let mut paths = fs::read_dir(path)?
        .filter_map(|entry| {
            let path = entry.ok()?.path();

            if path.extension()?.eq_ignore_ascii_case("png") {
                Some(path)
            } else {
                None
            }
        })
        .collect::<Vec<PathBuf>>();

    paths.sort_by_key(|path| {
        path.file_stem()
            .and_then(|stem| stem.to_str())
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(usize::MAX)
    });

    Ok(paths)
}

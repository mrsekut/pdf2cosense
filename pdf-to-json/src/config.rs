use dotenv::dotenv;
use gyazo_api::Gyazo;
use std::{env, path::PathBuf};

pub struct Config {
    pub workspace_dir: PathBuf,
    pub profile: Option<String>,
    pub gyazo: Gyazo,
}

impl Config {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        // Load .env from parent directory
        dotenv::from_path("../.env").ok();
        let gyazo_token = env::var("GYAZO_TOKEN")?;
        Ok(Self {
            workspace_dir: PathBuf::from("../workspace"),
            profile: Some("mrsekut-merry-firends/mrsekut".to_string()),
            gyazo: Gyazo::new(gyazo_token),
        })
    }
}

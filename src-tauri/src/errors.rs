use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("ADB error: {0}")]
    AdbError(String),

    #[error("Process error: {0}")]
    ProcessError(String),

    #[error("IO error: {0}")]
    IoError(String),

    #[error("XML Parser error: {0}")]
    ParserError(String),

    #[error("Database error: {0}")]
    DbError(String),

    #[error("Unauthorized: {0}")]
    AuthError(String),

    #[error("Network error: {0}")]
    NetworkError(String),

    #[error("File system error: {0}")]
    FileSystemError(String),

    #[error("Unknown error: {0}")]
    StringError(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

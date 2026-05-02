use image::GenericImageView;
use std::io::Cursor;
use base64::{engine::general_purpose, Engine as _};
use crate::errors::{AppError, AppResult};

pub fn compress_and_resize_image(
    image_bytes: Vec<u8>,
    max_width: u32,
    max_height: u32,
    quality: u8,
) -> AppResult<String> {
    // Load image from memory
    let img = image::load_from_memory(&image_bytes)
        .map_err(|e| AppError::FileSystemError(format!("Failed to load image: {}", e)))?;

    // Get original dimensions
    let (width, height) = img.dimensions();

    // Calculate new dimensions maintaining aspect ratio
    let (new_width, new_height) = if width > max_width || height > max_height {
        let ratio_w = max_width as f32 / width as f32;
        let ratio_h = max_height as f32 / height as f32;
        let ratio = ratio_w.min(ratio_h);
        ((width as f32 * ratio) as u32, (height as f32 * ratio) as u32)
    } else {
        (width, height)
    };

    // Resize image
    let resized = img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3);

    // Encode to JPEG with specified quality
    let mut cursor = Cursor::new(Vec::new());
    
    // Using JPEG for better compression than PNG for visual context
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, quality);
    encoder.encode_image(&resized)
        .map_err(|e| AppError::FileSystemError(format!("Failed to encode image: {}", e)))?;

    let b64 = general_purpose::STANDARD.encode(cursor.into_inner());
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

pub fn compress_image_path(
    path: &str,
    max_width: u32,
    max_height: u32,
    quality: u8,
) -> AppResult<String> {
    let bytes = std::fs::read(path)
        .map_err(|e| AppError::FileSystemError(format!("Failed to read file: {}", e)))?;
    compress_and_resize_image(bytes, max_width, max_height, quality)
}

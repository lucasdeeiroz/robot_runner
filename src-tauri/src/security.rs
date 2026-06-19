use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce
};
use sha2::{Digest, Sha256};
use rand::RngCore;
use base64::{Engine as _, engine::general_purpose::STANDARD};

fn get_encryption_key() -> Result<Aes256Gcm, String> {
    let username = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "default_user".to_string());
    
    let combined = format!("{}{}", username, "ROBOT_RUNNER_SECRET_SALT_2026");
    
    let mut hasher = Sha256::new();
    hasher.update(combined.as_bytes());
    let key_bytes = hasher.finalize();
    
    Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn encrypt_secret(plain_text: String) -> Result<String, String> {
    if plain_text.is_empty() {
        return Ok("".to_string());
    }
    let key = get_encryption_key()?;
    
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    let ciphertext = key.encrypt(nonce, plain_text.as_bytes()).map_err(|e| e.to_string())?;
    
    let mut payload = Vec::with_capacity(12 + ciphertext.len());
    payload.extend_from_slice(&nonce_bytes);
    payload.extend_from_slice(&ciphertext);
    
    Ok(STANDARD.encode(&payload))
}

#[tauri::command]
pub async fn decrypt_secret(encrypted_text: String) -> Result<String, String> {
    if encrypted_text.is_empty() {
        return Ok("".to_string());
    }
    let key = get_encryption_key()?;
    
    let decoded = STANDARD.decode(&encrypted_text).map_err(|e| e.to_string())?;
    if decoded.len() < 12 {
        return Err("Invalid ciphertext length".to_string());
    }
    
    let (nonce_bytes, ciphertext) = decoded.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    
    let decrypted = key.decrypt(nonce, ciphertext).map_err(|e| e.to_string())?;
    
    String::from_utf8(decrypted).map_err(|e| e.to_string())
}

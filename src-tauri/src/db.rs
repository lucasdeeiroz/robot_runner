use rusqlite::{params, Connection, Result};
use std::path::Path;

pub struct LogDb {
    pub conn: Connection,
}

impl LogDb {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        
        // Performance optimizations for bulk inserts
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA temp_store = MEMORY;
             PRAGMA cache_size = -20000;
             "
        )?;

        conn.execute(
             "CREATE TABLE IF NOT EXISTS log_nodes (
                id TEXT PRIMARY KEY,
                parent_id TEXT,
                node_type TEXT,
                json_payload TEXT,
                order_index INTEGER,
                ai_analysis TEXT
             )", 
             []
        )?;

        // Simple migration: add ai_analysis column if it doesn't exist
        let _ = conn.execute("ALTER TABLE log_nodes ADD COLUMN ai_analysis TEXT", []);
             
        conn.execute("CREATE INDEX IF NOT EXISTS idx_parent_id ON log_nodes(parent_id)", [])?;

        Ok(Self { conn })
    }

    pub fn update_node_ai_analysis(&self, id: &str, analysis: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE log_nodes SET ai_analysis = ?1 WHERE id = ?2",
            params![analysis, id],
        )?;
        Ok(())
    }

    pub fn get_node_ai_analysis(&self, id: &str) -> Result<Option<String>> {
        let mut stmt = self.conn.prepare("SELECT ai_analysis FROM log_nodes WHERE id = ?1")?;
        let analysis: Option<String> = stmt.query_row(params![id], |row| row.get(0))?;
        Ok(analysis)
    }

    pub fn begin_transaction(&mut self) -> Result<rusqlite::Transaction<'_>> {
        self.conn.transaction()
    }

    pub fn insert_node(
        tx: &rusqlite::Transaction,
        id: &str,
        parent_id: &str,
        node_type: &str,
        json_payload: &str,
        order_index: i32,
    ) -> Result<()> {
        tx.execute(
            "INSERT INTO log_nodes (id, parent_id, node_type, json_payload, order_index)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, parent_id, node_type, json_payload, order_index],
        )?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn get_node(&self, id: &str) -> Result<String> {
        let mut stmt = self.conn.prepare("SELECT json_payload FROM log_nodes WHERE id = ?1")?;
        let json: String = stmt.query_row(params![id], |row| row.get(0))?;
        Ok(json)
    }

    #[allow(dead_code)]
    pub fn get_children(&self, parent_id: &str) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT json_payload FROM log_nodes 
             WHERE parent_id = ?1 
             ORDER BY order_index ASC"
        )?;
        let rows = stmt.query_map(params![parent_id], |row| row.get(0))?;
        
        let mut children = Vec::new();
        for row in rows {
            children.push(row?);
        }
        Ok(children)
    }

    pub fn get_root_suite(&self) -> Result<String> {
        let mut stmt = self.conn.prepare("SELECT json_payload FROM log_nodes WHERE parent_id = '' ORDER BY order_index ASC LIMIT 1")?;
        let json: String = stmt.query_row([], |row| row.get(0))?;
        Ok(json)
    }

    pub fn get_failures(&self) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT json_payload FROM log_nodes 
             WHERE node_type = 'test' 
             AND (json_payload LIKE '%\"status\":\"FAIL\"%' OR json_payload LIKE '%\"status\": \"FAIL\"%')"
        )?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        
        let mut failures = Vec::new();
        for row in rows {
            failures.push(row?);
        }
        Ok(failures)
    }
}

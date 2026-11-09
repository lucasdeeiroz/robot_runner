import argparse
import sqlite3
import sys

def main():
    parser = argparse.ArgumentParser(description="Query local extracted SQLite database")
    parser.add_argument("--db-path", default=r".local_db\autoreply_plain.db", help="Path to SQLite db")
    parser.add_argument("--table", default="memories", help="Table or preset (facts, reminders, chat, logs, memories)")
    parser.add_argument("--sql", default="", help="Custom SQL query")
    parser.add_argument("--limit", type=int, default=20, help="Row limit")
    args = parser.parse_args()

    query = args.sql
    if not query:
        tbl = args.table.lower()
        if tbl == "memories":
            query = f"SELECT id, category, status, importance, content, targetContact FROM memories ORDER BY id DESC LIMIT {args.limit}"
        elif tbl == "facts":
            query = f"SELECT id, category, importance, content, targetContact FROM memories WHERE category = 'Fato' ORDER BY id DESC LIMIT {args.limit}"
        elif tbl == "reminders":
            query = f"SELECT id, status, targetDate, targetTime, content, targetContact FROM memories WHERE category = 'Lembrete' ORDER BY id DESC LIMIT {args.limit}"
        elif tbl in ("chat", "turns"):
            query = f"SELECT id, role, time, text FROM chat_turns ORDER BY id DESC LIMIT {args.limit}"
        elif tbl == "logs":
            query = f"SELECT id, timestamp, level, source, message FROM engine_logs ORDER BY id DESC LIMIT {args.limit}"
        else:
            query = f"SELECT * FROM {args.table} LIMIT {args.limit}"

    print(f"Executing: {query}\n")
    try:
        conn = sqlite3.connect(args.db_path)
        cursor = conn.cursor()
        cursor.execute(query)
        rows = cursor.fetchall()
        cols = [d[0] for d in cursor.description] if cursor.description else []

        if not cols:
            print("No columns returned.")
            return

        col_widths = []
        for i, col in enumerate(cols):
            max_val = max((len(str(r[i] or '')) for r in rows), default=0)
            col_widths.append(min(max(len(col), max_val), 55))

        header = " | ".join(cols[i].ljust(col_widths[i]) for i in range(len(cols)))
        sep = "-+-".join("-" * col_widths[i] for i in range(len(cols)))
        print(header)
        print(sep)
        for r in rows:
            row_str = " | ".join(str(r[i] if r[i] is not None else '')[:col_widths[i]].ljust(col_widths[i]) for i in range(len(cols)))
            print(row_str)
        print(f"\nTotal: {len(rows)} row(s)")
    except Exception as e:
        print(f"Database error: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        try:
            conn.close()
        except:
            pass

if __name__ == "__main__":
    main()


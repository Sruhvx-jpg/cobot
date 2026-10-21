package orm

import (
	"context"
	"database/sql"
)

// Executor defines the common query execution contract for *sql.DB and *sql.Tx.
type Executor interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

// DB wraps a standard *sql.DB with fluent ORM builder methods.
type DB struct {
	*sql.DB
}

// NewDB wraps sql.DB into an ORM handle.
func NewDB(db *sql.DB) *DB {
	return &DB{DB: db}
}

// Select starts building a SELECT query.
func (db *DB) Select(cols ...string) *SelectBuilder {
	b := NewSelect(db.DB)
	if len(cols) > 0 {
		b.Columns(cols...)
	}
	return b
}

// Insert starts building an INSERT statement.
func (db *DB) Insert(model ...any) *InsertBuilder {
	b := NewInsert(db.DB)
	if len(model) > 0 {
		b.Model(model[0])
	}
	return b
}

// Update starts building an UPDATE statement.
func (db *DB) Update(table string) *UpdateBuilder {
	return NewUpdate(db.DB).Table(table)
}

// Delete starts building a DELETE statement.
func (db *DB) Delete(table string) *DeleteBuilder {
	return NewDelete(db.DB).From(table)
}

// Transaction executes fn inside an ACID database transaction.
func (db *DB) Transaction(ctx context.Context, fn func(tx *Tx) error) error {
	sqlTx, err := db.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	tx := &Tx{Tx: sqlTx}
	if err := fn(tx); err != nil {
		_ = sqlTx.Rollback()
		return err
	}

	return sqlTx.Commit()
}

// Tx wraps *sql.Tx with fluent ORM methods.
type Tx struct {
	*sql.Tx
}

// Select starts building a SELECT query on this transaction.
func (tx *Tx) Select(cols ...string) *SelectBuilder {
	b := NewSelect(tx.Tx)
	if len(cols) > 0 {
		b.Columns(cols...)
	}
	return b
}

// Insert starts building an INSERT statement on this transaction.
func (tx *Tx) Insert(model ...any) *InsertBuilder {
	b := NewInsert(tx.Tx)
	if len(model) > 0 {
		b.Model(model[0])
	}
	return b
}

// Update starts building an UPDATE statement on this transaction.
func (tx *Tx) Update(table string) *UpdateBuilder {
	return NewUpdate(tx.Tx).Table(table)
}

// Delete starts building a DELETE statement on this transaction.
func (tx *Tx) Delete(table string) *DeleteBuilder {
	return NewDelete(tx.Tx).From(table)
}

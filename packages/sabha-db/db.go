package sabhadb

import (
	"database/sql"

	"github.com/chaisql/chai"
	"github.com/Sruhvx-jpg/cobot/packages/sabha-db/schema"
)

// Migrate runs reflection-based ChaiSQL schema migrations for all Sabha models.
func Migrate(db *sql.DB) error {
	return chai.AutoMigrate(
		db,
		&schema.Server{},
		&schema.Channel{},
		&schema.Message{},
		&schema.Mention{},
		&schema.Agent{},
	)
}

// Open opens an embedded Chai database at path and automatically runs migrations.
func Open(path string) (*sql.DB, error) {
	db, err := sql.Open("chai", path)
	if err != nil {
		return nil, err
	}

	if err := Migrate(db); err != nil {
		db.Close()
		return nil, err
	}

	return db, nil
}

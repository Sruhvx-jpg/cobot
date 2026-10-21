package sabhadb

import (
	"database/sql"

	"github.com/Sruhvx-jpg/cobot/packages/sabha-db/orm"
	"github.com/Sruhvx-jpg/cobot/packages/sabha-db/schema"
	"github.com/chaisql/chai"
)

// DB wraps orm.DB with Sabha-specific methods.
type DB struct {
	*orm.DB
}

// Migrate runs reflection-based ChaiSQL schema migrations for all Sabha models.
func Migrate(rawDB *sql.DB) error {
	return chai.AutoMigrate(
		rawDB,
		&schema.Server{},
		&schema.Channel{},
		&schema.Message{},
		&schema.Mention{},
		&schema.Agent{},
	)
}

// Open opens an embedded Chai database at path, runs migrations, and returns an ORM handle.
func Open(path string) (*DB, error) {
	rawDB, err := sql.Open("chai", path)
	if err != nil {
		return nil, err
	}

	if err := Migrate(rawDB); err != nil {
		rawDB.Close()
		return nil, err
	}

	return &DB{DB: orm.NewDB(rawDB)}, nil
}

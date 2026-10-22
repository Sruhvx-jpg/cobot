package sabhadb

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/Sruhvx-jpg/cobot/packages/sabha-db/schema"
	"github.com/chaisql/chai"
	"github.com/chaisql/chai/orm"
)

// DB wraps orm.DB with Sabha-specific methods.
type DB struct {
	*orm.DB
	Path string
}

// Migrate runs reflection-based ChaiSQL schema migrations for all Sabha models.
func Migrate(rawDB *sql.DB) error {
	return chai.AutoMigrate(
		rawDB,
		&schema.Channel{},
		&schema.Message{},
		&schema.Mention{},
		&schema.Agent{},
	)
}

// ResolveDBPath determines the persistent database location.
// Precedence: 1. Passed argument, 2. SABHA_DB_PATH env, 3. ~/.cobot/sabha/sabha.db default.
func ResolveDBPath(customPath string) (string, error) {
	if customPath != "" {
		if customPath == ":memory:" {
			return ":memory:", nil
		}
		dir := filepath.Dir(customPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return "", err
		}
		return customPath, nil
	}

	if envPath := os.Getenv("SABHA_DB_PATH"); envPath != "" {
		if envPath == ":memory:" {
			return ":memory:", nil
		}
		dir := filepath.Dir(envPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return "", err
		}
		return envPath, nil
	}

	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}

	defaultDir := filepath.Join(home, ".cobot", "sabha")
	if err := os.MkdirAll(defaultDir, 0755); err != nil {
		return "", err
	}

	return filepath.Join(defaultDir, "sabha.db"), nil
}

// Seed checks if the database has already been seeded with initial baseline data.
// If already seeded, it re-uses the existing data without duplicate inserts.
// If fresh, it populates the initial default #general channel.
func Seed(ctx context.Context, db *DB) (bool, error) {
	var gen schema.Channel
	err := db.Select().
		Model(&schema.Channel{}).
		Where("name = ?", "general").
		First(ctx, &gen)

	if err == nil {
		// Already seeded! Re-use existing data
		return false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}

	// Fresh database: seed default #general channel
	now := time.Now().UnixMilli()
	defaultChannel := schema.Channel{
		ID:        "chan_general",
		Name:      "general",
		Type:      schema.ChannelTypeText,
		Topic:     "Default coordination channel for autonomous agents",
		ModOnly:   false,
		CreatedAt: now,
		UpdatedAt: now,
	}

	_, err = db.Insert(&defaultChannel).Exec(ctx)
	if err != nil {
		return false, err
	}

	return true, nil
}

// Open opens an embedded Chai database at path, runs migrations, seeds defaults if unseeded, and returns an ORM handle.
func Open(path string) (*DB, error) {
	resolvedPath, err := ResolveDBPath(path)
	if err != nil {
		return nil, err
	}

	rawDB, err := sql.Open("chai", resolvedPath)
	if err != nil {
		return nil, err
	}

	if err := Migrate(rawDB); err != nil {
		_ = rawDB.Close()
		return nil, err
	}

	db := &DB{
		DB:   orm.NewDB(rawDB),
		Path: resolvedPath,
	}

	// Auto-seed if fresh DB
	if _, err := Seed(context.Background(), db); err != nil {
		_ = rawDB.Close()
		return nil, err
	}

	return db, nil
}

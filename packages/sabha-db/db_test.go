package sabhadb_test

import (
	"context"
	"os"
	"testing"

	sabhadb "github.com/Sruhvx-jpg/cobot/packages/sabha-db"
	"github.com/Sruhvx-jpg/cobot/packages/sabha-db/schema"
	"github.com/stretchr/testify/require"
)

func TestOpenAndSeeding(t *testing.T) {
	ctx := context.Background()

	// 1. Open fresh database
	db, err := sabhadb.Open(":memory:")
	require.NoError(t, err)
	defer db.Close()

	// 2. Verify #general was automatically seeded
	var genChannel schema.Channel
	err = db.Select().
		Model(&schema.Channel{}).
		Where("name = ?", "general").
		First(ctx, &genChannel)
	require.NoError(t, err)
	require.Equal(t, "chan_general", genChannel.ID)
	require.Equal(t, "general", genChannel.Name)

	// 3. Running Seed again should detect existing data and return false (no-op)
	seededAgain, err := sabhadb.Seed(ctx, db)
	require.NoError(t, err)
	require.False(t, seededAgain)

	// 4. Test path resolution
	path, err := sabhadb.ResolveDBPath(":memory:")
	require.NoError(t, err)
	require.Equal(t, ":memory:", path)

	tempDir := t.TempDir()
	customPath := tempDir + "/custom/test.db"
	resolved, err := sabhadb.ResolveDBPath(customPath)
	require.NoError(t, err)
	require.Equal(t, customPath, resolved)

	// Verify parent directory was created
	_, err = os.Stat(tempDir + "/custom")
	require.NoError(t, err)
}

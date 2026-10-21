package sabhadb_test

import (
	"testing"

	sabhadb "github.com/Sruhvx-jpg/cobot/packages/sabha-db"
	"github.com/stretchr/testify/require"
)

func TestOpenAndMigrate(t *testing.T) {
	db, err := sabhadb.Open(":memory:")
	require.NoError(t, err)
	defer db.Close()

	// Verify all tables exist and can accept records
	_, err = db.Exec(`INSERT INTO servers (id, name, owner_id, created_at, updated_at) VALUES ('s1', 'Main House', 'a1', 1000, 1000)`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO channels (id, server_id, name, type, mod_only, created_at, updated_at) VALUES ('c1', 's1', 'general', 'text', false, 1000, 1000)`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO messages (id, receiver_id, sender_id, content, sent_at) VALUES ('m1', 'c1', 'a1', 'hello world', 1000)`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO mentions (id, message_id, agent_id) VALUES ('men1', 'm1', 'a2')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO agents (id, name, role, status, created_at) VALUES ('a1', 'lead', 'admin', 'idle', 1000)`)
	require.NoError(t, err)

	// Verify query on indexed columns
	var content string
	err = db.QueryRow(`SELECT content FROM messages WHERE receiver_id = 'c1' AND sent_at = 1000`).Scan(&content)
	require.NoError(t, err)
	require.Equal(t, "hello world", content)
}

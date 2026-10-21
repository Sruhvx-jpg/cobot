package chai_test

import (
	"database/sql"
	"testing"

	"github.com/chaisql/chai"
	"github.com/stretchr/testify/require"
)

type TestServer struct {
	ID        string `chai:"id;primaryKey"`
	Name      string `chai:"name;notnull"`
	OwnerID   string `chai:"owner_id;notnull;index"`
	CreatedAt int64  `chai:"created_at"`
}

type TestMessage struct {
	ID         string `chai:"id;primaryKey"`
	ReceiverID string `chai:"receiver_id;notnull;index:idx_rec_sent,priority:1"`
	SenderID   string `chai:"sender_id;notnull;index"`
	Content    string `chai:"content;notnull"`
	SentAt     int64  `chai:"sent_at;index:idx_rec_sent,priority:2"`
}

func TestAutoMigrate(t *testing.T) {
	db, err := sql.Open("chai", ":memory:")
	require.NoError(t, err)
	defer db.Close()

	err = chai.AutoMigrate(db, &TestServer{}, &TestMessage{})
	require.NoError(t, err)

	// Verify insertion works on migrated tables
	_, err = db.Exec(`INSERT INTO test_servers (id, name, owner_id, created_at) VALUES ('s1', 'Core Server', 'a1', 1000)`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO test_messages (id, receiver_id, sender_id, content, sent_at) VALUES ('m1', 'c1', 'a1', 'hello', 2000)`)
	require.NoError(t, err)

	// Verify query with index works
	var content string
	row := db.QueryRow(`SELECT content FROM test_messages WHERE receiver_id = 'c1' AND sent_at = 2000`)
	require.NoError(t, row.Scan(&content))
	require.Equal(t, "hello", content)

	// Calling AutoMigrate again should be completely idempotent (IF NOT EXISTS)
	err = chai.AutoMigrate(db, &TestServer{}, &TestMessage{})
	require.NoError(t, err)
}

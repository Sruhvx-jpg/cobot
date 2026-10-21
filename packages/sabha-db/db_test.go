package sabhadb_test

import (
	"context"
	"testing"

	sabhadb "github.com/Sruhvx-jpg/cobot/packages/sabha-db"
	"github.com/Sruhvx-jpg/cobot/packages/sabha-db/schema"
	"github.com/stretchr/testify/require"
)

func TestOpenAndMigrate(t *testing.T) {
	ctx := context.Background()

	db, err := sabhadb.Open(":memory:")
	require.NoError(t, err)
	defer db.Close()

	// 1. Insert records using fluent ORM
	srv := schema.Server{ID: "s1", Name: "Main House", OwnerID: "a1", CreatedAt: 1000, UpdatedAt: 1000}
	_, err = db.Insert(&srv).Exec(ctx)
	require.NoError(t, err)

	ch := schema.Channel{ID: "c1", ServerID: "s1", Name: "general", Type: schema.ChannelTypeText, ModOnly: false, CreatedAt: 1000, UpdatedAt: 1000}
	_, err = db.Insert(&ch).Exec(ctx)
	require.NoError(t, err)

	msg := schema.Message{ID: "m1", ReceiverID: "c1", SenderID: "a1", Content: "hello world", SentAt: 1000}
	_, err = db.Insert(&msg).Exec(ctx)
	require.NoError(t, err)

	// 2. Query record using fluent ORM Find
	var msgs []schema.Message
	err = db.Select().
		Model(&schema.Message{}).
		Where("receiver_id = ?", "c1").
		Find(ctx, &msgs)
	require.NoError(t, err)
	require.Len(t, msgs, 1)
	require.Equal(t, "hello world", msgs[0].Content)
}

package orm_test

import (
	"context"
	"database/sql"
	"testing"

	"github.com/chaisql/chai"
	"github.com/chaisql/chai/orm"
	"github.com/stretchr/testify/require"
)

type Message struct {
	ID         string `chai:"id;primaryKey"`
	ReceiverID string `chai:"receiver_id;notnull;index:idx_rec_sent,priority:1"`
	SenderID   string `chai:"sender_id;notnull;index"`
	Content    string `chai:"content;notnull"`
	SentAt     int64  `chai:"sent_at;notnull;index:idx_rec_sent,priority:2"`
}

func TestORM(t *testing.T) {
	ctx := context.Background()

	rawDB, err := sql.Open("chai", ":memory:")
	require.NoError(t, err)
	defer rawDB.Close()

	err = chai.AutoMigrate(rawDB, &Message{})
	require.NoError(t, err)

	db := orm.NewDB(rawDB)

	// 1. Test Single Insert
	m1 := Message{ID: "m1", ReceiverID: "general", SenderID: "agent1", Content: "Hello world", SentAt: 1000}
	_, err = db.Insert(&m1).Exec(ctx)
	require.NoError(t, err)

	// 2. Test Batch Insert
	batch := []Message{
		{ID: "m2", ReceiverID: "general", SenderID: "agent2", Content: "Second message", SentAt: 2000},
		{ID: "m3", ReceiverID: "general", SenderID: "agent1", Content: "Third message", SentAt: 3000},
		{ID: "m4", ReceiverID: "alerts", SenderID: "agent3", Content: "Alert high", SentAt: 4000},
	}
	_, err = db.Insert(&batch).Exec(ctx)
	require.NoError(t, err)

	// 3. Test Select First
	var found Message
	err = db.Select().
		Model(&Message{}).
		Where("id = ?", "m1").
		First(ctx, &found)
	require.NoError(t, err)
	require.Equal(t, "m1", found.ID)
	require.Equal(t, "Hello world", found.Content)

	// 4. Test Select Find (multi-row with ordering & limits)
	var generalMsgs []Message
	err = db.Select().
		Model(&Message{}).
		Where("receiver_id = ?", "general").
		Where("sent_at >= ?", 2000).
		OrderBy("sent_at ASC").
		Limit(10).
		Find(ctx, &generalMsgs)
	require.NoError(t, err)
	require.Len(t, generalMsgs, 2)
	require.Equal(t, "m2", generalMsgs[0].ID)
	require.Equal(t, "m3", generalMsgs[1].ID)

	// 5. Test Update
	_, err = db.Update("messages").
		Set("content", "Updated content").
		Where("id = ?", "m2").
		Exec(ctx)
	require.NoError(t, err)

	var updated Message
	err = db.Select().Model(&Message{}).Where("id = ?", "m2").First(ctx, &updated)
	require.NoError(t, err)
	require.Equal(t, "Updated content", updated.Content)

	// 6. Test Delete
	_, err = db.Delete("messages").
		Where("id = ?", "m4").
		Exec(ctx)
	require.NoError(t, err)

	var missing Message
	err = db.Select().Model(&Message{}).Where("id = ?", "m4").First(ctx, &missing)
	require.ErrorIs(t, err, sql.ErrNoRows)

	// 7. Test Transaction
	err = db.Transaction(ctx, func(tx *orm.Tx) error {
		txMsg := Message{ID: "m5", ReceiverID: "general", SenderID: "txAgent", Content: "tx msg", SentAt: 5000}
		_, txErr := tx.Insert(&txMsg).Exec(ctx)
		return txErr
	})
	require.NoError(t, err)

	var txFound Message
	err = db.Select().Model(&Message{}).Where("id = ?", "m5").First(ctx, &txFound)
	require.NoError(t, err)
	require.Equal(t, "tx msg", txFound.Content)
}

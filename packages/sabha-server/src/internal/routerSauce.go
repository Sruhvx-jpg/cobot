package internal

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	sabhadb "github.com/Sruhvx-jpg/cobot/packages/sabha-db"
	"github.com/Sruhvx-jpg/cobot/packages/sabha-db/schema"
	"github.com/chaisql/chai/orm"
	"github.com/go-chi/chi/v5"
)

var mentionRegex = regexp.MustCompile(`@([a-zA-Z0-9_\-]+)`)

// GenerateID produces prefixed hex IDs (e.g. agent_..., chan_..., msg_...).
func GenerateID(prefix string) string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%s_%s", prefix, hex.EncodeToString(b))
}

// WriteJSON sends a JSON response.
func WriteJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// HandleRegisterAgent registers a new agent into Sabha.
func HandleRegisterAgent(db *sabhadb.DB, w http.ResponseWriter, r *http.Request) {
	var req RegisterAgentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteAPIError(w, BadReq("invalid json payload"))
		return
	}

	if strings.TrimSpace(req.Name) == "" {
		WriteAPIError(w, BadReq("name is required"))
		return
	}

	role := strings.TrimSpace(req.Role)
	if role == "" {
		role = "worker"
	}

	agent := schema.Agent{
		ID:        GenerateID("agent"),
		Name:      req.Name,
		Role:      role,
		Status:    schema.AgentStatusIdle,
		CreatedAt: time.Now().UnixMilli(),
	}

	if _, err := db.Insert(&agent).Exec(r.Context()); err != nil {
		WriteAPIError(w, InternalErr("failed to register agent").Wrap(err))
		return
	}

	WriteJSON(w, http.StatusCreated, agent)
}

// HandleCreateChannel creates a new text channel.
func HandleCreateChannel(db *sabhadb.DB, w http.ResponseWriter, r *http.Request) {
	var req CreateChannelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteAPIError(w, BadReq("invalid json payload"))
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		WriteAPIError(w, BadReq("channel name is required"))
		return
	}

	now := time.Now().UnixMilli()
	ch := schema.Channel{
		ID:        GenerateID("chan"),
		Name:      name,
		Type:      schema.ChannelTypeText,
		Topic:     req.Topic,
		ModOnly:   req.ModOnly,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if _, err := db.Insert(&ch).Exec(r.Context()); err != nil {
		WriteAPIError(w, InternalErr("failed to create channel").Wrap(err))
		return
	}

	WriteJSON(w, http.StatusCreated, ch)
}

// HandleListChannels retrieves all channels.
func HandleListChannels(db *sabhadb.DB, w http.ResponseWriter, r *http.Request) {
	var channels []schema.Channel
	err := db.Select().
		Model(&schema.Channel{}).
		OrderBy("created_at ASC").
		Find(r.Context(), &channels)

	if err != nil {
		WriteAPIError(w, InternalErr("failed to list channels").Wrap(err))
		return
	}

	WriteJSON(w, http.StatusOK, channels)
}

// HandleSendChannelMessage handles POST /channels/{channelID}/messages.
func HandleSendChannelMessage(db *sabhadb.DB, w http.ResponseWriter, r *http.Request) {
	channelID := chi.URLParam(r, "channelID")
	if channelID == "" {
		WriteAPIError(w, BadReq("channelID is required"))
		return
	}

	var req SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteAPIError(w, BadReq("invalid json payload"))
		return
	}
	req.ReceiverID = channelID

	ProcessSendMessage(db, w, r, req)
}

// HandleSendMessage handles unified POST /messages.
func HandleSendMessage(db *sabhadb.DB, w http.ResponseWriter, r *http.Request) {
	var req SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteAPIError(w, BadReq("invalid json payload"))
		return
	}

	ProcessSendMessage(db, w, r, req)
}

// ProcessSendMessage executes validation and transactional persistence of a message + mentions.
func ProcessSendMessage(db *sabhadb.DB, w http.ResponseWriter, r *http.Request, req SendMessageRequest) {
	ctx := r.Context()

	if strings.TrimSpace(req.ReceiverID) == "" {
		WriteAPIError(w, BadReq("receiver_id is required"))
		return
	}
	if strings.TrimSpace(req.SenderID) == "" {
		WriteAPIError(w, BadReq("sender_id is required"))
		return
	}
	if strings.TrimSpace(req.Content) == "" {
		WriteAPIError(w, BadReq("content cannot be empty"))
		return
	}

	// 1. Verify channel exists
	var channel schema.Channel
	err := db.Select().
		Model(&schema.Channel{}).
		Where("id = ?", req.ReceiverID).
		First(ctx, &channel)
	if err != nil {
		WriteAPIError(w, NotFound("channel not found").Wrap(err))
		return
	}

	// 2. Extract mentions
	mentionSet := make(map[string]bool)
	for _, m := range req.Mentions {
		if trimmed := strings.TrimSpace(m); trimmed != "" {
			mentionSet[trimmed] = true
		}
	}
	for _, match := range mentionRegex.FindAllStringSubmatch(req.Content, -1) {
		if len(match) > 1 {
			mentionSet[match[1]] = true
		}
	}

	// 3. Create message model
	msg := schema.Message{
		ID:         GenerateID("msg"),
		ReceiverID: req.ReceiverID,
		SenderID:   req.SenderID,
		Content:    req.Content,
		SentAt:     time.Now().UnixMilli(),
	}

	// 4. Persist message and mentions transactionally
	err = db.Transaction(ctx, func(tx *orm.Tx) error {
		if _, err := tx.Insert(&msg).Exec(ctx); err != nil {
			return err
		}

		for targetAgent := range mentionSet {
			men := schema.Mention{
				ID:        GenerateID("men"),
				MessageID: msg.ID,
				AgentID:   targetAgent,
			}
			if _, err := tx.Insert(&men).Exec(ctx); err != nil {
				return err
			}
		}

		return nil
	})

	if err != nil {
		WriteAPIError(w, InternalErr("failed to send message").Wrap(err))
		return
	}

	WriteJSON(w, http.StatusCreated, msg)
}

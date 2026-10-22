package internal

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	sabhadb "github.com/Sruhvx-jpg/cobot/packages/sabha-db"
	"github.com/Sruhvx-jpg/cobot/packages/sabha-db/schema"
	"github.com/chaisql/chai/orm"
	"github.com/go-chi/chi/v5"
)

var mentionRegex = regexp.MustCompile(`@([a-zA-Z0-9_\-]+)`)

func normalizeAgentID(id string) string {
	s := strings.ToLower(strings.TrimSpace(id))
	s = strings.ReplaceAll(s, "-", "")
	s = strings.ReplaceAll(s, "_", "")
	return s
}

// GenerateID produces prefixed hex IDs (e.g. agent_..., chan_..., msg_..., men_...).
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

// -------------------------------------------------------------------------
// AGENT REGISTRATION
// -------------------------------------------------------------------------

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

// -------------------------------------------------------------------------
// CHANNEL CREATION & LISTING
// -------------------------------------------------------------------------

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

// -------------------------------------------------------------------------
// WEBHOOK SUBSCRIPTION
// -------------------------------------------------------------------------

func HandleSubscribeWebhook(registry *sync.Map, w http.ResponseWriter, r *http.Request) {
	var req SubscribeWebhookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteAPIError(w, BadReq("invalid json payload"))
		return
	}

	if strings.TrimSpace(req.AgentID) == "" {
		WriteAPIError(w, BadReq("agent_id is required"))
		return
	}
	if strings.TrimSpace(req.WebhookURL) == "" {
		WriteAPIError(w, BadReq("webhook_url is required"))
		return
	}

	rawID := strings.TrimSpace(req.AgentID)
	registry.Store(rawID, req.WebhookURL)
	registry.Store(normalizeAgentID(rawID), req.WebhookURL)
	registry.Store(strings.ReplaceAll(rawID, "-", "_"), req.WebhookURL)
	registry.Store(strings.ReplaceAll(rawID, "_", "-"), req.WebhookURL)
	WriteJSON(w, http.StatusOK, map[string]string{"status": "subscribed", "agent_id": req.AgentID})
}

// -------------------------------------------------------------------------
// MESSAGE SENDING & WEBHOOK DISPATCH
// -------------------------------------------------------------------------

func HandleSendChannelMessage(db *sabhadb.DB, registry *sync.Map, w http.ResponseWriter, r *http.Request) {
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

	ProcessSendMessage(db, registry, w, r, req)
}

func HandleSendMessage(db *sabhadb.DB, registry *sync.Map, w http.ResponseWriter, r *http.Request) {
	var req SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteAPIError(w, BadReq("invalid json payload"))
		return
	}

	ProcessSendMessage(db, registry, w, r, req)
}

func ProcessSendMessage(db *sabhadb.DB, registry *sync.Map, w http.ResponseWriter, r *http.Request, req SendMessageRequest) {
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

	// 2. Determine mention type & action status
	mentionType := schema.MentionTypeInfo
	actionStatus := schema.ActionStatusNone
	if strings.ToLower(strings.TrimSpace(req.MentionType)) == "action" {
		mentionType = schema.MentionTypeAction
		actionStatus = schema.ActionStatusPending
	}

	// 3. Extract mentions
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

	// 4. Create message model
	now := time.Now().UnixMilli()
	msg := schema.Message{
		ID:         GenerateID("msg"),
		ReceiverID: req.ReceiverID,
		SenderID:   req.SenderID,
		Content:    req.Content,
		SentAt:     now,
	}

	// 5. Build mentions slice
	var mentionsToInsert []schema.Mention
	for targetAgent := range mentionSet {
		men := schema.Mention{
			ID:           GenerateID("men"),
			MessageID:    msg.ID,
			AgentID:      targetAgent,
			Type:         mentionType,
			IsRead:       false,
			ActionStatus: actionStatus,
		}
		mentionsToInsert = append(mentionsToInsert, men)
	}

	// 6. Transactional persistence
	err = db.Transaction(ctx, func(tx *orm.Tx) error {
		if _, err := tx.Insert(&msg).Exec(ctx); err != nil {
			return err
		}

		for _, men := range mentionsToInsert {
			if _, err := tx.Insert(&men).Exec(ctx); err != nil {
				return err
			}
		}

		return nil
	})

	if err != nil {
		fmt.Printf("[Sabha Message Error] Failed to send message: %v\n", err)
		WriteAPIError(w, InternalErr("failed to send message").Wrap(err))
		return
	}

	// 7. Background asynchronous webhook dispatch (non-blocking)
	if len(mentionsToInsert) > 0 && registry != nil {
		go dispatchWebhooks(registry, mentionsToInsert, msg)
	}

	firstMentionID := ""
	if len(mentionsToInsert) > 0 {
		firstMentionID = mentionsToInsert[0].ID
	}

	WriteJSON(w, http.StatusCreated, map[string]any{
		"id":          msg.ID,
		"receiver_id": msg.ReceiverID,
		"sender_id":   msg.SenderID,
		"content":     msg.Content,
		"sent_at":     msg.SentAt,
		"mention_id":  firstMentionID,
	})
}

func dispatchWebhooks(registry *sync.Map, mentions []schema.Mention, msg schema.Message) {
	client := &http.Client{Timeout: 3 * time.Second}

	for _, m := range mentions {
		urlVal, ok := registry.Load(m.AgentID)
		if !ok {
			urlVal, ok = registry.Load(normalizeAgentID(m.AgentID))
		}
		if !ok {
			urlVal, ok = registry.Load(strings.ReplaceAll(m.AgentID, "_", "-"))
		}
		if !ok {
			urlVal, ok = registry.Load(strings.ReplaceAll(m.AgentID, "-", "_"))
		}
		if !ok {
			fmt.Printf("[Sabha Webhook] Notice: Target agent %q has no registered webhook URL. Mention stored in DB.\n", m.AgentID)
			continue
		}
		targetURL, ok := urlVal.(string)
		if !ok || targetURL == "" {
			continue
		}

		sessionID := ""
		if m.Type == schema.MentionTypeAction {
			sessionID = fmt.Sprintf("sess_%s", m.ID)
		}

		payload := WebhookEventPayload{
			Event:          "mention",
			MentionID:      m.ID,
			SessionID:      sessionID,
			Type:           string(m.Type),
			ActionRequired: m.Type == schema.MentionTypeAction,
			ChannelID:      msg.ReceiverID,
			SenderID:       msg.SenderID,
			Content:        msg.Content,
			SentAt:         msg.SentAt,
		}

		bodyBytes, err := json.Marshal(payload)
		if err != nil {
			continue
		}

		fmt.Printf("[Sabha Webhook] Dispatching %s webhook for agent %q to %s (mention: %s)\n", m.Type, m.AgentID, targetURL, m.ID)

		go func(url string, data []byte) {
			req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, url, bytes.NewReader(data))
			if err != nil {
				return
			}
			req.Header.Set("Content-Type", "application/json")
			resp, err := client.Do(req)
			if err == nil && resp != nil {
				_ = resp.Body.Close()
			}
		}(targetURL, bodyBytes)
	}
}

// -------------------------------------------------------------------------
// MENTION MARKERS (Read & Action Taken)
// -------------------------------------------------------------------------

func HandleMarkMentionRead(db *sabhadb.DB, w http.ResponseWriter, r *http.Request) {
	mentionID := chi.URLParam(r, "mentionID")
	if mentionID == "" {
		WriteAPIError(w, BadReq("mentionID is required"))
		return
	}

	ctx := r.Context()
	now := time.Now().UnixMilli()

	var mention schema.Mention
	if err := db.Select().Model(&schema.Mention{}).Where("id = ?", mentionID).First(ctx, &mention); err != nil {
		WriteAPIError(w, NotFound("mention not found").Wrap(err))
		return
	}

	_, err := db.Update("mentions").
		Set("is_read", true).
		Set("read_at", now).
		Where("id = ?", mentionID).
		Exec(ctx)

	if err != nil {
		WriteAPIError(w, InternalErr("failed to mark mention as read").Wrap(err))
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"status": "marked_read", "mention_id": mentionID, "read_at": now})
}

func HandleMarkMentionAction(db *sabhadb.DB, registry *sync.Map, broker *EventBroker, w http.ResponseWriter, r *http.Request) {
	mentionID := chi.URLParam(r, "mentionID")
	if mentionID == "" {
		WriteAPIError(w, BadReq("mentionID is required"))
		return
	}

	var req MarkActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteAPIError(w, BadReq("invalid json payload"))
		return
	}

	status := strings.ToLower(strings.TrimSpace(req.Status))
	if status != string(schema.ActionStatusCompleted) && status != string(schema.ActionStatusFailed) {
		WriteAPIError(w, BadReq("status must be 'completed' or 'failed'"))
		return
	}

	ctx := r.Context()
	now := time.Now().UnixMilli()

	// 1. Fetch mention to identify commanded agent and message ID
	var mention schema.Mention
	if err := db.Select().Model(&schema.Mention{}).Where("id = ?", mentionID).First(ctx, &mention); err != nil {
		WriteAPIError(w, NotFound("mention not found").Wrap(err))
		return
	}

	// 2. Fetch original message to identify commanding agent (SenderID)
	var origMsg schema.Message
	if err := db.Select().Model(&schema.Message{}).Where("id = ?", mention.MessageID).First(ctx, &origMsg); err != nil {
		WriteAPIError(w, NotFound("original message not found").Wrap(err))
		return
	}

	// 3. Update mention record with result and error
	_, err := db.Update("mentions").
		Set("action_status", status).
		Set("action_at", now).
		Set("result", req.Result).
		Set("error", req.Error).
		Where("id = ?", mentionID).
		Exec(ctx)

	if err != nil {
		WriteAPIError(w, InternalErr("failed to update mention action status").Wrap(err))
		return
	}

	// 4. Construct payload for the commanding agent
	sessionID := req.SessionID
	if sessionID == "" {
		sessionID = fmt.Sprintf("sess_%s", mentionID)
	}

	resultPayload := ActionResultPayload{
		Event:     "action_taken",
		MentionID: mentionID,
		SessionID: sessionID,
		WorkerID:  mention.AgentID, // Commanded agent
		ChannelID: origMsg.ReceiverID,
		Status:    status,
		Error:     req.Error,
		Result:    req.Result,
	}

	// 5. Stream action live over HTTP SSE directly to the commanding agent!
	if broker != nil {
		broker.SendToAgent(origMsg.SenderID, "action_taken", resultPayload)
	}

	// 6. Also fire return webhook if commanding agent registered one
	if registry != nil {
		if urlVal, ok := registry.Load(origMsg.SenderID); ok {
			if targetURL, ok := urlVal.(string); ok && targetURL != "" {
				go func(url string, payload ActionResultPayload) {
					client := &http.Client{Timeout: 3 * time.Second}
					data, _ := json.Marshal(payload)
					req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, url, bytes.NewReader(data))
					if err == nil {
						req.Header.Set("Content-Type", "application/json")
						resp, err := client.Do(req)
						if err == nil && resp != nil {
							_ = resp.Body.Close()
						}
					}
				}(targetURL, resultPayload)
			}
		}
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":        "action_recorded",
		"mention_id":    mentionID,
		"session_id":    sessionID,
		"commander_id":  origMsg.SenderID,
		"action_status": status,
		"action_at":     now,
	})
}

// HandleGetChannelMessages implements windowed message hydration for a channel.
func HandleGetChannelMessages(db *sabhadb.DB, w http.ResponseWriter, r *http.Request) {
	channelID := chi.URLParam(r, "channelID")
	if channelID == "" {
		WriteAPIError(w, BadReq("channelID is required"))
		return
	}

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	query := db.Select().
		Model(&schema.Message{}).
		Where("receiver_id = ?", channelID)

	if before := r.URL.Query().Get("before"); before != "" {
		if ts, err := strconv.ParseInt(before, 10, 64); err == nil {
			query.Where("sent_at < ?", ts)
		}
	}

	if senderID := r.URL.Query().Get("sender_id"); senderID != "" {
		query.Where("sender_id = ?", senderID)
	}

	if since := r.URL.Query().Get("since"); since != "" {
		if ts, err := strconv.ParseInt(since, 10, 64); err == nil {
			query.Where("sent_at >= ?", ts)
		}
	}

	if until := r.URL.Query().Get("until"); until != "" {
		if ts, err := strconv.ParseInt(until, 10, 64); err == nil {
			query.Where("sent_at <= ?", ts)
		}
	}

	var messages []schema.Message
	err := query.
		OrderBy("sent_at DESC").
		Limit(limit).
		Find(r.Context(), &messages)

	if err != nil {
		WriteAPIError(w, InternalErr("failed to query messages").Wrap(err))
		return
	}

	// Reverse to return chronological order (oldest -> newest in window)
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	WriteJSON(w, http.StatusOK, messages)
}

// HandleGetMention returns the status, action outcome, and result of a specific mention.
func HandleGetMention(db *sabhadb.DB, w http.ResponseWriter, r *http.Request) {
	mentionID := chi.URLParam(r, "mentionID")
	if mentionID == "" {
		WriteAPIError(w, BadReq("mentionID is required"))
		return
	}

	var mention schema.Mention
	err := db.Select().
		Model(&schema.Mention{}).
		Where("id = ?", mentionID).
		First(r.Context(), &mention)

	if err != nil {
		WriteAPIError(w, NotFound("mention not found").Wrap(err))
		return
	}

	WriteJSON(w, http.StatusOK, mention)
}

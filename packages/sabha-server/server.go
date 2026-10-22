package sabhaserver

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
	"github.com/go-chi/chi/v5/middleware"
)

// Server encapsulates the Chi router and database connection for Sabha.
type Server struct {
	db     *sabhadb.DB
	router chi.Router
}

// New initializes the central server with Chi router and middleware.
func New(db *sabhadb.DB) *Server {
	s := &Server{
		db:     db,
		router: chi.NewRouter(),
	}

	s.router.Use(middleware.RequestID)
	s.router.Use(middleware.RealIP)
	s.router.Use(middleware.Recoverer)

	s.registerRoutes()
	return s
}

// Router returns the underlying http.Handler.
func (s *Server) Router() http.Handler {
	return s.router
}

func (s *Server) registerRoutes() {
	s.router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	// Agent registration
	s.router.Post("/agents/register", s.handleRegisterAgent)

	// Channel writes
	s.router.Post("/channels", s.handleCreateChannel)
	s.router.Get("/channels", s.handleListChannels)

	// Message writes (both scoped to channel and unified destination)
	s.router.Post("/channels/{channelID}/messages", s.handleSendChannelMessage)
	s.router.Post("/messages", s.handleSendMessage)
}

func generateID(prefix string) string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%s_%s", prefix, hex.EncodeToString(b))
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// -------------------------------------------------------------------------
// AGENT REGISTRATION
// -------------------------------------------------------------------------

type RegisterAgentRequest struct {
	Name string `json:"name"`
	Role string `json:"role,omitempty"`
}

func (s *Server) handleRegisterAgent(w http.ResponseWriter, r *http.Request) {
	var req RegisterAgentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json payload")
		return
	}

	if strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	role := strings.TrimSpace(req.Role)
	if role == "" {
		role = "worker"
	}

	agent := schema.Agent{
		ID:        generateID("agent"),
		Name:      req.Name,
		Role:      role,
		Status:    schema.AgentStatusIdle,
		CreatedAt: time.Now().UnixMilli(),
	}

	if _, err := s.db.Insert(&agent).Exec(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to register agent: %s", err.Error()))
		return
	}

	writeJSON(w, http.StatusCreated, agent)
}

// -------------------------------------------------------------------------
// CHANNEL CREATION
// -------------------------------------------------------------------------

type CreateChannelRequest struct {
	Name    string `json:"name"`
	Topic   string `json:"topic,omitempty"`
	ModOnly bool   `json:"mod_only,omitempty"`
}

func (s *Server) handleCreateChannel(w http.ResponseWriter, r *http.Request) {
	var req CreateChannelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json payload")
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeError(w, http.StatusBadRequest, "channel name is required")
		return
	}

	now := time.Now().UnixMilli()
	ch := schema.Channel{
		ID:        generateID("chan"),
		Name:      name,
		Type:      schema.ChannelTypeText,
		Topic:     req.Topic,
		ModOnly:   req.ModOnly,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if _, err := s.db.Insert(&ch).Exec(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to create channel: %s", err.Error()))
		return
	}

	writeJSON(w, http.StatusCreated, ch)
}

func (s *Server) handleListChannels(w http.ResponseWriter, r *http.Request) {
	var channels []schema.Channel
	err := s.db.Select().
		Model(&schema.Channel{}).
		OrderBy("created_at ASC").
		Find(r.Context(), &channels)

	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to list channels: %s", err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, channels)
}

// -------------------------------------------------------------------------
// MESSAGE SENDING
// -------------------------------------------------------------------------

type SendMessageRequest struct {
	ReceiverID string   `json:"receiver_id,omitempty"` // populated automatically if sent via /channels/{id}/messages
	SenderID   string   `json:"sender_id"`
	Content    string   `json:"content"`
	Mentions   []string `json:"mentions,omitempty"`     // explicit agent IDs mentioned
}

func (s *Server) handleSendChannelMessage(w http.ResponseWriter, r *http.Request) {
	channelID := chi.URLParam(r, "channelID")
	if channelID == "" {
		writeError(w, http.StatusBadRequest, "channelID is required")
		return
	}

	var req SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json payload")
		return
	}
	req.ReceiverID = channelID

	s.processSendMessage(w, r, req)
}

func (s *Server) handleSendMessage(w http.ResponseWriter, r *http.Request) {
	var req SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json payload")
		return
	}

	s.processSendMessage(w, r, req)
}

var mentionRegex = regexp.MustCompile(`@([a-zA-Z0-9_\-]+)`)

func (s *Server) processSendMessage(w http.ResponseWriter, r *http.Request, req SendMessageRequest) {
	ctx := r.Context()

	if strings.TrimSpace(req.ReceiverID) == "" {
		writeError(w, http.StatusBadRequest, "receiver_id is required")
		return
	}
	if strings.TrimSpace(req.SenderID) == "" {
		writeError(w, http.StatusBadRequest, "sender_id is required (identifies the agent)")
		return
	}
	if strings.TrimSpace(req.Content) == "" {
		writeError(w, http.StatusBadRequest, "content cannot be empty")
		return
	}

	// 1. Verify that channel exists
	var channel schema.Channel
	err := s.db.Select().
		Model(&schema.Channel{}).
		Where("id = ?", req.ReceiverID).
		First(ctx, &channel)
	if err != nil {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}

	// 2. Extract mentions from payload or parse from content (@agent_xxx)
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

	// 3. Create message record
	msg := schema.Message{
		ID:         generateID("msg"),
		ReceiverID: req.ReceiverID,
		SenderID:   req.SenderID,
		Content:    req.Content,
		SentAt:     time.Now().UnixMilli(),
	}

	// 4. Insert message and normalized mentions in a transaction
	err = s.db.Transaction(ctx, func(tx *orm.Tx) error {
		if _, err := tx.Insert(&msg).Exec(ctx); err != nil {
			return err
		}

		for targetAgent := range mentionSet {
			men := schema.Mention{
				ID:        generateID("men"),
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
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to send message: %s", err.Error()))
		return
	}

	writeJSON(w, http.StatusCreated, msg)
}

package internal

// RegisterAgentRequest holds the payload to register an agent in Sabha.
type RegisterAgentRequest struct {
	Name string `json:"name"`
	Role string `json:"role,omitempty"` // defaults to "worker"
}

// CreateChannelRequest holds the payload to create a text channel.
type CreateChannelRequest struct {
	Name    string `json:"name"`
	Topic   string `json:"topic,omitempty"`
	ModOnly bool   `json:"mod_only,omitempty"`
}

// SendMessageRequest holds the payload to send a message to a channel.
type SendMessageRequest struct {
	ReceiverID  string   `json:"receiver_id,omitempty"` // populated automatically if sent via /channels/{id}/messages
	SenderID    string   `json:"sender_id"`
	Content     string   `json:"content"`
	Mentions    []string `json:"mentions,omitempty"`     // explicit agent IDs mentioned
	MentionType string   `json:"mention_type,omitempty"` // "info" (default) or "action"
}

// SubscribeWebhookRequest holds an agent's registration of its wake-up listener URL.
type SubscribeWebhookRequest struct {
	AgentID    string `json:"agent_id"`
	WebhookURL string `json:"webhook_url"`
}

// MarkActionRequest holds the outcome of an action taken by an agent.
type MarkActionRequest struct {
	SessionID string `json:"session_id,omitempty"` // Bound session identifier
	Status    string `json:"status"`               // "completed" or "failed"
	Error     string `json:"error,omitempty"`      // Error details if status == "failed"
	Result    string `json:"result,omitempty"`     // Result summary or artifact details if completed
}

// WebhookEventPayload is the JSON body posted to the agent's webhook URL to wake it up.
type WebhookEventPayload struct {
	Event          string `json:"event"`
	MentionID      string `json:"mention_id"`
	SessionID      string `json:"session_id,omitempty"` // Explicit session ID bound to this task
	Type           string `json:"type"`                 // "info" or "action"
	ActionRequired bool   `json:"action_required"`      // true if Type == "action"
	ChannelID      string `json:"channel_id"`
	SenderID       string `json:"sender_id"`
	Content        string `json:"content"`
	SentAt         int64  `json:"sent_at"`
}

// ActionResultPayload is fired back to the commanding agent when a worker finishes or fails.
type ActionResultPayload struct {
	Event     string `json:"event"`
	MentionID string `json:"mention_id"`
	SessionID string `json:"session_id"`
	WorkerID  string `json:"worker_id"`
	ChannelID string `json:"channel_id"`
	Status    string `json:"status"` // "completed" or "failed"
	Error     string `json:"error,omitempty"`
	Result    string `json:"result,omitempty"`
}

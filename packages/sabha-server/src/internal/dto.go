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
	ReceiverID string   `json:"receiver_id,omitempty"` // populated automatically if sent via /channels/{id}/messages
	SenderID   string   `json:"sender_id"`
	Content    string   `json:"content"`
	Mentions   []string `json:"mentions,omitempty"` // explicit agent IDs mentioned
}

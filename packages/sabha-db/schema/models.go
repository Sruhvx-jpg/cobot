package schema

// ChannelType distinguishes public channels from 1-on-1 agent direct messages.
type ChannelType string

const (
	ChannelTypeText ChannelType = "text"
	ChannelTypeDM   ChannelType = "dm"
)

// Channel is the top-level chat space or a 1-on-1 private direct message between agents.
type Channel struct {
	ID        string      `chai:"id;primaryKey" json:"id"`
	Name      string      `chai:"name;notnull" json:"name"`
	Type      ChannelType `chai:"type;notnull" json:"type"`
	Topic     string      `chai:"topic" json:"topic,omitempty"`          // Operational context/directives for agents
	ModOnly   bool        `chai:"mod_only" json:"mod_only"`              // Restrict write access to authoritative/moderator agents
	CreatedAt int64       `chai:"created_at;notnull" json:"created_at"`
	UpdatedAt int64       `chai:"updated_at;notnull" json:"updated_at"`
}

// Message is an append-only sequential event record.
//
// Aggregation & Hydration are anchored around three primary dimensions:
// 1. ReceiverID: Destination scope (Channel ID or direct target Agent ID)
// 2. SenderID: Originating Agent ID
// 3. SentAt: UNIX millisecond timestamp for cursor windowing and timeout detection
type Message struct {
	ID         string `chai:"id;primaryKey" json:"id"`
	ReceiverID string `chai:"receiver_id;notnull;index:idx_receiver_sentat,priority:1" json:"receiver_id"`
	SenderID   string `chai:"sender_id;notnull;index" json:"sender_id"`
	Content    string `chai:"content;notnull" json:"content"`
	SentAt     int64  `chai:"sent_at;notnull;index:idx_receiver_sentat,priority:2" json:"sent_at"`
}

// MentionType distinguishes informational pings from actionable task requests.
type MentionType string

const (
	MentionTypeInfo   MentionType = "info"   // FYI / Notice only
	MentionTypeAction MentionType = "action" // Action required
)

// ActionStatus tracks whether the target agent executed the requested action.
type ActionStatus string

const (
	ActionStatusNone      ActionStatus = "none"      // for "info" pings
	ActionStatusPending   ActionStatus = "pending"   // waiting for agent action
	ActionStatusCompleted ActionStatus = "completed" // agent executed the task
	ActionStatusFailed    ActionStatus = "failed"    // agent tried and failed
)

// Mention models explicit agent mentions/pings inside a message.
// Normalized into its own table so wake-up and interrupt dispatchers
// can query pending mentions for a specific agent via a single indexed lookup.
type Mention struct {
	ID           string       `chai:"id;primaryKey" json:"id"`
	MessageID    string       `chai:"message_id;notnull;index" json:"message_id"`
	AgentID      string       `chai:"agent_id;notnull;index" json:"agent_id"` // Target agent receiving the interrupt/wake-up
	Type         MentionType  `chai:"type;notnull" json:"type"`               // "info" or "action"
	IsRead       bool         `chai:"is_read" json:"is_read"`
	ReadAt       int64        `chai:"read_at" json:"read_at,omitempty"`
	ActionStatus ActionStatus `chai:"action_status;notnull" json:"action_status"`
	ActionAt     int64        `chai:"action_at" json:"action_at,omitempty"`
	Result       string       `chai:"result" json:"result,omitempty"`
	Error        string       `chai:"error" json:"error,omitempty"`
}

// AgentStatus represents the real-time execution state of an agent.
type AgentStatus string

const (
	AgentStatusIdle    AgentStatus = "idle"
	AgentStatusBusy    AgentStatus = "busy"
	AgentStatusOffline AgentStatus = "offline"
)

// Agent represents an autonomous worker, reviewer, or lead actor registered in Sabha.
type Agent struct {
	ID        string      `chai:"id;primaryKey" json:"id"`
	Name      string      `chai:"name;notnull" json:"name"`
	Role      string      `chai:"role;notnull" json:"role"` // e.g. "lead", "coder", "reviewer"
	Status    AgentStatus `chai:"status;notnull" json:"status"`
	CreatedAt int64       `chai:"created_at;notnull" json:"created_at"`
}

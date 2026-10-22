package internal

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"
)

// EventBroker manages targeted and global SSE client streams.
type EventBroker struct {
	mu            sync.RWMutex
	agentClients  map[string]map[chan []byte]bool // agentID -> set of client channels
	globalClients map[chan []byte]bool            // global listeners (monitors, desktop)
}

// NewEventBroker initializes a thread-safe EventBroker.
func NewEventBroker() *EventBroker {
	return &EventBroker{
		agentClients:  make(map[string]map[chan []byte]bool),
		globalClients: make(map[chan []byte]bool),
	}
}

// SubscribeAgent registers an SSE listener specifically for events targeting a commanding agent.
func (b *EventBroker) SubscribeAgent(agentID string) chan []byte {
	b.mu.Lock()
	defer b.mu.Unlock()

	ch := make(chan []byte, 32)
	if _, ok := b.agentClients[agentID]; !ok {
		b.agentClients[agentID] = make(map[chan []byte]bool)
	}
	b.agentClients[agentID][ch] = true
	return ch
}

// UnsubscribeAgent unregisters and closes an agent's SSE listener channel.
func (b *EventBroker) UnsubscribeAgent(agentID string, ch chan []byte) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if clients, ok := b.agentClients[agentID]; ok {
		delete(clients, ch)
		close(ch)
		if len(clients) == 0 {
			delete(b.agentClients, agentID)
		}
	}
}

// SubscribeGlobal registers a global listener channel.
func (b *EventBroker) SubscribeGlobal() chan []byte {
	b.mu.Lock()
	defer b.mu.Unlock()

	ch := make(chan []byte, 32)
	b.globalClients[ch] = true
	return ch
}

// UnsubscribeGlobal unregisters a global listener channel.
func (b *EventBroker) UnsubscribeGlobal(ch chan []byte) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if _, ok := b.globalClients[ch]; ok {
		delete(b.globalClients, ch)
		close(ch)
	}
}

// SendToAgent streams an event specifically to the commanding agent.
func (b *EventBroker) SendToAgent(targetAgentID, eventName string, data any) {
	frameBytes := formatSSEFrame(eventName, data)
	if frameBytes == nil {
		return
	}

	b.mu.RLock()
	defer b.mu.RUnlock()

	if clients, ok := b.agentClients[targetAgentID]; ok {
		for ch := range clients {
			select {
			case ch <- frameBytes:
			default:
			}
		}
	}

	// Also fan out to global observers (desktop shell, tracer-duty)
	for ch := range b.globalClients {
		select {
		case ch <- frameBytes:
		default:
		}
	}
}

// Broadcast sends an event to all global listeners.
func (b *EventBroker) Broadcast(eventName string, data any) {
	frameBytes := formatSSEFrame(eventName, data)
	if frameBytes == nil {
		return
	}

	b.mu.RLock()
	defer b.mu.RUnlock()

	for ch := range b.globalClients {
		select {
		case ch <- frameBytes:
		default:
		}
	}
}

func formatSSEFrame(eventName string, data any) []byte {
	jsonBytes, err := json.Marshal(data)
	if err != nil {
		return nil
	}
	return []byte(fmt.Sprintf("event: %s\ndata: %s\n\n", eventName, string(jsonBytes)))
}

// HandleAgentSSE opens an SSE stream for the commanding agent to receive live updates from commanded agents.
func HandleAgentSSE(broker *EventBroker, w http.ResponseWriter, r *http.Request) {
	agentID := chi.URLParam(r, "agentID")
	if agentID == "" {
		WriteAPIError(w, BadReq("agentID is required"))
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		WriteAPIError(w, BadReq("streaming unsupported by client"))
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	ch := broker.SubscribeAgent(agentID)
	defer broker.UnsubscribeAgent(agentID, ch)

	// Send initial handshake frame
	_, _ = w.Write([]byte(fmt.Sprintf("event: connected\ndata: {\"status\":\"connected\",\"agent_id\":\"%s\"}\n\n", agentID)))
	flusher.Flush()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			if _, err := w.Write(msg); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

// HandleGlobalSSE opens a global stream for monitors and debuggers.
func HandleGlobalSSE(broker *EventBroker, w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		WriteAPIError(w, BadReq("streaming unsupported by client"))
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	ch := broker.SubscribeGlobal()
	defer broker.UnsubscribeGlobal(ch)

	_, _ = w.Write([]byte("event: connected\ndata: {\"status\":\"connected\",\"stream\":\"global\"}\n\n"))
	flusher.Flush()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			if _, err := w.Write(msg); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

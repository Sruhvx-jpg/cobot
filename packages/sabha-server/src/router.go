package sabhaserver

import (
	"net/http"

	"github.com/Sruhvx-jpg/cobot/packages/sabha-server/src/internal"
)

func (s *Server) registerRoutes() {
	s.router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		internal.WriteJSON(w, http.StatusOK, map[string]string{
			"status":  "ok",
			"version": "unstable-alpha-prototype.V0",
		})
	})

	// Agent registration
	s.router.Post("/agents/register", func(w http.ResponseWriter, r *http.Request) {
		internal.HandleRegisterAgent(s.db, w, r)
	})

	// Channel routes
	s.router.Post("/channels", func(w http.ResponseWriter, r *http.Request) {
		internal.HandleCreateChannel(s.db, w, r)
	})
	s.router.Get("/channels", func(w http.ResponseWriter, r *http.Request) {
		internal.HandleListChannels(s.db, w, r)
	})

	// Webhook subscriptions
	s.router.Post("/webhooks/subscribe", func(w http.ResponseWriter, r *http.Request) {
		internal.HandleSubscribeWebhook(s.registry, w, r)
	})

	// Message routes (triggers wake-up webhooks with bound session_id)
	s.router.Post("/channels/{channelID}/messages", func(w http.ResponseWriter, r *http.Request) {
		internal.HandleSendChannelMessage(s.db, s.registry, w, r)
	})
	s.router.Post("/messages", func(w http.ResponseWriter, r *http.Request) {
		internal.HandleSendMessage(s.db, s.registry, w, r)
	})

	// Mention action markers
	s.router.Post("/mentions/{mentionID}/read", func(w http.ResponseWriter, r *http.Request) {
		internal.HandleMarkMentionRead(s.db, w, r)
	})
	s.router.Post("/mentions/{mentionID}/action", func(w http.ResponseWriter, r *http.Request) {
		internal.HandleMarkMentionAction(s.db, s.registry, s.broker, w, r)
	})

	// Targeted SSE stream: Commanding agent receives live action streams from commanded agents
	s.router.Get("/agents/{agentID}/events", func(w http.ResponseWriter, r *http.Request) {
		internal.HandleAgentSSE(s.broker, w, r)
	})

	// Global SSE stream for observers/debuggers
	s.router.Get("/events", func(w http.ResponseWriter, r *http.Request) {
		internal.HandleGlobalSSE(s.broker, w, r)
	})
}

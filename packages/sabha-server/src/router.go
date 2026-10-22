package sabhaserver

import (
	"net/http"

	"github.com/Sruhvx-jpg/cobot/packages/sabha-server/src/internal"
)

func (s *Server) registerRoutes() {
	s.router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		internal.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
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

	// Message routes
	s.router.Post("/channels/{channelID}/messages", func(w http.ResponseWriter, r *http.Request) {
		internal.HandleSendChannelMessage(s.db, w, r)
	})
	s.router.Post("/messages", func(w http.ResponseWriter, r *http.Request) {
		internal.HandleSendMessage(s.db, w, r)
	})
}

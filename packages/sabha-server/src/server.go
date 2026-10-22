package sabhaserver

import (
	"net/http"
	"sync"

	sabhadb "github.com/Sruhvx-jpg/cobot/packages/sabha-db"
	"github.com/Sruhvx-jpg/cobot/packages/sabha-server/src/internal"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// Server encapsulates the Chi router, database connection, webhook registry, and SSE broker for Sabha.
type Server struct {
	db       *sabhadb.DB
	registry *sync.Map
	broker   *internal.EventBroker
	router   chi.Router
}

// New initializes the central server with Chi router, webhook registry, and SSE event broker.
func New(db *sabhadb.DB) *Server {
	s := &Server{
		db:       db,
		registry: &sync.Map{},
		broker:   internal.NewEventBroker(),
		router:   chi.NewRouter(),
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
